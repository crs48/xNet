//! Device-local retention never grants permission to read or share a room.
use crate::{history::HistoryReceipt, model::*, peer::Node, store::Store};
use anyhow::{Context, Result, ensure};
use futures_util::{StreamExt, stream};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::Arc, time::Duration};

const WINDOW: usize = 500;
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct RoomCopy {
    pub latest_only: bool,
    pub messages: i64,
}
pub(crate) fn init(store: &Store) -> Result<()> {
    let tx = store.db.unchecked_transaction()?;
    if !store.get::<bool>("retention-counts-v1")?.unwrap_or(false) {
        tx.execute_batch("CREATE TABLE room_totals(room TEXT PRIMARY KEY,n INTEGER NOT NULL);
        INSERT INTO room_totals SELECT room,count(*) FROM messages GROUP BY room;
        CREATE TRIGGER message_saved AFTER INSERT ON messages BEGIN INSERT INTO room_totals VALUES(new.room,1) ON CONFLICT(room) DO UPDATE SET n=n+1; END;
        CREATE TRIGGER message_removed AFTER DELETE ON messages BEGIN UPDATE room_totals SET n=n-1 WHERE room=old.room; END;")?;
        store.set("retention-counts-v1", &true)?;
    }
    tx.commit()?;
    Ok(())
}
pub fn room_copies(store: &Store) -> Result<BTreeMap<String, RoomCopy>> {
    let mut rows = store.db.prepare("SELECT room,n FROM room_totals")?;
    let mut result = BTreeMap::new();
    for row in rows.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))? {
        let (room, messages) = row?;
        result.insert(
            room,
            RoomCopy {
                messages,
                latest_only: false,
            },
        );
    }
    for room in store.list::<String>("limit-room:")? {
        result.entry(room).or_default().latest_only = true;
    }
    Ok(result)
}
fn limited(store: &Store, room: &str) -> Result<bool> {
    Ok(store
        .get::<String>(&format!("limit-room:{room}"))?
        .is_some())
}
fn trim(store: &Store, room: &str, owner: bool) -> Result<()> {
    if !limited(store, room)? {
        return Ok(());
    }
    // Unreceipted sends have been acknowledged. Preserve them until the head read supplies their owner sequence.
    let order = if owner {
        "m.sequence DESC"
    } else {
        "(r.sequence IS NULL) DESC,coalesce(r.sequence,m.sequence) DESC"
    };
    let sql = format!(
        "DELETE FROM messages WHERE room=?1 AND id IN (SELECT m.id FROM messages m LEFT JOIN history_receipts r ON r.room=m.room AND r.id=m.id WHERE m.room=?1 ORDER BY {order} LIMIT -1 OFFSET {WINDOW})"
    );
    if store.db.execute(&sql, [room])? > 0 {
        store.set(&format!("trimmed-room:{room}"), &true)?;
        store.db.execute("DELETE FROM history_receipts WHERE room=? AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.id=history_receipts.id)",[room])?;
    }
    Ok(())
}
fn save_message(
    store: &Store,
    message: &Signed<Message>,
    owner: bool,
    receipt: Option<&Signed<HistoryReceipt>>,
) -> Result<()> {
    let m = &message.payload;
    let existing: Option<String> = store
        .db
        .query_row(
            "SELECT json_extract(data,'$.signature') FROM messages WHERE id=?",
            [&m.id],
            |r| r.get(0),
        )
        .optional()?;
    if let Some(sig) = existing {
        ensure!(
            sig == message.signature,
            "Conflicting signed messages with the same ID"
        );
    } else {
        let seq = if let Some(r) = receipt.filter(|_| owner) {
            r.payload.sequence
        } else {
            store.db.query_row(
                "SELECT coalesce(max(sequence),0)+1 FROM messages",
                [],
                |r| r.get::<_, i64>(0),
            )?
        };
        store.db.execute(
            "INSERT INTO messages VALUES(?,?,?,?)",
            params![m.id, m.room, seq, serde_json::to_string(message)?],
        )?;
    }
    if let Some(r) = receipt {
        store.db.execute(
            "INSERT INTO history_receipts VALUES(?,?,?,?) ON CONFLICT(room,sequence) DO NOTHING",
            params![m.room, r.payload.sequence, m.id, serde_json::to_string(r)?],
        )?;
    }
    Ok(())
}

