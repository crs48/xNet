---
'@xnetjs/data': minor
'@xnetjs/runtime': minor
---

Fix the cold-start boot stall and silent registry persistence failure (exploration 0227).

Workspace presence Y.Docs (`presence-*`) are now in-memory only — never
cold-loaded from `yjs_state` nor persisted back — so presence-doc warming no
longer head-of-line blocks the landing read queries on the single SQLite worker
at boot. `NodePoolConfig` gains `isEphemeral` and `largeDocWarnBytes` options.

The sync registry now persists its tracked-node set through a new FK-free
app-state key/value (`getAppState`/`setAppState` on the storage adapter, backed
by `sync_state`) instead of `yjs_state`, fixing a `SQLITE_CONSTRAINT_FOREIGNKEY`
(787) that silently prevented the registry from ever persisting.
