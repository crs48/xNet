---
'@xnetjs/data': minor
---

First-class data portability: the `.xnetpack` bundle codec
(`@xnetjs/data/portability`). `writeBundle` exports the signed change log
(full, per-space, per-schema, or per-node scope, with incremental
`since`-frontier bundles) as NDJSON plus content-addressed blobs and Yjs
doc states under a signed manifest; `verifyBundle` integrity-checks a
bundle without writing; `applyBundle` imports by replaying through the
store's verified remote-change path (idempotent, quarantine-reporting).
Adds `NodeStore.hasChange(hash)`.