#[derive(Default, Serialize, Deserialize)]
struct Sweep {
    before: Option<u64>,
    head: String,
    previous: String,
    #[serde(default)]
    revision: String,
    seen: usize,
    completed_at: u64,
}
impl Node {
    pub fn room_limit(&self, room: &str, latest_only: bool) -> Result<()> {
        let store = self.store.lock().unwrap();
        let r: Room = store
            .get(&format!("room:{room}"))?
            .context("Join this room first")?;
        ensure!(
            !r.private || !latest_only,
            "Private chats keep all available history"
        );
        let tx = store.db.unchecked_transaction()?;
        let key = format!("limit-room:{room}");
        if latest_only {
            store.set(&key, &room)?
        } else {
            store.db.execute("DELETE FROM kv WHERE key=?", [key])?;
        }
        store
            .db
            .execute("DELETE FROM kv WHERE key=?", [format!("sweep:{room}")])?;
        trim(&store, room, r.owner.id == self.endpoint.id())?;
        tx.commit()?;
        Ok(())
    }
    pub(crate) fn write_history(
        &self,
        room: &Room,
        rows: &[(&Signed<Message>, Option<&Signed<HistoryReceipt>>)],
    ) -> Result<()> {
        for (m, _) in rows {
            m.verify()?;
            m.payload.validate()?;
            ensure!(m.payload.room == room.id, "Wrong room");
        }
        let store = self.store.lock().unwrap();
        let tx = store.db.unchecked_transaction()?;
        let owner = room.owner.id == self.endpoint.id();
        for (m, r) in rows {
            save_message(&store, m, owner, *r)?;
        }
        trim(&store, &room.id, owner)?;
        tx.commit()?;
        Ok(())
    }
    pub async fn catch_up_room(&self, room: &Room) -> Result<()> {
        let key = format!("sweep:{}", room.id);
        let (mut s, limit) = {
            let store = self.store.lock().unwrap();
            if room.owner.id == self.endpoint.id()
                && !store
                    .get::<bool>(&format!("trimmed-room:{}", room.id))?
                    .unwrap_or(false)
            {
                return Ok(());
            }
            (
                store.get::<Sweep>(&key)?.unwrap_or_default(),
                limited(&store, &room.id)?,
            )
        };
        // A returning peer may hold an older prefix that was unavailable on the last sweep.
        if now().saturating_sub(s.completed_at) > 3600 && s.before.is_none() {
            s.previous.clear();
            s.revision.clear();
        }
        for _ in 0..4 {
            let known =
                (s.before.is_none() && !s.revision.is_empty()).then_some(s.revision.as_str());
            let page = self.history_page(&room.id, s.before, None, known).await?;
            if page.unchanged {
                break;
            }
            if s.before.is_none() {
                s.revision = page.revision.clone();
            }
            let ids = page
                .messages
                .iter()
                .map(|m| m.payload.id.as_str())
                .collect::<Vec<_>>();
            if s.before.is_none() {
                s.head = ids.last().copied().unwrap_or_default().into();
                s.seen = 0;
            }
            s.seen += page.messages.len();
            if page.earlier.is_none()
                || (limit && s.seen >= WINDOW)
                || (!s.previous.is_empty() && ids.contains(&s.previous.as_str()))
            {
                s.previous = std::mem::take(&mut s.head);
                s.before = None;
                if s.completed_at == 0 || now().saturating_sub(s.completed_at) > 3600 {
                    s.completed_at = now();
                }
            } else {
                s.before = page.earlier;
            }
            {
                let store = self.store.lock().unwrap();
                if limit != limited(&store, &room.id)? {
                    return Ok(());
                }
                store.set(&key, &s)?;
            }
            if s.before.is_none() {
                break;
            }
        }
        Ok(())
    }
    pub(crate) fn start_room_copies(node: &Arc<Node>) {
        let weak = Arc::downgrade(node);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(15)).await;
                let Some(node) = weak.upgrade() else { break };
                if node.require_active().is_err() {
                    continue;
                }
                let rooms = node.store.lock().unwrap().list::<Room>("room:");
                if let Ok(rooms) = rooms {
                    stream::iter(rooms)
                        .for_each_concurrent(4, |r| {
                            let n = node.clone();
                            async move {
                                if let Err(e) = n.catch_up_room(&r).await {
                                    eprintln!("Room history refresh {}: {e}", r.id);
                                }
                            }
                        })
                        .await;
                }
            }
        });
    }
}
