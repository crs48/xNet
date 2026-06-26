---
'@xnetjs/data': minor
---

Extend the map layer-source model for richer GIS layers (exploration 0230).

`MapLayerSource` gains two new kinds — `raster` (an XYZ imagery/topo tile
overlay) and `pmtiles` (a self-hosted vector tileset referenced by BlobStore
content id) — and the reserved `query` kind now carries an optional `where`
filter and `tooltip` property keys. `MapBasemapId` adds a key-less `satellite`
basemap. All additive; existing inline-GeoJSON maps are unaffected.
