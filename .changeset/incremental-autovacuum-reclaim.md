---
'@xnetjs/sqlite': patch
---

OPFS databases now open with `PRAGMA auto_vacuum = INCREMENTAL` (exploration 0260).

Change-log compaction (0254) DELETEs superseded history, but under the previous
default `auto_vacuum = NONE` those pages only returned to SQLite's freelist — the
OPFS file never shrank, so the cold-open read that faults the file's working set
stayed bloat-priced no matter how much history was pruned. INCREMENTAL mode lets
each compaction pass call `PRAGMA incremental_vacuum` to hand the freed pages back
to the filesystem, so the file shrinks a little every idle boot until the log is
drained. The mode only converts on a fresh database or at a `VACUUM`; the existing
one-time boot-settled VACUUM performs that conversion for pre-existing databases,
after which no further whole-file rewrite is needed. Fresh databases are created in
incremental mode and never bloat.
