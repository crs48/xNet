---
'@xnetjs/data': minor
---

First-class `geo` property/column type (exploration 0339, Map sub-decision B): a single `{ lat, lng }` WGS84 location value instead of the paired-number-columns convention.

- New `geo()` property builder and `GeoPoint`/`isGeoPoint` exports (schema layer), plus `CellGeoPoint`/`isCellGeoPoint` on the database cell layer; `CellValue` now includes geo points.
- `ColumnType`/`FieldType` gain `'geo'` (NodeStore-simple, no config), with filter operators (`isEmpty`/`isNotEmpty`), summary functions (count family), sort comparator, cell conversion (`"lat, lng"` text round-trips), and CSV import/export support.
- Spatial queries can now address one numeric subfield of an object property with a dotted key (e.g. `cell_<fieldId>.lat`), so viewport-windowed map fetches work over geo cells on both the R\*Tree fast path and the JS-verified path. Flat keys always win; the dotted form only applies when no literal-key property exists.
