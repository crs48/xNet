---
'@xnetjs/runtime': minor
'@xnetjs/react': minor
---

Deliver a shared chat channel's nodes to a grantee (exploration 0298). `NodeStoreSyncProvider` gains a subscribe-only mode (receives + applies a room but never publishes local changes and never advances its cursor from a live broadcast — share rooms cursor on a per-room `seq`). `SyncManager` gains `subscribeShareRoom(room)` / `unsubscribeShareRoom(room)`, and a `channelShareRoom(id)` helper is exported (re-exported from `@xnetjs/react`). Together these let a client subscribe to a channel's `xnet-channel-<id>` share room so its node, message history, and members' profiles sync in — the transport that channel share links were missing.
