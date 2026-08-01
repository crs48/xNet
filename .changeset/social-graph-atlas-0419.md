---
'@xnetjs/sqlite': minor
'@xnetjs/react': minor
---

Imported social content is now actually in the full-text index, and a saved
lens can be projected onto a canvas with its relationships.

`extractSearchableContent` read `content`, `description`, `body`, `name` and
`note` — but not `searchText`, the property imported social records
denormalize their full text into precisely so it can be searched. Every
imported post, comment and video transcript was therefore absent from
`nodes_fts` while the pipeline reported it as indexed: search returned a clean
empty result rather than an error. `searchText` is now indexed, with
`textPreview` as the fallback for records that carry no full text. **Existing
databases need `rebuildFTS()` to pick up already-imported rows** — new writes
are indexed correctly from here on.

`SavedViewVisualCanvasProjectionRequest` gains an `edges` array (filtered to
relationships whose endpoints both survived the projection cap), and the new
`SavedViewCanvasProjectionEdge` type is exported. This is what lets a consumer
lay a saved view out as a graph rather than an unconnected grid of cards.
