---
"@xnetjs/data": minor
"@xnetjs/sqlite": minor
---

Materialized views can now coexist with read authorization. Each
materialization is stamped with a reload-stable authorization fingerprint
(subject + grant-state version), so a view is authorized once at refresh and
served from the persisted cache without per-row re-checks — while any grant
change forces an `authz-changed` re-materialization. The cached id list can
never serve a row a revoked viewer may no longer read. Adds a nullable
`auth_fingerprint` column to `node_query_materializations` (schema v7, applied
to existing databases via a defensive column guard) plus optional
`setNodeReadAuthorizer` / `getAuthorizationStateVersion` storage-adapter seams.
