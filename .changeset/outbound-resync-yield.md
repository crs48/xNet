---
'@xnetjs/runtime': patch
---

Outbound resync no longer blocks the main thread for seconds on cold open (exploration 0253).

When the persisted sync cursor lags far behind the local change log (e.g. the hub never
confirmed the tail — INVALID_HASH skew), `syncLocalChanges()` fetched every change since the
cursor and processed the whole slice synchronously right after the sync-response resolved — the
single ~5s uninterrupted main-thread long task seen in cold-open captures. Two fixes:

- The equal-lamport tie-break now uses **code-unit** order instead of `String.localeCompare`,
  which is orders of magnitude faster over a large tie-heavy slice and matches the code-unit
  collation the inbound apply path already uses (the query already returns lamport-ASC order, so
  this only orders ties).
- The enqueue loop **yields to the event loop** every 1024 changes, so a large first-sync slice
  can no longer monopolise a frame regardless of size.

A one-line self-gating `[NodeStoreSync] heavy outbound resync` diagnostic names the residual
synchronous cost (the per-row deserialize inside `getChangesSince`) when a resync is large, to
size the durable fix (compacting the change log). No public API or wire-contract change.
