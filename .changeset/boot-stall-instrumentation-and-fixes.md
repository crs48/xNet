---
'@xnetjs/sqlite': minor
'@xnetjs/runtime': patch
---

Boot-stall diagnosis and two fixes (exploration 0229).

`@xnetjs/sqlite`: the worker now emits boot-debug-gated diagnostics — a
per-operation queue-wait-vs-execution timing trace and a one-shot DB-stats line
at open (file size, page/freelist counts, storage mode). This is threaded via a
new `bootDebug` flag on `SQLiteConfig` (the worker can't read `localStorage`). It
separates head-of-line queueing from real SQL/OPFS cost, which finally localizes
the recurring cold-start stall to a single operation.

`@xnetjs/runtime`: `SyncManager` now dials the hub before loading the offline
queue instead of after, so the WebSocket handshake is no longer serialized
behind local storage (which, when the single SQLite worker stalls, delayed sync
by ~18s even though the hub answers in ~200ms). The queue loads in the
background and the connect-time drain re-runs once entries are available.
