---
'@xnetjs/runtime': minor
---

`NodeStoreSyncProvider` now handles hub capacity rejections gracefully: on the first `QUOTA_EXCEEDED` (over the hub's per-user cap) or `STORAGE_FULL` (hub disk full) rejection it pauses outbound sync instead of re-flooding the hub, keeps local data intact, and resumes on the next reconnect. Subscribe to the new `onSyncBlocked(listener)` API (with `SyncBlockedReason`/`SyncBlockedListener` types) to surface a "storage full" notice in your app.
