---
'@xnetjs/sqlite': minor
---

Add `incrementalVacuum(maxPages?)` to `SQLiteAdapter` (optional method) and
implement it on the web (WASM) and Electron adapters. On the WASM build,
`exec('PRAGMA incremental_vacuum')` silently frees only ONE page per call —
SQLite frees a single freelist page per `sqlite3_step` of that pragma and the
oo1 `exec` path steps a row-less statement exactly once — so the change-log
compaction's per-boot file reclaim was a near-no-op. The new method steps the
pragma to completion (optionally capped) and returns the number of pages freed.
