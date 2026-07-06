---
'@xnetjs/data': patch
---

Changes re-read from the local SQLite change log now pass hash verification.
The `changes` table never persisted `id`, `type`, `protocolVersion`, or the
batch fields, yet all of them are part of the signed content hash — so the
reload-resync push (`getChangesSince` → hub) was structurally rejected as
INVALID_HASH, tripped the outbound circuit breaker, and stranded edits made
offline before an app restart. New rows persist those fields in an envelope
inside the payload BLOB (no schema migration needed); legacy rows keep the
old fallback behaviour.
