---
'@xnetjs/identity': major
---

Move the ATProto identity binding to the `fyi.xnet.*` namespace.

`ATPROTO_BINDING_COLLECTION` changes from `net.x.identity.binding` to
`fyi.xnet.identity.binding`. NSIDs are DNS-rooted, so authority over `net.x.*`
requires control of `x.net` — which belongs to IANA and can never be ours. The
old collection was therefore unresolvable and indefensible; `xnet.fyi` is a
domain we actually hold.

This is a breaking wire-contract change: the collection name appears in the
record `$type`, in the `at://` URI of every binding, and in the hub's
verification path. In practice the migration cost is nil — the binding was held
by 0 DIDs network-wide, because the OAuth client requested identity-only scope
and the write was never authorised (fixed alongside this change).

Consumers reading or writing the binding directly must use the new collection;
records under the old name were never successfully created.
