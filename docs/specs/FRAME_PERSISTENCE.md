# Frame persistence decision (exploration 0346, Phase 2)

**Question.** Where does a `FrameDef` live: inside the document (block
props on the BlockNote/Yjs fragment) or as sibling nodes (`PageFrame`
nodes queried by page id)?

**Decision: split by geometry.**

- **Doc-stack frames are block props** (status quo, kept). A frame in a
  document's stack _is content_: it belongs to the prose's CRDT — it
  moves with text edits, merges with concurrent typing, travels with the
  page's Y.Doc, and participates in editor undo. The already-shipped
  `databaseEmbed` / `pageEmbed` specs carry `FrameDef`-equivalent props
  (`databaseId`/`nodeId`, `viewType`, `viewConfig` as a JSON string);
  `frameFromDatabaseEmbed` / `frameFromPageEmbed`
  (`packages/views/src/frames/adapters.ts`) are the canonical mapping.
  Cost accepted: adding a _new_ block spec is a coordinated editor-schema
  rollout (0205 skew rule), so new frame capabilities should extend
  existing spec props before minting new specs.

- **Grid/space arrangements are node data, not doc content.** Dashboard
  widget placements already persist as per-breakpoint layout items on
  the Dashboard node; canvas objects persist in the canvas scene. When
  the Phase-4 geometry axis lands, per-frame `layout {x,y,w,h}` stays on
  those nodes (LWW per property — a concurrent drag on two devices
  resolves per-frame, not per-document), never inside a Yjs fragment.
  Rationale: arrangement is queryable presentation state ("which pages
  embed this database?" should be a node query), has no prose merge
  semantics, and must not force an editor-schema rollout per tweak.

**Geometry (Phase 4).** Pages carry a `geometry: stack | grid | space`
select property (default `stack`); the arrangement model lives in
`packages/views/src/frames/geometry.ts` with the round-trip invariant
(toggling geometries never changes the frame set — only missing layouts
gain defaults) enforced by `geometry.test.ts`. The grid and space
_renderers_ are the existing Dashboard and Canvas engines — per the
0277 convergence playbook the surfaces remain and the engines are
shared through the frames layer (`frameFromCanvasNode`, the dashboard
frame widget), rather than minting a third grid/canvas implementation.

**Consequences.**

- "Which frames reference node X?" is answerable for grid/space frames
  by node query today, and for doc-stack frames only by scanning doc
  fragments — acceptable for now; if backlink-grade indexing of embeds
  is needed, mirror embed references into the existing mention/reference
  nodes rather than moving frames out of the doc.
- The `FrameDef.id` convention encodes the container:
  `block:<blockId>`, `canvas:<objectId>`, `widget:<nodeId>:<viewType>`,
  `tab:<frameSpec>` — collisions impossible across containers.
