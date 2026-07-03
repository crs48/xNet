---
'@xnetjs/runtime': patch
---

Rollback re-offer no longer floods a reset or protocol-skewed hub (exploration 0260).

`NodeStoreSyncProvider`'s rollback guard now skips re-offering local changes when the
hub reports `highWaterMark === 0` (a fresh/empty/reset hub, not a recoverable partial
rollback — re-offering there re-pushed the entire change log via `getChangesSince(0)`)
or when the outbound `INVALID_HASH` breaker is already tripped (every re-offered change
would be rejected identically). A genuine partial rollback (`0 < highWaterMark <
cursor`) still re-offers the gap.
