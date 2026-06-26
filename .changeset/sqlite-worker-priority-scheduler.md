---
'@xnetjs/sqlite': minor
---

Add a priority scheduler with read coalescing to the web SQLite worker
(exploration 0228). All storage operations now drain through one scheduler
inside the single worker both the main thread and data worker share:
interactive reads are served ahead of queued writes, so a write or sync-apply
burst can no longer starve a read (generalizing the 0227 head-of-line fix).
Identical concurrent reads collapse into a single execution. A new
`getSchedulerSnapshot()` exposes queue depth for diagnostics. This is ordering
only — no parallelism is added, since `opfs-sahpool` is single-connection by
construction.
