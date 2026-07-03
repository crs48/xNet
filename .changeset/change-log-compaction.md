---
'@xnetjs/data': minor
'@xnetjs/runtime': patch
---

Change-log compaction — the durable cold-open fix (exploration 0254 / F3).

The local `changes` log grows monotonically and never shrinks (~424k rows on affected
workspaces), which bloats the OPFS file (slow cold SQLite open) and the first
outbound-resync slice. Because current state is fully materialized in
`nodes`/`node_properties` and reads never replay the log, the log is a non-authoritative
cache of history the hub holds — so it can be safely GC'd.

- **`@xnetjs/data`**: adds `SQLiteNodeStorageAdapter.pruneSupersededChanges(wsafe, opts)`
  and `getMinConfirmedSyncCursor()`. `pruneSupersededChanges` deletes only _superseded_
  history — rows below the confirmed-durable sync floor that are neither a node's
  hash-chain tip (kept so `getLastChange`/`parentHash` chaining is unchanged) nor the LWW
  provenance of a currently-winning property value (kept so every live value stays
  re-pushable). It runs chunked, yields between chunks, and never throws. Convergence with
  peers that never compacted is preserved by construction; only rows are deleted, never
  rewritten.
- **`@xnetjs/runtime`**: `NodeStoreSyncProvider` now guards against a hub high-water mark
  regressing below the confirmed cursor (a hub rollback / repointed empty hub) by
  re-offering local changes from the hub's real mark.

The web app schedules compaction on idle boot (behind the `xnet:compact:changes=off` kill
switch); freed pages are reclaimed by the existing idle VACUUM.
