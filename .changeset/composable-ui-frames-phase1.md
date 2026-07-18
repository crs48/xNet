---
'@xnetjs/editor': minor
'@xnetjs/views': minor
---

Live embeds in documents (exploration 0346, Phase 1): `databaseEmbed` blocks
now pass any registry view type through to the host (map, timeline, plugin
views — not just the built-in six), `pageEmbed` blocks render a host-provided
live summary transclusion via the new `renderPageEmbed` host callback, and the
slash menu gains a `/view of…` command backed by the new
`onSelectDatabaseView` host picker. Adds `extractDocPreviewLines` for
summary-tier text extraction from a v4 document fragment.

`@xnetjs/views` gains the Frame contract (0346 Phase 2): `FrameDef` /
`FrameSource` / `FrameTier`, the `FrameRenderer` + `frameSourceRegistry`
(schema-dispatched node frames, saved-query frames, curated collection
frames, depth-clamped transclusion), container adapters
(`frameFromDatabaseEmbed` / `frameFromPageEmbed` / `frameFromCanvasNode`),
and the generic dashboard frame widget (`registerFrameWidget`).
