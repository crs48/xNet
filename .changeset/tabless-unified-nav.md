---
'@xnetjs/plugins': minor
---

Workspace layout presets drop the retired shell views (exploration
0353): `createDefaultTree` and the `bench` preset no longer place the
`sidebar` / `rail` slot views (both deleted — the shipping shell renders
its own sidebar islands), and the default tree's left dock now leads
with the unified `tree` view. The `rail` region remains as a placement
target for user-moved views.
