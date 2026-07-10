---
'@xnetjs/data': minor
---

Conflict telemetry now reports only genuine divergence, and remote replays
are idempotent end to end. `MergeConflict` gains a required `kind` field:
`'conflict'` for a cross-author write that lost to a newer local value,
`'lww-resolution'` for an informational lost-update where a cross-author
write replaced a differing value. Same-author causal history, identical
stamps, and equal values are no longer recorded at all. `applyRemoteChange`
short-circuits changes already present in the log (new optional
`NodeStorageAdapter.hasChange(hash)` probe, implemented by the SQLite and
memory adapters; callers fall back to `getChangeByHash`), and the memory
adapter dedupes appended changes by hash.
