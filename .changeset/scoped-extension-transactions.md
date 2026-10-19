---
'@xnetjs/data': minor
'@xnetjs/data-bridge': minor
'@xnetjs/sqlite': minor
'@xnetjs/react': minor
---

Add optional snapshot preconditions and deadlines to transactions. Supported storage adapters compare them atomically with the write; unsupported adapters reject conditional transactions. Guarded deletes return their committed tombstone for conflict-safe receipts.

Expose the existing `useMutate` implementation through `@xnetjs/react/queries` so restricted hosts can provide their own authorization-enforcing DataBridge without importing the full provider. The context itself does not enforce permissions.
