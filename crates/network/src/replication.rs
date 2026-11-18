//! Public text replicas. Private room membership and history never enter this protocol.
use crate::{model::*, peer::Node, store::Store};
use anyhow::{Context, Result, ensure};
use iroh::EndpointAddr;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};

async fn small_json<T: serde::de::DeserializeOwned>(request: reqwest::RequestBuilder) -> Result<T> {
    let response = request.send().await?.error_for_status()?;
    let bytes = crate::moderation_peer::bounded_response(response, 512 * 1024).await?;
    Ok(serde_json::from_slice(&bytes)?)
}
pub(crate) fn init(store: &Store) -> Result<()> {
    store.db.execute_batch("CREATE TABLE IF NOT EXISTS post_follows(author TEXT PRIMARY KEY,cursor INTEGER NOT NULL DEFAULT 0,checked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS post_copies(id TEXT PRIMARY KEY,author TEXT NOT NULL,bytes INTEGER NOT NULL,data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS copies_author ON post_copies(author);
    CREATE TABLE IF NOT EXISTS copy_changes(id TEXT PRIMARY KEY,have INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS post_totals(author TEXT PRIMARY KEY,n INTEGER NOT NULL,bytes INTEGER NOT NULL);
    CREATE TRIGGER IF NOT EXISTS copy_added AFTER INSERT ON post_copies BEGIN INSERT INTO copy_changes VALUES(new.id,1) ON CONFLICT(id) DO UPDATE SET have=1; INSERT INTO post_totals VALUES(new.author,1,new.bytes) ON CONFLICT(author) DO UPDATE SET n=n+1,bytes=bytes+new.bytes; END;
    CREATE TRIGGER IF NOT EXISTS copy_removed AFTER DELETE ON post_copies BEGIN INSERT INTO copy_changes VALUES(old.id,0) ON CONFLICT(id) DO UPDATE SET have=0; UPDATE post_totals SET n=n-1,bytes=bytes-old.bytes WHERE author=old.author; END;")?;
    let tx = store.db.unchecked_transaction()?;
    if !store
        .get::<bool>("post-original-inventory-v1")?
        .unwrap_or(false)
    {
        tx.execute_batch("CREATE TABLE post_originals(id TEXT PRIMARY KEY);
            INSERT INTO post_originals SELECT json_extract(data,'$.payload.id') FROM kv WHERE key GLOB 'published:*' AND json_extract(data,'$.payload.kind')='post';
            CREATE TRIGGER original_saved AFTER INSERT ON kv WHEN new.key GLOB 'published:*' AND json_extract(new.data,'$.payload.kind')='post' BEGIN
              INSERT OR IGNORE INTO post_originals VALUES(json_extract(new.data,'$.payload.id'));
              INSERT INTO copy_changes VALUES(json_extract(new.data,'$.payload.id'),1) ON CONFLICT(id) DO UPDATE SET have=1; END;
            CREATE TRIGGER original_released AFTER DELETE ON kv WHEN old.key GLOB 'published:*' AND json_extract(old.data,'$.payload.kind')='post' BEGIN
              DELETE FROM post_originals WHERE id=json_extract(old.data,'$.payload.id');
              INSERT INTO copy_changes VALUES(json_extract(old.data,'$.payload.id'),0) ON CONFLICT(id) DO UPDATE SET have=0; END;
            CREATE INDEX published_nonposts ON kv(key) WHERE key GLOB 'published:*' AND json_extract(data,'$.payload.kind')<>'post';")?;
        store.set("post-original-inventory-v1", &true)?;
    }
    tx.commit()?;
    Ok(())
}
#[derive(Clone, Serialize, Deserialize)]
pub struct PostStorage {
    pub follows: Vec<String>,
    pub follow_names: std::collections::BTreeMap<String, String>,
    pub budget_mb: u64,
    pub community_bytes: u64,
    pub community_posts: u64,
    pub followed_posts: u64,
    pub sync_error: Option<String>,
}
pub fn status(s: &Store) -> Result<PostStorage> {
    let follows =
        s.db.prepare("SELECT author FROM post_follows ORDER BY author")?
            .query_map([], |r| r.get(0))?
            .collect::<rusqlite::Result<_>>()?;
    let (community_bytes,community_posts,followed_posts)=s.db.query_row("SELECT coalesce(sum(CASE WHEN f.author IS NULL THEN bytes ELSE 0 END),0),coalesce(sum(CASE WHEN f.author IS NULL THEN n ELSE 0 END),0),coalesce(sum(CASE WHEN f.author IS NOT NULL THEN n ELSE 0 END),0) FROM post_totals c LEFT JOIN post_follows f ON f.author=c.author",[],|r|Ok((r.get::<_,i64>(0)? as u64,r.get::<_,i64>(1)? as u64,r.get::<_,i64>(2)? as u64)))?;
    Ok(PostStorage {
        follow_names:s.db.prepare("SELECT f.author,coalesce((SELECT json_extract(c.data,'$.payload.owner_name') FROM post_copies c WHERE c.author=f.author LIMIT 1),'') FROM post_follows f")?.query_map([],|r|Ok((r.get(0)?,r.get(1)?)))?.collect::<rusqlite::Result<_>>()?,
        follows,
        budget_mb: s.get("post-budget")?.unwrap_or(0),
        community_bytes,
        community_posts,
        followed_posts,
        sync_error: s.get("post-sync-error")?.flatten(),
    })
}
#[derive(Serialize, Deserialize)]
pub struct Beat {
    pub registry: String,
    pub nonce: String,
    pub created: u64,
    pub address: EndpointAddr,
    pub free: u64,
    pub session: String,
    pub changes: Vec<(String, bool)>,
    pub after: String,
    pub inventory: Vec<String>,
    pub end: bool,
    pub replaceable: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Hint {
    pub id: String,
    pub signature: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub replace: Option<String>,
    pub providers: Vec<EndpointAddr>,
}
#[derive(Serialize, Deserialize)]
pub struct FeedPage {
    pub after: i64,
    pub items: Vec<Hint>,
}
#[derive(Serialize, Deserialize)]
pub struct Plan {
    pub offers: Vec<Hint>,
}
const BATCH: usize = 64;
impl Node {
    fn spare_post_bytes(&self, storage: &PostStorage) -> Result<u64> {
        let budget = (storage.budget_mb * 1024 * 1024).saturating_sub(storage.community_bytes);
        if budget == 0 {
            return Ok(0);
        }
        // Leave the OS headroom. The tracker receives only capacity volunteered to xNet.
        Ok(budget.min(fs2::available_space(&self.root)?.saturating_sub(128 * 1024 * 1024)))
    }
    pub fn follow_posts(&self, author: &str, follow: bool) -> Result<()> {
        ensure!(
            valid_id(author) && author != self.endpoint.id().to_string(),
            "Choose another author"
        );
        let s = self.store.lock().unwrap();
        let tx = s.db.unchecked_transaction()?;
        if follow {
            s.db.execute(
                "INSERT OR IGNORE INTO post_follows(author) VALUES(?)",
                [author],
            )?;
        } else {
            s.db.execute("DELETE FROM post_follows WHERE author=?", [author])?;
            // Unfollowing releases this commitment; don't silently charge it to the donation budget.
            s.db.execute("DELETE FROM post_copies WHERE author=?", [author])?;
        }
        tx.commit()?;
        self.post_wake.notify_one();
        Ok(())
    }
    pub fn post_budget(&self, mb: u64) -> Result<()> {
        ensure!(mb <= 100_000, "Maximum public post donation is 100,000 MB");
        let s = self.store.lock().unwrap();
        let tx = s.db.unchecked_transaction()?;
        s.set("post-budget", &mb)?;
        s.db.execute("DELETE FROM post_copies WHERE id IN (SELECT id FROM (SELECT id,sum(bytes) OVER(ORDER BY rowid DESC) total FROM post_copies WHERE author NOT IN (SELECT author FROM post_follows)) WHERE total>?)",[mb as i64*1024*1024])?;
        tx.commit()?;
        self.post_wake.notify_one();
        Ok(())
    }
    fn keep_post(
        &self,
        record: &Signed<Record>,
        follow: Option<&str>,
        replace: Option<&str>,
    ) -> Result<()> {
        record.verify()?;
        record.payload.validate()?;
        ensure!(
            record.payload.kind == "post" && follow.is_none_or(|a| a == record.author),
            "Wrong public post"
        );
        if self.preferences()?.hides(record) || record.author == self.endpoint.id().to_string() {
            return Ok(());
        }
        let raw = serde_json::to_string(record)?;
        let s = self.store.lock().unwrap();
        ensure!(
            Self::participation_state(&s)?.3 == "Hosting enabled",
            "Hosting paused while fetching a public post"
        );
        let followed: bool = s.db.query_row(
            "SELECT EXISTS(SELECT 1 FROM post_follows WHERE author=?)",
            [&record.author],
            |r| r.get(0),
        )?;
        if follow.is_some() && !followed {
            return Ok(());
        }
        let tx = s.db.unchecked_transaction()?;
        if !followed {
            let storage = status(&s)?;
            if self.spare_post_bytes(&storage)? < raw.len() as u64 {
                let Some(old) = replace else { return Ok(()) };
                ensure!(
                    valid_id(old) && old != record.payload.id,
                    "Invalid replacement"
                );
                // A follow or a changed budget wins over an in-flight suggestion.
                if tx.execute("DELETE FROM post_copies WHERE id=? AND author NOT IN (SELECT author FROM post_follows)",[old])?==0 || self.spare_post_bytes(&status(&s)?)? < raw.len() as u64 {return Ok(())}
            }
        }
        let added = tx.execute(
            "INSERT OR IGNORE INTO post_copies VALUES(?,?,?,?)",
            params![record.payload.id, record.author, raw.len() as i64, raw],
        )?;
        if added == 0 {
            return Ok(());
        } // rollback any proposed swap
        tx.commit()?;

        Ok(())
    }
    pub(crate) async fn readable_post(&self, id: &str) -> Result<Signed<Record>> {
        ensure!(valid_id(id), "Invalid post ID");
        let record: Signed<Record> = {
            let s = self.store.lock().unwrap();
            if let Some(r) = s.get(&format!("published:{id}"))? {
                r
            } else {
                let raw: String =
                    s.db.query_row("SELECT data FROM post_copies WHERE id=?", [id], |r| {
                        r.get(0)
                    })
                    .context("No local copy")?;
                serde_json::from_str(&raw)?
            }
        };
        ensure!(
            record.payload.kind == "post" && !self.preferences()?.hides(&record),
            "Post unavailable"
        );
        self.public_allowed(&record).await?;
        if record.payload.reply_to.is_some() {
            self.lookup(id).await?;
        } // includes restrictions on ancestors
        Ok(record)
    }
    async fn fetch_post(&self, h: &Hint) -> Result<Signed<Record>> {
        ensure!(
            valid_id(&h.id) && h.providers.len() <= 64,
            "Invalid post offer"
        );
        use rand::seq::SliceRandom;
        let mut providers = h.providers.clone();
        providers.shuffle(&mut rand::thread_rng());
        for provider in providers
            .into_iter()
            .filter(|a| a.id != self.endpoint.id())
            .take(3)
        {
            let req = PeerRequest::PublicPost { id: h.id.clone() };
            let get = async {
                if self.direct_endpoint.is_some() {
                    self.direct_request(&provider, PeerRequest::PostRoute { id: h.id.clone() }, req)
                        .await
                } else {
                    self.request(provider, req).await
                }
            };
            if let Ok(Ok(PeerResponse::PublicPost { record })) =
                tokio::time::timeout(Duration::from_secs(3), get).await
            {
                if record.signature == h.signature
                    && record.payload.id == h.id
                    && record.payload.kind == "post"
                    && record.verify().is_ok()
                    && record.payload.validate().is_ok()
                {
                    self.public_allowed(&record).await?;
                    return Ok(record);
                }
            }
        }
        // Today's searchable public text registry has the signed original. It can reseed a zero-copy post.
        let item: CatalogItem = small_json(
            self.client
                .get(format!("{}/api/items/{}", self.registry, h.id)),
        )
        .await?;
        ensure!(
            item.record.payload.id == h.id
                && item.record.signature == h.signature
                && item.record.payload.kind == "post",
            "Registry returned a different post"
        );
        item.record.verify()?;
        item.record.payload.validate()?;
        self.public_allowed(&item.record).await?;
        Ok(item.record)
    }
    async fn ingest(&self, h: &Hint, author: Option<&str>) -> Result<()> {
        let present: bool = self.store.lock().unwrap().db.query_row(
            "SELECT EXISTS(SELECT 1 FROM post_copies WHERE id=?)",
            [&h.id],
            |r| r.get(0),
        )?;
        if !present {
            let r = self.fetch_post(h).await?;
            self.keep_post(&r, author, h.replace.as_deref())?;
        }
        Ok(())
    }
    pub async fn sync_posts(&self) -> Result<()> {
        let _run = self.post_sync.lock().await;
        self.require_active()?;
        let follow_jobs = {
            let s = self.store.lock().unwrap();
            s.db.prepare("SELECT author,cursor FROM post_follows ORDER BY checked,author LIMIT 4")?
                .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
                .collect::<rusqlite::Result<Vec<_>>>()?
        };
        let mut failure = None;
        for (author, cursor) in follow_jobs {
            self.store.lock().unwrap().db.execute(
                "UPDATE post_follows SET checked=(SELECT coalesce(max(checked),0)+1 FROM post_follows) WHERE author=?",
                [&author],
            )?;
            let result = tokio::time::timeout(Duration::from_secs(8), async {
                let page: FeedPage = small_json(
                    self.client
                        .get(format!("{}/api/post-author", self.registry))
                        .query(&[("author", author.clone()), ("after", cursor.to_string())]),
                )
                .await?;
                ensure!(
                    page.after >= cursor && page.items.len() <= 32,
                    "Invalid author page"
                );
                for h in page.items {
                    self.ingest(&h, Some(&author)).await?;
                }
                self.store.lock().unwrap().db.execute(
                    "UPDATE post_follows SET cursor=? WHERE author=? AND cursor=?",
                    params![page.after, author, cursor],
                )?;
                Ok::<_, anyhow::Error>(())
            })
            .await
            .unwrap_or_else(|_| Err(anyhow::anyhow!("Followed posts are still catching up")));
            if let Err(e) = result {
                failure = Some(e);
            }
        }
        let authority = self.registry_policy(false).await?.registry_id;
        let beat = {
            let s = self.store.lock().unwrap();
            let storage = status(&s)?;
            let after = s.get::<String>("post-audit")?.unwrap_or_default();
            let ids =
                s.db.prepare("SELECT id FROM post_copies WHERE id>?1 UNION SELECT id FROM post_originals WHERE id>?1 ORDER BY id LIMIT 65")?
                    .query_map([&after], |r| r.get(0))?
                    .collect::<rusqlite::Result<Vec<String>>>()?;
            let changes =
                s.db.prepare("SELECT id,have FROM copy_changes ORDER BY have,id LIMIT 64")?
                    .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
                    .collect::<rusqlite::Result<_>>()?;
            let replaceable=s.db.prepare("SELECT id FROM post_copies WHERE id>? AND author NOT IN (SELECT author FROM post_follows) ORDER BY id LIMIT 16")?.query_map([&after],|r|r.get(0))?.collect::<rusqlite::Result<_>>()?;
            Beat {
                replaceable,
                registry: authority,
                session: self.post_session.clone(),
                address: self.routing_address(),
                created: now(),
                nonce: digest(&rand::random::<[u8; 32]>()),
                free: self.spare_post_bytes(&storage)?,
                changes,
                after,
                end: ids.len() <= BATCH,
                inventory: ids.into_iter().take(BATCH).collect(),
            }
        };
        self.register_relay(None).await?;
        let signed = Signed::new(beat, &self.key)?;
        let plan: Plan = small_json(
            self.client
                .post(format!("{}/api/post-replicas", self.registry))
                .json(&signed),
        )
        .await?;
        ensure!(plan.offers.len() <= 8, "Too many post offers");
        {
            let s = self.store.lock().unwrap();
            let tx = s.db.unchecked_transaction()?;
            for (id, have) in &signed.payload.changes {
                s.db.execute(
                    "DELETE FROM copy_changes WHERE id=? AND have=?",
                    params![id, have],
                )?;
            }
            s.set(
                "post-audit",
                &if signed.payload.end {
                    ""
                } else {
                    signed
                        .payload
                        .inventory
                        .last()
                        .context("Missing inventory boundary")?
                },
            )?;
            tx.commit()?;
        }
        for offer in plan.offers {
            ensure!(
                offer
                    .replace
                    .as_ref()
                    .is_none_or(|id| signed.payload.replaceable.contains(id)),
                "Unrequested replacement"
            );
            if let Err(e) = self.ingest(&offer, None).await {
                failure = Some(e);
            }
        }
        if let Some(e) = failure {
            return Err(e);
        }
        Ok(())
    }
    pub(crate) fn start_post_copies(node: &Arc<Self>) {
        let weak = Arc::downgrade(node);
        let wake = node.post_wake.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {_ = tokio::time::sleep(Duration::from_secs(45))=>{}, _ = wake.notified()=>{}}
                let Some(n) = weak.upgrade() else { break };
                if n.require_active().is_ok() {
                    let result = n.sync_posts().await;
                    let _ = n
                        .store
                        .lock()
                        .unwrap()
                        .set("post-sync-error", &result.err().map(|e| e.to_string()));
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn full_budget_accepts_only_an_atomic_exchange_and_never_evicts_a_follow() -> Result<()> {
        let root = tempfile::tempdir()?;
        let n = Node::start(root.path().to_owned(), "http://127.0.0.1:9".into()).await?;
        n.create_profile("Volunteer".into())?;
        n.configure(Participation {
            enabled: true,
            storage_mb: 16,
            upload_mb: 16,
        })
        .await?;
        n.post_budget(1)?;
        let followed = iroh::SecretKey::generate();
        let community = iroh::SecretKey::generate();
        let post = |i: u64, key: &iroh::SecretKey| {
            Signed::new(
                Record {
                    id: digest(&i.to_le_bytes()),
                    kind: "post".into(),
                    title: "Sketch".into(),
                    description: "🟦".repeat(280),
                    owner_name: "Club".into(),
                    created: now(),
                    size: 0,
                    mime: String::new(),
                    chunks: vec![],
                    reply_to: None,
                },
                key,
            )
        };
        let pin = post(0, &followed)?;
        n.follow_posts(&pin.author, true)?;
        n.keep_post(&pin, Some(&pin.author), None)?;
        let old = post(1, &community)?;
        let bytes = serde_json::to_vec(&old)?.len() as u64;
        let capacity = 1024 * 1024 / bytes;
        for i in 1..=capacity + 1 {
            n.keep_post(&post(i, &community)?, None, None)?;
        }
        assert_eq!(n.snapshot()?.post_storage.community_posts, capacity);
        let new = post(capacity + 2, &community)?;
        n.keep_post(&new, None, Some(&pin.payload.id))?;
        let has = |id: &str| -> Result<bool> {
            Ok(n.store.lock().unwrap().db.query_row(
                "SELECT EXISTS(SELECT 1 FROM post_copies WHERE id=?)",
                [id],
                |r| r.get(0),
            )?)
        };
        assert!(has(&pin.payload.id)? && !has(&new.payload.id)?);
        n.keep_post(&new, None, Some(&old.payload.id))?;
        assert!(has(&pin.payload.id)? && has(&new.payload.id)? && !has(&old.payload.id)?);
        assert_eq!(n.snapshot()?.post_storage.community_bytes, capacity * bytes);
        n.post_budget(0)?;
        assert!(has(&pin.payload.id)? && !has(&new.payload.id)?);
        Ok(())
    }
}
