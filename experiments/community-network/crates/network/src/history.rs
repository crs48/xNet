use crate::{model::*, moderation, peer::Node};
use anyhow::{Context, Result, bail, ensure};

use futures_util::{StreamExt, stream};
use iroh::EndpointAddr;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, time::Duration};

const PAGE_SIZE: usize = 48;
const LEASE_SECONDS: u64 = 300;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryPermission {
    pub room: String,
    pub issued: u64,
    pub expires: u64,
    pub peers: Vec<EndpointAddr>,
    pub hidden: Vec<String>,
}
impl HistoryPermission {
    fn allows(&self, id: &str) -> bool {
        self.peers.iter().any(|p| p.id.to_string() == id)
    }
    fn current(&self, at: u64) -> bool {
        self.issued <= at
            && at < self.expires
            && self.expires.checked_sub(self.issued) == Some(LEASE_SECONDS)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryReceipt {
    room: String,
    pub(crate) sequence: i64,
    signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryPage {
    pub source: String,
    pub earlier: Option<u64>,
    pub revision: String,
    pub unchanged: bool,
    pub messages: Vec<Signed<Message>>,
    pub proofs: Vec<Signed<HistoryReceipt>>,
    pub offline_until: Option<u64>,
}

impl Node {
    pub(crate) fn joined_room(&self, id: &str) -> Result<Room> {
        ensure!(valid_id(id), "Invalid room ID");
        self.store
            .lock()
            .unwrap()
            .get(&format!("room:{id}"))?
            .context("Join this room first")
    }

    pub(crate) fn issue_history_permission(
        &self,
        id: &str,
        reader: &str,
    ) -> Result<Signed<HistoryPermission>> {
        self.authorize_room(reader, id)?;
        let room = self.joined_room(id)?;
        let store = self.store.lock().unwrap();
        let mut excluded: HashSet<String> = room.banned.into_iter().chain(room.pending).collect();
        let mut hidden = Vec::new();
        for rule in moderation::restrictions(&store, &format!("room-{id}"))?
            .into_iter()
            .filter(|r| r.active())
        {
            match rule.kind.as_str() {
                "author" => {
                    excluded.insert(rule.target);
                }
                "message" => hidden.push(rule.target),
                _ => {}
            }
        }
        let mut peers = Vec::new();
        for key in room.members.iter().filter(|key| !excluded.contains(*key)) {
            let route = if key == &room.owner.id.to_string() {
                room.owner.clone()
            } else if let Some(url) = &self.relay {
                EndpointAddr::new(key.parse()?).with_relay_url(url.clone())
            } else {
                store
                    .get(&format!("history-peer:{id}:{key}"))?
                    .unwrap_or(EndpointAddr::new(key.parse()?))
            };
            peers.push(route);
        }
        let issued = now();
        let key = format!("issued-history-permission:{id}");
        if let Some(last) = store.get::<Signed<HistoryPermission>>(&key)? {
            if last.payload.current(issued)
                && issued - last.payload.issued < 60
                && last.payload.peers == peers
                && last.payload.hidden == hidden
            {
                return Ok(last);
            }
        }
        let permission = Signed::new(
            HistoryPermission {
                room: id.into(),
                issued,
                expires: issued + LEASE_SECONDS,
                peers,
                hidden,
            },
            &self.key,
        )?;
        store.set(&key, &permission)?;
        Ok(permission)
    }

    // Only transport failure permits reuse. A live owner's refusal clears the saved permission.
    pub(crate) async fn history_permission(
        &self,
        room: &Room,
    ) -> Result<(HistoryPermission, bool)> {
        let mine = self.endpoint.id().to_string();
        if room.owner.id == self.endpoint.id() {
            return Ok((
                self.issue_history_permission(&room.id, &mine)?.payload,
                true,
            ));
        }
        let _refresh = self.history_refresh.lock().await;
        let key = format!("history-permission:{}", room.id);
        let cached = self
            .store
            .lock()
            .unwrap()
            .get::<Signed<HistoryPermission>>(&key)?;
        let prior = cached.as_ref().map(|p| p.signature.clone());
        let request = PeerRequest::HistoryPermission {
            known: prior.clone(),
            room: room.id.clone(),
        };
        let response = tokio::time::timeout(
            Duration::from_secs(3),
            self.request(room.owner.clone(), request),
        )
        .await;
        let store = self.store.lock().unwrap();
        let (permission, online) = match response {
            Ok(Ok(PeerResponse::HistoryPermission { permission })) => (permission, true),
            Ok(Ok(PeerResponse::PermissionCurrent)) => (
                cached.context("Missing confirmed history permission")?,
                true,
            ),
            Ok(Ok(response)) => {
                store.db.execute("DELETE FROM kv WHERE key=?", [&key])?;
                if let PeerResponse::Error { message } = response {
                    bail!(message);
                }
                bail!("The room owner needs a desktop update to share history");
            }
            Ok(Err(_)) | Err(_) => (
                store.get(&key)?.context(
                    "No peer permission available. Reconnect to the room owner to read history.",
                )?,
                false,
            ),
        };
        permission.verify()?;
        let policy = &permission.payload;
        ensure!(
            permission.author == room.owner.id.to_string()
                && policy.room == room.id
                && policy.peers.len() <= 64
                && policy.allows(&mine),
            "History access denied"
        );
        ensure!(
            policy.current(now()),
            "History permission expired. Reconnect to the room owner to renew it."
        );
        if online {
            // Do not recreate a room the user left while awaiting the owner.
            let mut local: Room = store
                .get(&format!("room:{}", room.id))?
                .context("You left this room")?;
            if !local.members.contains(&mine) {
                local.pending.retain(|m| m != &mine);
                local.members.push(mine);
                store.set(&format!("room:{}", room.id), &local)?;
            }
            if prior.as_ref() != Some(&permission.signature) {
                store.set(&key, &permission)?;
            }
        }
        Ok((permission.payload, online))
    }

    pub(crate) async fn permission_to_share(
        &self,
        room: &str,
        reader: &str,
    ) -> Result<(HistoryPermission, bool)> {
        let grant = self.history_permission(&self.joined_room(room)?).await?;
        ensure!(
            grant.0.allows(reader),
            "This member does not have access to this room's history"
        );
        Ok(grant)
    }

    pub(crate) async fn serve_history(
        &self,
        id: &str,
        reader: &str,
        before: Option<u64>,
        known: Option<&str>,
    ) -> Result<HistoryPage> {
        let boundary = i64::try_from(before.unwrap_or(i64::MAX as u64))?;
        ensure!(
            boundary > 0 && known.is_none_or(valid_id),
            "Invalid history cursor"
        );
        let (policy, online) = self.permission_to_share(id, reader).await?;
        let owner = self.joined_room(id)?.owner.id == self.endpoint.id();
        let store = self.store.lock().unwrap();
        // Owner sequence is stable across all replicas, including out-of-order backfills.
        let sql = if owner {
            "SELECT m.sequence,m.data,r.proof FROM messages m LEFT JOIN history_receipts r ON r.room=m.room AND r.id=m.id WHERE m.room=? AND m.sequence<? ORDER BY m.sequence DESC LIMIT ?"
        } else {
            "SELECT r.sequence,m.data,r.proof FROM history_receipts r JOIN messages m ON m.id=r.id AND m.room=r.room WHERE r.room=? AND r.sequence<? ORDER BY r.sequence DESC LIMIT ?"
        };
        let mut query = store.db.prepare_cached(sql)?;
        let mut rows = query
            .query_map(params![id, boundary, (PAGE_SIZE + 1) as i64], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        let more = rows.len() > PAGE_SIZE;
        rows.truncate(PAGE_SIZE);
        let trimmed = store
            .get::<bool>(&format!("trimmed-room:{id}"))?
            .unwrap_or(false);
        let earlier = rows.last().filter(|_| more || trimmed).map(|r| r.0 as u64);
        let hidden: HashSet<_> = policy.hidden.iter().collect();
        let mut visible = Vec::new();
        for (sequence, raw, proof) in rows.into_iter().rev() {
            let message: Signed<Message> = serde_json::from_str(&raw)?;
            if !hidden.contains(&message.payload.id) {
                visible.push((sequence, message, proof));
            }
        }
        let source = self.endpoint.id().to_string();
        let revision = digest(&serde_json::to_vec(&(
            &source,
            id,
            before,
            earlier,
            visible.iter().map(|r| &r.1.signature).collect::<Vec<_>>(),
        ))?);
        let unchanged = known == Some(&revision);
        let mut messages = Vec::new();
        let mut proofs = Vec::new();
        if !unchanged {
            for (sequence, message, raw) in visible {
                let proof = match raw {
                    Some(json) => serde_json::from_str(&json)?,
                    None => {
                        ensure!(owner, "Missing room owner's history receipt");
                        let proof = Signed::new(
                            HistoryReceipt {
                                room: id.into(),
                                sequence,
                                signature: message.signature.clone(),
                            },
                            &self.key,
                        )?;
                        store.db.execute(
                            "INSERT INTO history_receipts VALUES (?,?,?,?)",
                            params![
                                id,
                                sequence,
                                message.payload.id,
                                serde_json::to_string(&proof)?
                            ],
                        )?;
                        proof
                    }
                };
                messages.push(message);
                proofs.push(proof);
            }
        }
        ensure!(policy.current(now()), "History permission expired");
        Ok(HistoryPage {
            source,
            earlier,
            revision,
            unchanged,
            messages,
            proofs,
            offline_until: (!online).then_some(policy.expires),
        })
    }

    async fn read_peer_page(
        &self,
        source: EndpointAddr,
        room: &Room,
        before: Option<u64>,
        known: Option<&str>,
    ) -> Result<HistoryPage> {
        let request = PeerRequest::HistoryPage {
            room: room.id.clone(),
            before,
            known: known.map(str::to_owned),
        };
        let response = if self.direct_endpoint.is_some() {
            self.direct_request(
                &source,
                PeerRequest::HistoryRoute {
                    room: room.id.clone(),
                },
                request,
            )
            .await?
        } else {
            self.request(source.clone(), request).await?
        };
        match response {
            PeerResponse::HistoryPage { page } => {
                ensure!(
                    page.source == source.id.to_string()
                        && valid_id(&page.revision)
                        && (!page.unchanged
                            || (known == Some(&page.revision) && page.messages.is_empty()))
                        && page.messages.len() == page.proofs.len()
                        && page.messages.len() <= PAGE_SIZE
                        && page
                            .earlier
                            .is_none_or(|n| n > 0 && n < before.unwrap_or(i64::MAX as u64)),
                    "Invalid peer history page"
                );
                let mut previous = 0i64;
                for (message, proof) in page.messages.iter().zip(&page.proofs) {
                    proof.verify()?;
                    ensure!(
                        proof.author == room.owner.id.to_string()
                            && proof.payload.room == room.id
                            && proof.payload.sequence > previous
                            && (proof.payload.sequence as u64) < before.unwrap_or(i64::MAX as u64)
                            && proof.payload.signature == message.signature
                            && message.payload.room == room.id,
                        "Invalid room owner's history receipt"
                    );
                    previous = proof.payload.sequence;
                }
                Ok(page)
            }
            PeerResponse::Error { message } => bail!(message),
            _ => bail!("This peer needs a desktop update to share chat history"),
        }
    }

    pub async fn history_page(
        &self,
        id: &str,
        before: Option<u64>,
        source: Option<&str>,
        known: Option<&str>,
    ) -> Result<HistoryPage> {
        self.require_active()?;
        let room = self.joined_room(id)?;
        let mine = self.endpoint.id().to_string();
        let preferences = self.preferences()?;
        if room.owner.id == self.endpoint.id() {
            let mut page = self.serve_history(id, &mine, before, known).await?;
            page.messages.retain(|m| !preferences.hides_message(m));
            page.proofs.clear();
            if before.is_none()
                || !page.messages.is_empty()
                || !self
                    .store
                    .lock()
                    .unwrap()
                    .get::<bool>(&format!("trimmed-room:{id}"))?
                    .unwrap_or(false)
                || room.members.len() < 2
            {
                return Ok(page);
            }
        }
        let (policy, online) = self.history_permission(&room).await?;
        // A changed visibility policy invalidates the client's conditional read.
        let filter_key = digest(&serde_json::to_vec(&(&policy.hidden, &preferences))?);
        let wire_revision = known
            .and_then(|s| s.split_once('.'))
            .filter(|(filter, _)| *filter == filter_key)
            .map(|(_, rev)| rev);
        let mut peers: Vec<_> = policy
            .peers
            .iter()
            .filter(|p| p.id != self.endpoint.id() && (online || p.id != room.owner.id))
            .cloned()
            .collect();
        peers.sort_by_key(|p| {
            (
                source != Some(p.id.to_string().as_str()),
                p.id != room.owner.id,
            )
        });
        let mut peers = peers.into_iter();
        let primary = peers
            .next()
            .context("No other room peer is available to share history.")?;
        let get = |peer: EndpointAddr| {
            let owner = peer.id == room.owner.id;
            let op = self.read_peer_page(peer, &room, before, wire_revision);
            async move {
                Some((
                    owner,
                    tokio::time::timeout(Duration::from_secs(10), op)
                        .await
                        .ok()?
                        .ok()?,
                ))
            }
        };
        let lookup = async {
            let mut best = None;
            if let Some((owner, page)) = get(primary).await {
                if (owner && before.is_none()) || page.unchanged || !page.messages.is_empty() {
                    return Some(page);
                }
                best = Some(page);
            }
            let mut others = stream::iter(peers.map(get)).buffer_unordered(3);
            while let Some(candidate) = others.next().await {
                if let Some((owner, page)) = candidate {
                    if (owner && before.is_none()) || page.unchanged || !page.messages.is_empty() {
                        return Some(page);
                    }
                    best = Some(page);
                }
            }
            best
        };
        let mut page = tokio::time::timeout(Duration::from_secs(22),lookup).await.ok().flatten()
            .context("No authorized peer is directly reachable for this history. Reconnect to a room peer and try again.")?;
        ensure!(
            policy.current(now()),
            "History permission expired. Reconnect to the room owner."
        );
        if !online {
            page.offline_until = Some(
                policy
                    .expires
                    .min(page.offline_until.unwrap_or(policy.expires)),
            );
        }
        let hidden: HashSet<_> = policy.hidden.iter().collect();
        let rows = page
            .messages
            .iter()
            .zip(&page.proofs)
            .filter(|(m, _)| !hidden.contains(&m.payload.id))
            .map(|(m, p)| (m, Some(p)))
            .collect::<Vec<_>>();
        self.write_history(&room, &rows)?;
        page.proofs.clear();
        page.messages
            .retain(|m| !hidden.contains(&m.payload.id) && !preferences.hides_message(m));
        page.revision = format!("{filter_key}.{}", page.revision);
        Ok(page)
    }
}
