---
'@xnetjs/core': minor
'@xnetjs/data': minor
'@xnetjs/react': minor
'@xnetjs/runtime': minor
---

Schema authorization gains `create` and `update` actions — optional refinements of `write` (exploration 0304). A schema may now split its mutation policy into who may **add** nodes vs. who may **modify** existing ones; when a refinement is absent it falls back to the schema's `write` expression, so existing schemas behave identically.

- `@xnetjs/core`: `AUTH_ACTIONS` includes `create`/`update`; new `actionExpressionOrder()` and `grantActionSatisfies()` helpers (a `write` grant covers both refinements; granular grants cover only themselves).
- `@xnetjs/data`: the policy evaluator resolves actions with the fallback and evaluates `create` against the draft node built from the payload (container relations resolve membership, so creation into a shared Space is genuinely gated); `NodeStore` checks the precise verbs, and remote creates are inferred and checked as `create` instead of failing closed on a not-yet-existing node. New `spaceContributorAuthorization()` cascade — adopted by `ChatMessage` and `Comment` — expresses "members may post, only the author (or space admins) may edit". `StoreAuthAPI.can` accepts an optional draft `node`.
- `@xnetjs/react`: new `useCanCreate(schemaId, properties)` hook; `useCan`/`useCanEdit` check the precise `update` verb.
- `@xnetjs/runtime`: conformance corpus gains the `authz-actions` suite pinning the fallback table.
