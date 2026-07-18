---
'@xnetjs/react': minor
'@xnetjs/plugins': minor
'@xnetjs/data': minor
---

Composable UI frames (exploration 0346). The `@xnetjs/editor` and
`@xnetjs/views` surfaces are release-ignored packages; their changes ship
with the app. Live embeds in documents (Phase 1): `databaseEmbed` blocks
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

`@xnetjs/react` gains the entangle bus (0346 Phase 3): `EntangleProvider`
/ `useEntangledHighlight` / `useEntangleBind` — page-scoped hover/select
co-presence so frames on one page (grid rows, board cards, calendar
chips, map pins, wikilink chips) highlight the same node together.
`ReverseRelationsPanel` gains an `onOpenAsFrame` action.

`@xnetjs/plugins` (0346 Phase 5): new agent tools
`xnet_plan_frame_placement` / `xnet_apply_frame_placement` /
`xnet_compose_page` — the agent composes pages of live frames through
the standard plan → validate → apply pipeline (declarative tier only).
Plugins gain `registerFrameRenderer` with the own-views-only namespacing
rule.

`@xnetjs/data` (0346 Phase 5): cross-node formula scope — `RELATED()`
and `NODE()` context functions widen the one formula language from row →
relations → named nodes (host-resolved, cache-bypassed until 0317's
precise invalidation). Pages gain an additive
`geometry: stack | grid | space` property (default `stack`).
