---
'@xnetjs/react': minor
---

`useGridDatabase` now pages database rows through a growing window instead of a fixed 500-row page: new `fetchMoreRows()` grows the window by `pageSize` (default 500) up to `maxLoaded` (default 2000, configurable via options), and the result exposes `totalRowCount` (exact matching count), `hasMoreRows`, and `isFetchingMoreRows` so grids can render honest totals and infinite scroll. Existing consumers keep working unchanged — rows still arrive sorted by `sortKey` on the live query path.
