---
'@xnetjs/data': minor
'@xnetjs/react': minor
---

Database views (exploration 0337): `DatabaseViewSchema` gains a `map` view type and per-view presentation config — `colorBy`, `coverFit`, `groupMeta` (per-stack order/hidden overrides), `latField`/`lngField`, and a persisted `mapViewport`. `useGridDatabase` exposes the new config on `GridViewModel`, reports the fetch window (`rowWindow: { size, total }` for truncation-honest views), accepts a `spatial` query window option (map views fetch only the visible viewport), and adds `setViewConfig(patch)`, `updateRowCells(rowId, cells, { sortKey })` (one-write card moves), and `setGroupCollapsed` mutators. Timeline views now report `supportsGrouping` (swimlanes). All additions are optional fields — existing views are unaffected.
