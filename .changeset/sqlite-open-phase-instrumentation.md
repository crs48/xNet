---
'@xnetjs/sqlite': minor
---

Cold-open boot diagnostics: bracket the SQLite worker's open/init window (exploration 0253).

The 7th cold-open capture showed the ~17 s stall with `execMs: 0` AND `queueMs: 0` on
every op — so it is neither slow SQL nor scheduler head-of-line blocking. The cost moved
into the one window no timer brackets: the worker's `open()`/init and the dispatch gap
before the first scheduled op. This adds the two missing log lines (gated behind
`bootDebug`, never throws):

- `WebSQLiteAdapter` now records per-phase open timings (`OpenPhaseTimings`:
  wasm import/init, OPFS VFS install incl. lock retries, capacity reserve, db open,
  pragmas, total) exposed via `getOpenPhaseTimings()`, plus public `schemaApplyMs` and
  `openRetryAttempts`. The worker host emits them as `[xNet] sqlite open phases`.
- `SchedulerOpReport` gains `enqueuedAt` + `startedAt` so the worker host can tag the
  FIRST op after open with `idleBeforeFirstOpMs` (open → first enqueue, the upstream/
  transport wait) and `sinceOpenMs` (open → first exec) — the disambiguator between
  "stalled in open" and "stalled upstream".

Diagnostic only; no behaviour change on the production path.
