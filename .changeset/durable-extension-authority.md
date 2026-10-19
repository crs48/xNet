---
'@xnetjs/data': minor
'@xnetjs/data-bridge': minor
'@xnetjs/sqlite': minor
---

Add atomically compared device-local state and durable action receipts to conditional transactions. Hosts can couple a permission revision, node edits, and a recoverable result without replicating permission state as user data. Adapters must explicitly support local-state transactions; unavailable policy storage fails closed.
