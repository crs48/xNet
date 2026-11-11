//! Mounted inside the registry so assignments and moderation share the same transaction boundary.
use super::*;
use crate::replication::{Beat, FeedPage, Hint, Plan};

pub(super) fn init(s: &Store) -> Result<()> {
    s.db.execute_batch("CREATE TABLE IF NOT EXISTS replica_nodes(peer TEXT PRIMARY KEY,session TEXT NOT NULL,address TEXT NOT NULL,seen INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS replica_hours(peer TEXT NOT NULL,slot INTEGER NOT NULL,seen INTEGER NOT NULL,PRIMARY KEY(peer,slot));
    CREATE TABLE IF NOT EXISTS replica_haves(id TEXT NOT NULL,peer TEXT NOT NULL,PRIMARY KEY(id,peer));
    CREATE INDEX IF NOT EXISTS replica_inventory ON replica_haves(peer,id);
    CREATE TABLE IF NOT EXISTS replica_releases(id TEXT PRIMARY KEY,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS replica_offers(id TEXT NOT NULL,peer TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(id,peer));
    CREATE INDEX IF NOT EXISTS post_authors ON catalog(author,kind);")?;
    Ok(())
}
pub(super) fn routes() -> Router<Registry> {
    Router::new()
        .route("/api/post-author", get(author_feed))
        .route("/api/post-replicas", post(beat))
}

#[derive(Deserialize)]
struct AuthorPage {
    author: String,
    after: i64,
}
async fn author_feed(
    State(state): State<Registry>,
    Query(q): Query<AuthorPage>,
) -> Result<Json<FeedPage>, ApiError> {
    ensure!(
        valid_id(&q.author) && q.after >= 0,
        "Invalid author or cursor"
    );
    let s = state.store.lock().unwrap();
    let mut items = Vec::new();
    let mut after = q.after;
    let mut query=s.db.prepare("SELECT rowid,data FROM catalog WHERE author=? AND kind='post' AND rowid>? ORDER BY rowid LIMIT 32")?;
    for row in query.query_map(params![q.author, q.after], |r| {
        Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
    })? {
        let (n, raw) = row?;
        after = n;
        let r: Signed<Record> = serde_json::from_str(&raw)?;
        if available(&s, &r.payload.id)? {
            items.push(hint(&s, r)?);
        }
    }
    Ok(Json(FeedPage { after, items }))
}
fn hint(s: &Store, r: Signed<Record>) -> Result<Hint> {
    let id = r.payload.id.clone();
    let signature = r.signature.clone();
    Ok(Hint {
        id,
        signature,
        replace: None,
        providers: with_providers(s, r)?.providers,
    })
}
async fn beat(
    State(state): State<Registry>,
    Json(signed): Json<Signed<Beat>>,
) -> Result<Json<Plan>, ApiError> {
    signed.verify()?;
    let b = &signed.payload;
    let peer = &signed.author;
    ensure!(
        b.registry == state.key.public().to_string()
            && b.address.id.to_string() == *peer
            && valid_id(&b.session)
            && b.address.addrs.len() <= 12,
        "Invalid replica identity"
    );
    ensure!(
        b.free <= 100_000 * 1024 * 1024u64
            && b.replaceable.len() <= 16
            && b.replaceable.iter().all(|id| valid_id(id))
            && b.changes.len() <= 64
            && b.inventory.len() <= 64
            && (b.end || b.inventory.len() == 64)
            && (b.after.is_empty() || valid_id(&b.after))
            && b.changes.iter().all(|(id, _)| valid_id(id))
            && b.inventory.iter().all(|id| valid_id(id) && id > &b.after)
            && b.inventory.windows(2).all(|w| w[0] < w[1]),
        "Invalid replica inventory"
    );
    check_device(&state, peer).await?;
    let addr = if let Some(url) = &state.public_relay {
        ensure!(
            b.address.relay_urls().any(|a| a == url),
            "Missing hub route"
        );
        iroh::EndpointAddr::new(b.address.id).with_relay_url(url.clone())
    } else {
        b.address.clone()
    };
    let s = state.store.lock().unwrap();
    let tx = s.db.unchecked_transaction()?;
    moderation::validate_request(&s, &b.nonce, b.created)?;
    moderation::permits(&s, "registry", "", peer)?;
    moderation::remember_request(&s, &b.nonce)?;
    let t = now() as i64;
    let old: Option<String> = tx
        .query_row(
            "SELECT session FROM replica_nodes WHERE peer=?",
            [peer],
            |r| r.get(0),
        )
        .optional()?;
    if old.as_ref() != Some(&b.session) {
        tx.execute("DELETE FROM replica_haves WHERE peer=?", [peer])?;
        tx.execute("DELETE FROM replica_offers WHERE peer=?", [peer])?;
    }
    tx.execute(
        "INSERT OR REPLACE INTO replica_nodes VALUES(?,?,?,?)",
        params![peer, b.session, serde_json::to_string(&addr)?, t],
    )?;
    tx.execute(
        "INSERT OR REPLACE INTO replica_hours VALUES(?,?,?)",
        params![peer, (t / 14400) % 6, t],
    )?;
    tx.execute("DELETE FROM replica_offers WHERE expires<=?", [t])?;
    tx.execute("DELETE FROM replica_hours WHERE seen<?", [t - 7 * 86400])?;
    tx.execute(
        "DELETE FROM replica_haves WHERE peer IN (SELECT peer FROM replica_nodes WHERE seen<?)",
        [t - 7 * 86400],
    )?;
    tx.execute("DELETE FROM replica_nodes WHERE seen<?", [t - 7 * 86400])?;
    // The bounded ordered slice repairs stale claims after a restore, without sending the entire inventory.
    let end = b.inventory.last().map(String::as_str).unwrap_or("");
    tx.execute(
        "DELETE FROM replica_haves WHERE peer=? AND id>? AND (? OR id<=?)",
        params![peer, b.after, b.end, end],
    )?;
    for id in &b.inventory {
        confirm(&s, id, peer)?;
    }
    for (id, have) in &b.changes {
        if *have {
            confirm(&s, id, peer)?;
        } else {
            tx.execute(
                "DELETE FROM replica_haves WHERE peer=? AND id=?",
                params![peer, id],
            )?;
        }
    }
    let (reserved, held): (i64,i64) = tx.query_row(
        "SELECT count(*),coalesce(sum(length(CAST(c.data AS BLOB))),0) FROM replica_offers o JOIN catalog c ON c.id=o.id WHERE peer=?",
        [peer],
        |r| Ok((r.get(0)?,r.get(1)?)),
    )?;
    tx.execute("DELETE FROM replica_releases WHERE expires<=?", [t])?;
    let mut replacement = None;
    // A full donor can trade one redundant copy for a rare one. Permit only one release
    // per old post at a time, with at least two other recently available holders.
    if reserved == 0 && b.free < 2048 {
        for id in &b.replaceable {
            let eligible:Option<i64>=tx.query_row("SELECT length(CAST(c.data AS BLOB)) FROM catalog c JOIN replica_haves mine ON mine.id=c.id AND mine.peer=?2
             WHERE c.id=?1 AND c.kind='post' AND NOT EXISTS(SELECT 1 FROM replica_releases WHERE id=?1)
             AND (SELECT count(*) FROM (SELECT peer FROM providers WHERE id=?1 AND peer<>?2 AND expires>?3 UNION SELECT h.peer FROM replica_haves h JOIN replica_nodes n USING(peer) WHERE id=?1 AND h.peer<>?2 AND n.seen>?3-180))>=2",params![id,peer,t],|r|r.get(0)).optional()?;
            if let Some(bytes) = eligible {
                replacement = Some((id, bytes as u64));
                break;
            }
        }
    }
    let mut offers = Vec::new();
    let mut free = b.free.saturating_sub(held as u64);
    if (free > 0 || replacement.is_some()) && reserved < 8 {
        // Three *distinct* fresh devices; invitations to copy reduce outstanding work,
        // but never show up as available providers. Rank scarce posts before popular ones.
        let sql="WITH live(id,peer) AS (
          SELECT id,peer FROM providers WHERE expires>?1 UNION SELECT h.id,h.peer FROM replica_haves h JOIN replica_nodes n USING(peer) WHERE n.seen>?1-180
        ), copies AS (SELECT id,count(*) n FROM live GROUP BY id), waiting AS (SELECT id,count(*) n FROM replica_offers GROUP BY id),
        overlap AS (SELECT l.id,count(DISTINCT h.slot) common FROM live l JOIN replica_hours h ON h.peer=l.peer JOIN replica_hours me ON me.peer=?2 AND me.slot=h.slot GROUP BY l.id)
        SELECT c.data,coalesce(cp.n,0) live_count,
          coalesce(o.common,0) shared_slots
        FROM catalog c LEFT JOIN copies cp ON cp.id=c.id LEFT JOIN waiting w ON w.id=c.id LEFT JOIN overlap o ON o.id=c.id
        WHERE c.kind='post' AND c.author<>?2 AND length(CAST(c.data AS BLOB))<=?3 AND coalesce(cp.n,0)+coalesce(w.n,0)<3
          AND NOT EXISTS(SELECT 1 FROM live l WHERE l.id=c.id AND l.peer=?2)
          AND NOT EXISTS(SELECT 1 FROM replica_offers o WHERE o.id=c.id AND o.peer=?2)
        ORDER BY live_count,shared_slots,random()";
        let mut q = tx.prepare(sql)?;
        let rows = q.query_map(
            params![
                t,
                peer,
                (free + replacement.as_ref().map_or(0, |v| v.1)) as i64
            ],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)),
        )?;
        for row in rows {
            let (raw, live_count) = row?;
            let swap = raw.len() as u64 > free;
            if swap
                && (live_count >= 2
                    || replacement
                        .as_ref()
                        .is_none_or(|v| raw.len() as u64 > free + v.1))
            {
                continue;
            }
            let record: Signed<Record> = serde_json::from_str(&raw)?;
            if !available(&s, &record.payload.id)? {
                continue;
            }
            let mut h = hint(&s, record)?;
            if swap {
                let (old, bytes) = replacement.take().expect("eligible replacement");
                tx.execute(
                    "INSERT INTO replica_releases VALUES(?,?)",
                    params![old, t + 180],
                )?;
                free += bytes;
                h.replace = Some(old.clone());
            }
            tx.execute(
                "INSERT INTO replica_offers VALUES(?,?,?)",
                params![h.id, peer, t + 90],
            )?;
            free -= raw.len() as u64;
            offers.push(h);
            if offers.len() + reserved as usize >= 8 {
                break;
            }
        }
    }
    tx.commit()?;
    Ok(Json(Plan { offers }))
}
fn confirm(s: &Store, id: &str, peer: &str) -> Result<()> {
    s.db.execute(
        "INSERT OR IGNORE INTO replica_haves SELECT id,? FROM catalog WHERE id=? AND kind='post'",
        params![peer, id],
    )?;
    s.db.execute(
        "DELETE FROM replica_offers WHERE peer=? AND id=?",
        params![peer, id],
    )?;
    Ok(())
}
