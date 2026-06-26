---
'@xnetjs/sqlite': minor
---

Add parallel SQLite reads to the Electron `better-sqlite3` adapter (exploration
0230). Unlike the browser — where `opfs-sahpool` holds an exclusive handle so a
second connection is impossible — native SQLite + WAL allows one writer
concurrent with many readers, each on its own connection. The adapter now:

- fronts the writer with the shared priority scheduler (`scheduler` config,
  default on) so a write/import burst can't head-of-line block an interactive
  read;
- optionally opens a read-only secondary connection (`readonlyReadConnection`)
  so plain reads don't contend with write locks;
- optionally spawns a pool of read-only `worker_threads` readers
  (`readerPoolSize`, `'auto'` sizes to the host) that serve **heavy** reads
  (FTS, aggregates, large scans) in parallel on other cores, with least-busy
  dispatch and graceful fallback to the inline connection;
- yields cooperatively between chunks in `applyNodeBatch` so a long import no
  longer monopolizes the data-process thread;
- exposes `getDiagnostics()` / `getWalStats()` / `checkpointWal()` plus a
  read-your-writes window (`readYourWritesWindowMs`).

All additive — existing callers are unaffected, and the new behaviour is
opt-in via config (the scheduler is on by default but only reorders
non-transactional work).
