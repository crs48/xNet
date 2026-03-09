# 0108 - Canvas V1 Pages, Databases, Drops, and Infinite Canvas Deep Dive

> **Status:** Exploration  
> **Date:** 2026-03-09  
> **Author:** Codex  
> **Tags:** canvas, infinite-canvas, affine, blocksuite, tldraw, editor, database, performance, collaboration

## Problem Statement ✳️

xNet already has the beginnings of a strong infinite canvas, but today it still feels like a generic graph sandbox instead of the primary application surface:

- canvas nodes are mostly placeholders
- linked pages and databases open well, but do not yet feel native on the canvas
- the drop model is narrow instead of universal
- the renderer exposes chunking and level-of-detail primitives, but the active shell still renders a much simpler scene than the architecture can support

The goal of this exploration is to define a **broad whiteboard v1** for xNet:

- live editable page cards on canvas
- database cards with live preview and focus/open behavior
- dropped URLs with rich preview fallback
- dropped images/files as first-class canvas objects
- shapes and connectors as native spatial primitives
- a scene model that scales to large, collaborative, virtualized infinite canvases

## Exploration Status ✅

- [x] Audit the current repo state
- [x] Research external canvas systems and standards
- [x] Deep-dive AFFiNE’s strongest canvas and cross-surface features
- [x] Define the recommended architecture
- [x] Propose a phased implementation roadmap
- [x] Capture performance, collaboration, and testing requirements

## Executive Summary 🎯

The right move is **not** to keep extending the current generic `card/embed/shape` canvas model with more ad hoc props, and **not** to replace xNet with AFFiNE, BlockSuite, or tldraw wholesale.

The pragmatic direction is:

1. Turn the canvas into a **scene graph of references and primitives**.
2. Keep rich content in the systems that already own it:
   - `Page` nodes for rich text
   - `Database` nodes for structured collections
   - `ExternalReference` nodes for URLs
   - a new reusable asset node for dropped images/files
3. Treat canvas objects as spatial views over those records, with zoom-aware rendering:
   - far zoom: metadata cards
   - mid zoom: previews
   - near zoom: live editors where appropriate
4. Use a **hybrid renderer**:
   - WebGL / Canvas for the infinite grid, minimap, and eventually far-field placeholders and batched edge work
   - DOM only for the near-field, interactive objects that actually need React and browser focus semantics
5. Use the existing chunking, spatial indexing, and LOD work in `@xnetjs/canvas` as the base for a genuinely infinite surface.
6. Reuse `@xnetjs/react` hooks and query infrastructure rather than inventing a separate canvas data path:
   - `useNode` for object-backed docs
   - `useDatabase` for database previews/focus flows
   - `useQuery` and future query descriptors for viewport-aware loading, pagination, and eventually spatial predicates
7. Borrow AFFiNE’s best interaction ideas without copying its exact storage or mode model:
   - synced docs / transclusion
   - center-peek editing
   - cross-surface drag and drop
   - block/deep-link references
   - lock / frame / alignment polish

### Recommended product cut

- **Pages:** fully editable inline on canvas in v1
- **Databases:** live preview + focus/open in v1
- **URLs:** dropped as node-backed preview cards with `oEmbed -> Open Graph -> generic link` fallback
- **Images/files:** dropped as node-backed media assets rendered directly on canvas
- **Shapes/connectors:** preserved and expanded, but treated as supporting primitives around node-backed content

This gives xNet a canvas that is useful immediately, while keeping the data model aligned with the rest of the system.

## Current State In The Repository 🔎

### Observed fact: the canvas package is stronger than the active canvas UX

The core package already contains substantial infrastructure:

- [`packages/canvas/src/spatial/index.ts`](../../packages/canvas/src/spatial/index.ts)
  - R-tree spatial indexing
  - viewport transforms
  - point and range queries
- [`packages/canvas/src/nodes/CanvasNodeComponent.tsx`](../../packages/canvas/src/nodes/CanvasNodeComponent.tsx)
  - zoom-based LOD (`placeholder`, `minimal`, `compact`, `full`)
- [`packages/canvas/src/chunks/chunked-canvas-store.ts`](../../packages/canvas/src/chunks/chunked-canvas-store.ts)
  - chunked scene storage
- [`packages/canvas/src/chunks/chunk-manager.ts`](../../packages/canvas/src/chunks/chunk-manager.ts)
  - viewport-driven chunk load/evict lifecycle
- [`packages/canvas/src/store.ts`](../../packages/canvas/src/store.ts)
  - collaborative Yjs-backed node/edge scene storage
- [`packages/canvas/src/layers/webgl-grid.ts`](../../packages/canvas/src/layers/webgl-grid.ts)
  - procedural infinite WebGL grid
- [`packages/canvas/src/components/Minimap.tsx`](../../packages/canvas/src/components/Minimap.tsx)
  - canvas-rendered minimap with viewport navigation
- [`packages/canvas/src/layers/index.ts`](../../packages/canvas/src/layers/index.ts)
  - explicit multi-layer renderer contract (`grid`, `edge`, `node`, `overlay`)

But the public node model is still generic in [`packages/canvas/src/types.ts`](../../packages/canvas/src/types.ts):

- `card`
- `frame`
- `shape`
- `image`
- `embed`
- `group`

That is too generic for a canvas-first application.

### Observed fact: the active Electron canvas shell still renders linked cards, not live content

The current app shell has already shifted toward canvas-first in:

- [`apps/electron/src/renderer/App.tsx`](../../apps/electron/src/renderer/App.tsx)
- [`apps/electron/src/renderer/components/CanvasView.tsx`](../../apps/electron/src/renderer/components/CanvasView.tsx)

That shell already:

- boots into a home canvas
- creates linked page/database nodes on the canvas
- uses zoom transitions into focused page/database views
- treats the canvas as the home surface

However, the actual node rendering still relies on lightweight shell cards:

- linked page/database cards
- canvas notes
- double-click to open focused page/database surfaces

This is directionally right, but still one step removed from “the canvas is the app.”

### Observed fact: pages and databases are already separate node-backed Yjs documents

The data model already supports the split we want:

- [`packages/data/src/schema/schemas/page.ts`](../../packages/data/src/schema/schemas/page.ts)
  - `PageSchema`
  - `document: 'yjs'`
- [`packages/data/src/schema/schemas/database.ts`](../../packages/data/src/schema/schemas/database.ts)
  - `DatabaseSchema`
  - `document: 'yjs'`
- [`packages/data/src/schema/schemas/canvas.ts`](../../packages/data/src/schema/schemas/canvas.ts)
  - `CanvasSchema`
  - `document: 'yjs'`

That means xNet already has the correct separation of concerns:

- the canvas owns spatial placement
- page/database docs own their content state

This is a strong foundation for inline canvas rendering without duplicating content into the canvas doc.

### Observed fact: upload and external reference primitives already exist

There are already reusable building blocks for dropped content:

- [`packages/data/src/blob/blob-service.ts`](../../packages/data/src/blob/blob-service.ts)
  - blob-backed file upload and retrieval
- [`packages/editor/src/hooks/useImageUpload.ts`](../../packages/editor/src/hooks/useImageUpload.ts)
  - image upload plumbing
- [`packages/editor/src/hooks/useFileUpload.ts`](../../packages/editor/src/hooks/useFileUpload.ts)
  - file upload plumbing
- [`packages/data/src/schema/schemas/external-reference.ts`](../../packages/data/src/schema/schemas/external-reference.ts)
  - a reusable, queryable URL/reference node shape

The missing piece is not raw infrastructure. It is the canvas ingestion and scene model.

### Observed fact: the repo already points toward a hybrid Canvas + DOM stack

`@xnetjs/canvas` is no longer a pure DOM renderer in spirit:

- the infinite background grid is already procedural WebGL with CSS fallback
- the minimap is already rendered into a `<canvas>`
- the layer package already documents a rendering split between:
  - background grid
  - edge rendering
  - DOM nodes
  - overlays

That means the exploration should not propose hybrid rendering as a speculative future. It should promote it into the primary runtime architecture.

### Observed fact: the current spatial index is an R-tree, not a quadtree

The active canvas spatial index is [`rbush`](https://github.com/mourner/rbush)-style R-tree logic wrapped in [`packages/canvas/src/spatial/index.ts`](../../packages/canvas/src/spatial/index.ts).

That matters because xNet’s scene objects are:

- arbitrarily sized rectangles
- not uniformly distributed
- often large and overlapping

So the existing R-tree is already a strong fit for the current workload. A quadtree may still become useful for some future workloads, but it should not be treated as an automatic upgrade.

### Observed fact: React hook infrastructure is already off-main-thread friendly

The current `useQuery` implementation in [`packages/react/src/hooks/useQuery.ts`](../../packages/react/src/hooks/useQuery.ts):

- runs through DataBridge
- already supports list vs single-node access
- already supports limit/offset pagination primitives
- already has a descriptor pipeline that can evolve without changing every caller

That is the right place to eventually add canvas-friendly spatial query helpers, not a bespoke canvas-only fetch system.

### Current state map

```mermaid
flowchart TD
  App["Electron shell<br/>canvas-first home"] --> CanvasView["CanvasView"]
  CanvasView --> CanvasPkg["@xnetjs/canvas"]
  CanvasView --> PageView["focused PageView"]
  CanvasView --> DatabaseView["focused DatabaseView"]

  CanvasPkg --> Store["CanvasStore<br/>Yjs scene state"]
  CanvasPkg --> Spatial["Spatial index<br/>R-tree"]
  CanvasPkg --> Chunking["Chunk manager<br/>not primary runtime yet"]
  CanvasPkg --> LOD["Zoom-based LOD"]
  CanvasPkg --> Grid["WebGL grid layer"]
  CanvasPkg --> Minimap["Canvas minimap"]

  PageView --> PageNode["Page node<br/>Yjs doc"]
  DatabaseView --> DatabaseNode["Database node<br/>Yjs doc"]
  CanvasView --> LinkedCards["linked shell cards"]

  style LinkedCards fill:#ffe4e6
  style Chunking fill:#dcfce7
  style LOD fill:#dcfce7
  style Grid fill:#dcfce7
  style Minimap fill:#dcfce7
  style PageNode fill:#dbeafe
  style DatabaseNode fill:#dbeafe
```

## External Research 🌍

### AFFiNE: the best precedent for “canvas as the main workspace”

AFFiNE’s official July 2024 update is especially relevant:

- **Center Peek** allows previewing and editing linked content without a full context switch.
- **Synced Docs** support multiple live pages on one edgeless whiteboard.
- Edgeless text was reworked from simple canvas text toward richer note-like editing.

Sources:

- [AFFiNE July 2024 Update](https://affine.pro/blog/whats-new-affine-2024-07)

Their November 2024 update is also directly relevant:

- linked doc and database interactions became tighter
- docs can be linked or created from databases
- database properties sync into document metadata
- a floating sidebar reinforced the “show less chrome by default” direction

Sources:

- [AFFiNE November 2024 Update](https://affine.pro/blog/whats-new-affine-nov-update)

AFFiNE’s later releases make the transferable feature set much clearer:

- **September 2024**
  - frame/group interactions were tightened
  - block references became linkable targets
  - mind map interactions improved
- **December 2024**
  - linked-doc aliases became editable without breaking references
  - backlinks became more visible
  - lock/selection and sidebar-to-editor drag-and-drop got tighter
- **February 2025**
  - split view was added
  - attachment and URL block handling improved
  - page blocks in the broader editor/edgeless system were further polished
- **April 2025**
  - edgeless alignment and highlighter tools improved
  - iframe embed blocks shipped
  - attachment-aware database properties were expanded
- **June 2025**
  - embed-doc-with-alias continued the cross-surface identity story
  - AI workspace/search features expanded, but as an upper-layer workflow feature rather than a canvas foundation

Sources:

- [AFFiNE September 2024 Update](https://affine.pro/blog/whats-new-affine-sep)
- [AFFiNE December 2024 Update](https://affine.pro/blog/whats-new-affine-dec-update)
- [AFFiNE February 2025 Update](https://affine.pro/blog/whats-new-feb-update)
- [AFFiNE April 2025 Update](https://affine.pro/blog/whats-new-april-update)
- [AFFiNE June 2025 Update](https://affine.pro/blog/whats-new-june-update)

### AFFiNE feature inventory: what xNet should actually borrow

The important takeaway is that AFFiNE’s best canvas features are mostly **interaction and identity patterns**, not a reason to copy AFFiNE’s exact internal doc/edgeless mode model.

| AFFiNE feature | Why it is strong | xNet stance |
| --- | --- | --- |
| Synced Docs / transclusion | Makes a whiteboard immediately useful because real documents can live on it | **Adopt now** as page objects backed by `Page` nodes |
| Center Peek | Preserves context while reading/editing linked content | **Adopt now** as a page/database peek state before full focus/open |
| Sidebar/editor/whiteboard drag-and-drop | Makes the canvas feel like the primary workspace, not a side feature | **Adopt now** through one unified ingestion pipeline |
| Attachment, URL, and embed-style blocks | Broadens the whiteboard from “notes only” to “anything spatial” | **Adopt now** for URLs and media; defer generic iframe embeds |
| Linked-doc aliases and stronger backlinks | Preserves identity while letting users rename and navigate contextually | **Adopt next** with object aliases, backlinks, and source-node metadata |
| Block references / link-to-block | Enables precise cross-surface references below the page level | **Adopt next** for block anchors, comments, and connector endpoints |
| Frame / group / lock / selection / tidy-up / align | These are the whiteboard polish features that make large boards feel manageable | **Adopt next** after page/database/url/media objects are solid |
| Split view | Good for side-by-side canvas + focused content workflows | **Adopt next** once focus/open flows are stable |
| Mind map / presentation generation | Useful, but not the foundation of a useful canvas | **Defer** until the primitive content model is solid |
| AI workspace / AI search | Valuable, but it sits above the scene architecture rather than defining it | **Defer** until object identity, search, and embedding are mature |
| One-click page/edgeless mode switching | Good in AFFiNE’s architecture, but not the right literal clone for xNet | **Reinterpret** as one node rendered across multiple surfaces |

### AFFiNE pull-forward map

```mermaid
mindmap
  root((AFFiNE Pull-Forwards))
    Adopt now
      Synced docs
      Center peek
      Drag and drop
      URL and media objects
    Adopt next
      Aliases and backlinks
      Block references
      Frame and group polish
      Lock and alignment
      Split view
    Defer
      Mind map
      Presentation workflows
      AI workspace
    Reinterpret
      "Doc <-> edgeless mode switch"
      "Same node rendered in multiple xNet surfaces"
```

### BlockSuite: useful as a headless UX reference, not as a replacement

BlockSuite’s official positioning is consistent with the product direction here:

- headless editor framework
- interoperable editor components
- collaboration as a first-class concern

That validates xNet’s decision to preserve its own architecture while borrowing interaction patterns.

Source:

- [BlockSuite](https://blocksuite.io/)

### tldraw: best-in-class reference for scene objects, bindings, and external content ingestion

tldraw’s docs are valuable because they break the whiteboard problem into concrete systems:

- shapes are records with type-specific props and behavior
- bindings persist relationships so arrows stay attached as objects move
- external content handling unifies pasted text, dropped files, and dropped URLs
- embed shapes distinguish embeddable URLs from bookmark-style fallbacks

Sources:

- [tldraw Shapes](https://tldraw.dev/docs/shapes)
- [tldraw Bindings](https://tldraw.dev/sdk-features/bindings)
- [tldraw External Content Handling](https://tldraw.dev/sdk-features/external-content)
- [tldraw Embed Shape](https://tldraw.dev/sdk-features/embed-shape)

### Yjs subdocuments: useful future optimization, not the primary v1 strategy

Yjs subdocuments support lazy-loaded nested documents within a root doc. That is interesting for canvas scenes that want document-like containment, but Yjs’s own docs also note that providers handle subdocuments differently and that they are typically treated as separate sync units.

That makes subdocs a future optimization or composition mechanism, not the main v1 strategy for xNet, because xNet already has working per-node Yjs document ownership.

Source:

- [Yjs Subdocuments](https://docs.yjs.dev/api/subdocuments)

### TanStack Virtual: the right philosophy for heavy embedded surfaces

TanStack Virtual’s docs reinforce the correct posture for database and embedded surface rendering:

- headless virtualization
- dynamic measurement support
- retain full control over markup and layout

This matters because canvas-embedded surfaces will need bespoke markup and zoom-aware measurement, not a monolithic virtualization widget.

Sources:

- [TanStack Virtual](https://tanstack.com/virtual)
- [TanStack Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer)

### URL preview standards: use standards-first fallback, not scraper-first special cases

For dropped URLs, the right resolution chain is standards-first:

- use `oEmbed` when a provider exposes an endpoint
- otherwise use Open Graph metadata
- otherwise render a generic link card

Why:

- `oEmbed` explicitly exists to turn a URL into structured preview or embed data
- Open Graph provides a widely adopted metadata baseline (`og:title`, `og:image`, `og:url`, etc.)

Sources:

- [oEmbed](https://oembed.com/)
- [The Open Graph protocol](https://ogp.me/)

### Browser and rendering guidance: layered canvases and off-main-thread rendering are the right direction

Browser platform guidance aligns with the hybrid renderer direction:

- MDN’s canvas optimization guidance explicitly recommends **multiple layered canvases** when different scene elements update at different rates.
- MDN’s `OffscreenCanvas` docs validate moving suitable canvas rendering work off the main thread.
- MDN’s `requestAnimationFrame` docs remain the right baseline for frame-synced rendering.
- web.dev’s canvas performance material reinforces pre-rendering, batching, and minimizing main-thread work.

These are directly applicable to xNet’s canvas:

- the infinite background grid should stay off the DOM path
- the minimap should stay canvas-based
- expensive, non-interactive far-field visuals should prefer canvas/WebGL
- the DOM layer should be reserved for the subset of objects that need rich interaction, focus, and editable semantics

Sources:

- [MDN: Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [web.dev: Improving HTML5 Canvas performance](https://web.dev/articles/canvas-performance)
- [web.dev: Rendering performance](https://web.dev/articles/rendering-performance)

### React hooks and query planning: canvas should reuse xNet’s main read path

Existing xNet explorations already point in the right direction:

- [0037](./0037_[_]_USEQUERY_PAGINATION.md) describes how `useQuery` should grow better pagination and loading semantics.
- [0106](./0106_[_]_JOIN_QUERIES_MULTI_TYPE_AGGREGATES_QUERY_PLANNING_API.md) describes how `useQuery` can evolve into richer query descriptors without losing the ergonomic root API.

That means canvas-oriented data access should be framed as:

- a new query shape under the same core hook model
- not a parallel canvas-only query stack

## Key Findings 🧠

### 1. The canvas should become a scene graph, not a generic bag of node props

Today’s `CanvasNodeType` is too weakly typed for the product ambition.

The canvas should instead model a small number of intentional object kinds:

- `page`
- `database`
- `external-reference`
- `media`
- `shape`
- `note`
- `group`

Observed fact:

- xNet already has strong node-backed primitives outside the canvas.

Inference:

- the canvas should spatially compose those primitives instead of pretending they are all just variations of a generic card.

### 2. Inline page editing is the highest-leverage v1 capability

Pages are already:

- collaborative Yjs docs
- rendered via `RichTextEditor`
- familiar as the main writing primitive

That makes “click to create a page on canvas and edit it there” the cleanest first major upgrade.

This is the direct path from “canvas shell card” to “canvas-native useful object.”

### 3. Databases should be live preview objects first, not full inline databases on day one

Databases are heavier:

- view-specific
- schema-driven
- more DOM-intensive
- more interaction-dense than pages

The right default is:

- render a live preview node on canvas
- let users open/focus the full database surface for deep editing

That keeps the canvas useful without blowing up complexity immediately.

### 4. Universal drop ingestion is a product requirement, not a stretch goal

Your additional requirement changes the canvas definition materially:

- the canvas must be the main drop target
- users should be able to drop internal nodes, external URLs, images, and files

That means xNet needs a single ingestion pipeline for:

- internal app drags
- OS file drops
- pasted URLs / dropped text
- embeddable URLs

This should be treated as a core architecture layer, not scattered event handling.

### 5. External links should become node-backed references

The repo already has `ExternalReferenceSchema`. That is the correct reuse point.

The missing work is:

- URL normalization
- preview resolution
- canvas rendering for the reference

This is much better than storing raw URLs only inside canvas-local props.

### 6. Media needs a reusable asset node, not only blob refs inside the scene

Blob storage already exists, but there is no reusable top-level “media asset” node schema in the built-in data model.

If dropped images/files matter across surfaces, they should become first-class node-backed objects.

That would let the same asset be:

- shown on canvas
- referenced in pages
- queried later
- shared and permissioned consistently

### 7. Connectors should behave like bindings, not just dumb lines

The current edge model already binds source and target node IDs, which is directionally correct. The next step is to formalize richer anchor semantics and persistence rules so connectors remain stable as the scene grows more heterogeneous.

This is where tldraw’s bindings model is useful as a conceptual reference.

### 8. The performance work already exists; it just is not driving the primary canvas runtime yet

The repo already contains:

- spatial indexing
- LOD rendering
- chunked canvas storage
- chunk load/evict orchestration

The exploration should therefore recommend **activating and integrating** this work, not inventing a brand new performance architecture.

### 9. The renderer should be explicitly hybrid, not “DOM with a few canvas helpers”

The correct rendering split is:

- **WebGL / Canvas**
  - infinite grid
  - minimap
  - far-field placeholders
  - eventually large batches of edges/connectors
- **DOM**
  - inline page editors
  - database previews with real controls
  - accessible focusable interactive surfaces
- **overlay**
  - selection affordances
  - context menus
  - presence chips and editing UI

This is the highest-value performance decision because it determines whether xNet can remain fluid as scenes get large.

### 10. `rbush` should remain the primary spatial index unless profiling proves otherwise

It is tempting to say “use a quadtree,” but for xNet’s current scene shape that is not yet the right default decision.

Observed fact:

- xNet already uses an R-tree (`rbush`) for arbitrary rectangular items.

Inference:

- keep the R-tree as the primary scene culling structure for v1
- only explore quadtree or Morton-tile alternatives if profiling shows a real bottleneck for:
  - highly uniform dense point-like objects
  - GPU-assisted picking paths
  - extreme minimap or heatmap workloads

This avoids unnecessary index churn while the larger renderer refactor is still underway.

### 11. Minimap and background grid should be promoted into the default shell architecture

The minimap and procedural grid are not optional polish anymore:

- they are part of how users orient themselves on a large infinite surface
- they are also part of the performance strategy, because they keep high-coverage visuals out of the DOM

The minimap should become:

- a simplified canvas-rendered scene overview
- driven by a lightweight display list, not the full interactive DOM tree
- optionally moved to `OffscreenCanvas` later if redraw volume justifies it

### 12. Canvas data access should stay inside xNet’s React hook model

The canvas should not reach into NodeStore manually for routine content loading.

Instead:

- `useNode` should own page/database/media object hydration where object identity is known
- `useDatabase` should own database preview/focus data flows
- `useQuery` should own side panels, searchable insert menus, recent object pickers, and future viewport-aware spatial queries

Longer term, it would be valuable for `useQuery` to grow spatial predicates such as:

- `withinRect`
- `intersectsRect`
- `nearPoint`
- potentially true geo-search semantics if xNet later treats location as a first-class indexed property

That would keep the canvas aligned with the rest of the platform instead of becoming a special-case island.

### 13. AFFiNE’s biggest lesson is cross-surface identity, not just visual richness

The strongest AFFiNE ideas are the ones that make one object feel native in multiple contexts:

- one doc can appear on the whiteboard and in document flows
- aliases can change display without breaking identity
- backlinks and block references make relationships inspectable
- split/peek interactions reduce costly navigation jumps

That maps well to xNet because xNet already has a node identity model. The missing work is to render that identity spatially and interactively on the canvas.

### 14. xNet should copy AFFiNE’s ergonomics, but not literally copy its mode system

AFFiNE often talks in terms of docs mode, edgeless mode, and embedding between them.

For xNet, the cleaner interpretation is:

- keep pages/databases/media as stable source nodes
- let canvas objects be views over those nodes
- allow peek, focus, split, alias, and backlinks across surfaces

This preserves xNet’s existing data boundaries while still capturing the best user experience ideas.

## Capability Breakdown 🧭

```mermaid
mindmap
  root((Canvas V1))
    Content objects
      Page cards
      Database previews
      URL references
      Media assets
      Notes
    Native primitives
      Shapes
      Connectors
      Groups
    Input system
      Internal drag
      URL paste/drop
      File drop
      Image drop
    Performance
      Spatial culling
      Chunk loading
      LOD
      Virtualization
    Collaboration
      Canvas presence
      Object selection
      Inline editing awareness
      Undo boundaries
```

## AFFiNE Feature Translation Matrix 🧲

```mermaid
flowchart LR
  subgraph Borrow["Borrow directly"]
    A1["Synced docs"]
    A2["Center peek"]
    A3["Drag/drop across surfaces"]
    A4["URL + media objects"]
  end

  subgraph Next["Borrow next"]
    B1["Aliases + backlinks"]
    B2["Block references"]
    B3["Frame/group polish"]
    B4["Lock + align + tidy up"]
    B5["Split view"]
  end

  subgraph Defer["Defer"]
    C1["Mind maps"]
    C2["Presentation flows"]
    C3["AI workspace/search"]
  end

  subgraph Reinterpret["Reinterpret for xNet"]
    D1["Doc/edgeless mode switch"]
    D2["One node, many surfaces"]
  end
```

## Options And Tradeoffs ⚖️

### Option A. Keep the current generic canvas types and add more props

What it means:

- keep `card/embed/shape/image/group`
- add `linkedType`, `previewKind`, `assetRef`, and more ad hoc props

Pros:

- smallest initial refactor
- low migration effort

Cons:

- scene semantics stay blurry
- harder to optimize per object kind
- every new capability becomes another convention instead of a contract

Verdict:

- good for prototypes
- wrong for a canvas-first product

### Option B. Refactor to explicit scene object kinds backed by existing xNet nodes

What it means:

- give the canvas an intentional object model
- keep rich content in Page/Database/ExternalReference/new MediaAsset nodes
- keep canvas docs focused on placement, sizing, grouping, connectors, and view state

Pros:

- clear contracts
- easier rendering and performance policies
- easier long-term extensibility
- matches xNet’s node-centric architecture

Cons:

- requires a more aggressive refactor now
- needs a migration or rewrite of existing canvas sample data and helpers

Verdict:

- **recommended**

### Option C. Replace the current canvas runtime with tldraw or BlockSuite

What it means:

- delegate scene model and canvas UX to an external editor stack

Pros:

- strong off-the-shelf UX references
- proven patterns for shapes, embeds, and bindings

Cons:

- deep architectural mismatch with xNet data ownership
- large adapter surface
- weaker fit for current Page/Database node model

Verdict:

- useful for inspiration
- not the right implementation path

## Recommendation ✅

### Recommended architecture

Use a **node-backed scene graph**:

- the `Canvas` doc stores scene objects, connectors, grouping, transforms, z-order, and canvas-local view state
- page/database/reference/media content remains in its own source node
- canvas objects point to source nodes through stable references

Recommended object kinds:

| Kind | Backed by | Default canvas behavior |
| --- | --- | --- |
| `page` | `Page` node | Card at distance, live editor when near/selected |
| `database` | `Database` node | Live preview card, open/focus for deep edit |
| `external-reference` | `ExternalReference` node | Bookmark/embed preview card |
| `media` | New `MediaAsset` node | Direct render with blob-backed preview |
| `shape` | Canvas-local primitive | Native canvas primitive |
| `note` | Either lightweight page or canvas-native note | Fast local note object |
| `group` | Canvas-local primitive | Selection/layout container |

### Recommended rendering stack

Use an explicit **hybrid render pipeline**:

- **Layer 0: WebGL background**
  - infinite grid
  - rulers/guides later
  - no DOM participation
- **Layer 1: canvas / WebGL overview layer**
  - minimap
  - far-field placeholders
  - simplified scene snapshots
- **Layer 2: DOM interaction layer**
  - page editors
  - database preview cards
  - media/object shells that need browser interaction
- **Layer 3: overlay layer**
  - selection boxes
  - handles
  - context UI
  - presence and comments

This is the right place to “toggle between Canvas and DOM”:

- not by switching the whole app between two renderers
- but by giving each layer the cheapest rendering substrate for its job

### Recommended minimap behavior

The minimap should:

- stay canvas-based
- render a simplified object display list, not real object components
- derive its data from the same scene object store and viewport state as the main surface
- support click-and-drag navigation
- optionally decimate or aggregate very dense scenes instead of rendering every object one-to-one

### Recommended index and culling strategy

For v1:

- keep `rbush` / R-tree as the primary culling index
- use chunking for memory management and scene load/evict
- use per-object LOD for mount/no-mount decisions

For future exploration:

- evaluate quadtree or Morton-coded tile indexes only if profiling shows R-tree pressure in very dense point-like scenes
- evaluate GPU picking only if DOM hit-testing and R-tree queries become a measurable bottleneck

### Recommended React hook strategy

Reuse xNet’s existing React contracts aggressively:

- `useNode(PageSchema, id)` for inline page cards
- `useNode(DatabaseSchema, id)` and `useDatabase(id)` for database preview/open behavior
- `useQuery(...)` for:
  - insert/search panels
  - recent objects
  - object pickers
  - future viewport-aware result windows

Longer term, canvas should drive query evolution rather than bypass it:

- add stable pagination helpers from the existing `useQuery` roadmap
- add spatial predicates as query descriptors
- treat geo/spatial search as part of the query engine, not an ad hoc canvas subsystem

### Recommended AFFiNE-inspired pulls

Pull the following into the product plan explicitly:

- **Adopt now**
  - synced-doc style page cards
  - center-peek for page/database objects
  - drag-and-drop parity between sidebar, focused views, and canvas
  - URL/media objects that feel first-class on the board
- **Adopt next**
  - aliases and backlinks for canvas-backed references
  - block-level deep links and anchors
  - lock, tidy-up, align, frame, and group polish
  - split canvas + focused-content workflows
- **Defer**
  - mind map as a special object family
  - presentation/storytelling mode
  - AI workspace orchestration on top of canvas objects
- **Do not clone literally**
  - xNet should not hinge on a separate “doc mode vs edgeless mode” storage split
  - xNet should instead render the same node identity across page, database, canvas, and future surfaces

### Recommended product behavior

#### Pages

- create page directly from the canvas
- mount `RichTextEditor` inline when the object is near enough or explicitly entered
- preserve page identity outside the canvas as a regular xNet page

#### Databases

- create and place database from the canvas
- render title, schema/view metadata, and a live preview slice
- open/focus the full database surface for dense editing

#### URLs

- on drop/paste, normalize URL and create or reuse an `ExternalReference`
- attempt `oEmbed`
- fall back to Open Graph
- fall back again to a generic link card

#### Images/files

- on drop, upload with `BlobService`
- create a first-class asset node
- place a media object on the canvas immediately

#### Shapes/connectors

- keep them native to the canvas
- make connectors attach to object anchors robustly
- allow shapes to frame or annotate node-backed content

### Recommended WebGL improvements

In addition to the existing procedural grid, xNet should consider:

- promoting the current WebGL grid to the default background path in the primary canvas shell
- moving minimap redraws to `OffscreenCanvas` later when supported and justified by profiling
- rendering far-field object placeholders as batched quads instead of DOM shells
- migrating high-cardinality edge rendering from per-edge DOM/SVG toward batched canvas/WebGL paths
- using dirty-rect or viewport-delta redraw strategies for minimap and overview layers
- keeping one clear frame-synced render scheduler so background layers redraw only when viewport or scene display lists actually change

## Proposed Runtime Shape 🏗️

```mermaid
flowchart TD
  CanvasDoc["Canvas Y.Doc<br/>scene objects + connectors + groups"] --> SceneObjects["Scene objects"]
  CanvasDoc --> Connectors["Connectors / bindings"]
  CanvasDoc --> ViewState["Viewport + selection + local scene metadata"]

  SceneObjects --> PageObj["page object<br/>sourceNodeId -> Page"]
  SceneObjects --> DbObj["database object<br/>sourceNodeId -> Database"]
  SceneObjects --> RefObj["external-reference object<br/>sourceNodeId -> ExternalReference"]
  SceneObjects --> MediaObj["media object<br/>sourceNodeId -> MediaAsset"]
  SceneObjects --> ShapeObj["shape object"]
  SceneObjects --> NoteObj["note object"]
  SceneObjects --> GroupObj["group object"]

  PageObj --> PageDoc["Page Y.Doc"]
  DbObj --> DbDoc["Database Y.Doc"]
  RefObj --> RefNode["ExternalReference node"]
  MediaObj --> Blob["BlobService / file refs"]

  style CanvasDoc fill:#e0f2fe
  style PageDoc fill:#dcfce7
  style DbDoc fill:#dcfce7
  style Blob fill:#fef3c7
```

## Hybrid Layer Model 🎛️

```mermaid
flowchart TB
  subgraph Shell["Viewport Shell"]
    Background["Layer 0<br/>WebGL grid / guides"]
    Overview["Layer 1<br/>Canvas minimap + far-field overview"]
    DOM["Layer 2<br/>Virtualized DOM objects"]
    Overlay["Layer 3<br/>Selection / presence / comments"]
  end

  Background --> Viewport["Viewport changes"]
  Overview --> SceneList["Simplified scene display list"]
  DOM --> NearField["Near-field interactive objects"]
  Overlay --> UIState["Selection / editing / presence state"]

  SceneIndex["R-tree + chunks"] --> SceneList
  SceneIndex --> NearField
  QueryLayer["useNode / useDatabase / useQuery"] --> NearField

  style Background fill:#dbeafe
  style Overview fill:#dbeafe
  style DOM fill:#dcfce7
  style Overlay fill:#fef3c7
```

## Implementation Roadmap 🛠️

### Phase 1. Replace placeholder canvas semantics

- introduce an explicit scene object type system
- replace generic linked shell cards with typed page/database/reference/media objects
- remove or de-emphasize mock embed flows and generic placeholder assumptions

### Phase 2. Ship page cards and universal drop ingestion

- create page on canvas
- inline page editing with zoom/selection gating
- add center-peek behavior for linked page/database objects
- add drop ingestion pipeline for:
  - internal node drags
  - URLs
  - files/images

### Phase 3. Ship database preview objects and robust connectors

- add database preview cards
- wire focus/open flows
- upgrade connector anchoring and persistence
- make sidebar/focused-view drag-and-drop parity a first-class flow
- add aliases and backlinks to linked canvas objects

### Phase 4. Activate true infinite runtime paths

- route the main canvas runtime through chunked scene loading
- combine chunk visibility with per-object LOD
- mount heavy objects only when visible and close enough
- make minimap and overview display lists derive from the same chunked scene source
- keep the background grid and minimap out of the DOM path by default
- define frame budgets for 60Hz and 120Hz targets
- add lock, align, tidy-up, frame, and group polish on top of the stabilized runtime

### Phase 5. Collaboration and polish

- separate canvas awareness from inline content awareness
- refine undo/redo scope boundaries
- add accessibility and regression hardening
- evolve `useQuery` and descriptor tooling for viewport windows, pagination, and future spatial predicates
- add split-view workflows and block/deep-link anchors
- revisit mind map, presentation, and AI layers only after the core object model is solid

## Drop And Edit Lifecycle

```mermaid
sequenceDiagram
  participant U as User
  participant C as Canvas Surface
  participant I as Ingestion Layer
  participant R as Resolver Layer
  participant N as NodeStore / Source Nodes
  participant B as BlobService

  U->>C: Drop URL / image / file / internal item
  C->>I: Normalize external content payload
  I->>R: Resolve type and metadata

  alt URL
    R->>N: Create or reuse ExternalReference node
  else Image or file
    R->>B: Upload file
    R->>N: Create MediaAsset node
  else Internal page/database
    R->>N: Reuse existing source node
  else New page/database
    R->>N: Create source node
  end

  R-->>C: Return typed scene object payload
  C->>C: Insert scene object at drop point
  C-->>U: Render card / preview / live object
```

## Performance And Collaboration Guidance 🚀

### Performance

The performance strategy should be two-stage:

1. **scene-level culling**
   - use chunked loading and spatial queries to decide which objects are even in memory/render scope
2. **object-level LOD**
   - only mount expensive content when the object is visible and close enough

Practical policy:

- far zoom: metadata rectangles only
- mid zoom: preview DOM
- near zoom: live editor/media/embed DOM

For databases specifically:

- preview cards should render a bounded slice
- full table/board editing stays in focused mode in v1
- use headless virtualization for any embedded table preview that can grow

### Hybrid Canvas + DOM policy

Use the browser intentionally:

- render coverage-heavy visuals on Canvas/WebGL
- render only interaction-heavy surfaces in DOM
- do not pay DOM costs for full-scene affordances like the grid or minimap

Recommended toggling rules:

- **background grid**: always WebGL/canvas
- **minimap**: always canvas
- **far-field objects**: batched canvas/WebGL placeholders
- **near-field objects**: DOM
- **editing state**: DOM only when selected/entered/near enough
- **connectors**:
  - v1 can stay mixed
  - long-term should trend toward a batched non-DOM layer

### Frame budget targets

The canvas should be designed against both common refresh classes:

- **60Hz target**: stay comfortably within a `16.67ms` frame
- **120Hz target**: aim for a substantially tighter working budget, roughly `8.33ms` per frame

Practical implication:

- keep scene culling and display-list computation cheap
- only mount a bounded number of interactive DOM nodes
- make background and overview layers cheap enough to redraw every viewport tick

### Indexing recommendation

For v1:

- keep the current R-tree (`rbush`) as the main arbitrary-rectangle scene index
- layer chunking on top for memory locality and eviction
- treat quadtree as a future experiment, not a default replacement

Why:

- xNet’s scene objects are large, variable-sized rectangles rather than uniform points
- the existing code and tests already assume the R-tree path
- the bigger win right now is hybrid rendering, not index churn

### React hook integration

The canvas should leverage existing hook boundaries aggressively:

- `useNode` for object-backed page/database/media/reference hydration
- `useDatabase` for paginated preview slices and full database focus surfaces
- `useQuery` for lists, sidebars, search, insert menus, relation pickers, and future viewport windows

Longer term, it is reasonable for `useQuery` to grow canvas-aware query descriptors such as:

- `withinRect`
- `intersectsRect`
- `near`
- `orderByDistance`

And even later, if xNet adds first-class location data:

- geo-aware index support in the query planner
- a hook-level geosearch surface that still compiles through the same descriptor pipeline

That keeps the canvas integrated with xNet’s main platform abstractions.

### AFFiNE-derived UX details worth pulling forward

Once the core scene model lands, the highest-value UX refinements from AFFiNE are:

- context-preserving peek before full open
- drag objects from navigation surfaces directly into the canvas
- editable aliases on linked cards without breaking identity
- visible backlinks from page/database objects to the canvases that reference them
- lock and selection states that reduce accidental edits on dense boards
- alignment / tidy-up actions that can operate on large selections efficiently

These should be treated as product requirements for the second pass, not miscellaneous polish.

### Collaboration

Split collaboration into scopes:

- **canvas scope**
  - selection
  - movement
  - viewport presence
  - object insertion/removal
- **content scope**
  - page editing awareness
  - database editing awareness
  - comments and rich editing interactions

This avoids conflating “I am moving the page object” with “I am editing the page document.”

### Subdocuments

Yjs subdocuments are worth tracking as a future path for:

- nested scene composition
- explicit lazy loading inside a root doc

But v1 should not depend on them. xNet already has a simpler, working architecture with separate per-node Yjs docs.

## Example Code 💡

### 1. Recommended scene object union

```ts
type CanvasObjectKind =
  | 'page'
  | 'database'
  | 'external-reference'
  | 'media'
  | 'shape'
  | 'note'
  | 'group'

type CanvasObjectFrame = {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  zIndex?: number
}

type CanvasSceneObject =
  | {
      id: string
      kind: 'page'
      frame: CanvasObjectFrame
      sourceNodeId: string
      sourceSchemaId: 'xnet://xnet.fyi/Page@1.0.0'
      display: { mode: 'card' | 'preview' | 'live' }
    }
  | {
      id: string
      kind: 'database'
      frame: CanvasObjectFrame
      sourceNodeId: string
      sourceSchemaId: 'xnet://xnet.fyi/Database@1.0.0'
      display: { mode: 'card' | 'preview' }
    }
  | {
      id: string
      kind: 'external-reference'
      frame: CanvasObjectFrame
      sourceNodeId: string
      sourceSchemaId: 'xnet://xnet.fyi/ExternalReference@1.0.0'
      display: { mode: 'bookmark' | 'embed' }
    }
  | {
      id: string
      kind: 'media'
      frame: CanvasObjectFrame
      sourceNodeId: string
      sourceSchemaId: 'xnet://xnet.fyi/MediaAsset@1.0.0'
      assetRef: { cid: string; mimeType: string; name: string; size: number }
    }
  | {
      id: string
      kind: 'shape'
      frame: CanvasObjectFrame
      shape: 'rectangle' | 'ellipse' | 'diamond' | 'triangle'
      style: { fill?: string; stroke?: string }
    }
```

### 2. Recommended drop-ingestion boundary

```ts
type ExternalCanvasDrop =
  | { type: 'internal-node'; nodeId: string; schemaId: string }
  | { type: 'url'; url: string }
  | { type: 'files'; files: File[] }
  | { type: 'text'; text: string }

type CanvasDropResult =
  | { kind: 'page'; sourceNodeId: string }
  | { kind: 'database'; sourceNodeId: string }
  | { kind: 'external-reference'; sourceNodeId: string }
  | { kind: 'media'; sourceNodeId: string }
  | { kind: 'note'; sourceNodeId: string | null }

async function ingestCanvasDrop(
  input: ExternalCanvasDrop,
  deps: {
    createPage: () => Promise<string>
    createExternalReference: (url: string) => Promise<string>
    createMediaAsset: (file: File) => Promise<string>
  }
): Promise<CanvasDropResult[]> {
  switch (input.type) {
    case 'internal-node':
      return input.schemaId.includes('/Page')
        ? [{ kind: 'page', sourceNodeId: input.nodeId }]
        : [{ kind: 'database', sourceNodeId: input.nodeId }]

    case 'url':
      return [
        {
          kind: 'external-reference',
          sourceNodeId: await deps.createExternalReference(input.url)
        }
      ]

    case 'files':
      return Promise.all(
        input.files.map(async (file) => ({
          kind: 'media' as const,
          sourceNodeId: await deps.createMediaAsset(file)
        }))
      )

    case 'text':
      return input.text.startsWith('http')
        ? [
            {
              kind: 'external-reference',
              sourceNodeId: await deps.createExternalReference(input.text)
            }
          ]
        : [{ kind: 'note', sourceNodeId: await deps.createPage() }]
  }
}
```

### 3. Zoom-aware render policy

```ts
function resolveObjectRenderMode(
  kind: CanvasObjectKind,
  zoom: number,
  selected: boolean
): 'placeholder' | 'card' | 'preview' | 'live' {
  if (zoom < 0.15) return 'placeholder'
  if (kind === 'page') {
    if (selected && zoom >= 0.75) return 'live'
    if (zoom >= 0.4) return 'preview'
    return 'card'
  }
  if (kind === 'database') {
    if (zoom >= 0.5) return 'preview'
    return 'card'
  }
  if (kind === 'external-reference' || kind === 'media') {
    return zoom >= 0.35 ? 'preview' : 'card'
  }
  return 'card'
}
```

### 4. Future viewport-aware query descriptor

```ts
const { data: visiblePages } = useQuery(PageSchema, {
  where: { canvasId },
  limit: 200,
  // Future descriptor-level extension, not current API
  withinRect: {
    x: viewportRect.x,
    y: viewportRect.y,
    width: viewportRect.width,
    height: viewportRect.height
  },
  orderByDistance: {
    x: viewportCenter.x,
    y: viewportCenter.y
  }
})
```

### 5. Layer assignment policy

```ts
type RenderLayer = 'webgl-background' | 'canvas-overview' | 'dom-interactive' | 'overlay'

function resolveRenderLayer(
  kind: CanvasObjectKind,
  zoom: number,
  selected: boolean
): RenderLayer {
  if (kind === 'shape' && zoom < 0.2) return 'canvas-overview'
  if (kind === 'page' && selected && zoom >= 0.75) return 'dom-interactive'
  if (kind === 'database' && zoom >= 0.5) return 'dom-interactive'
  if (kind === 'external-reference' || kind === 'media') {
    return zoom >= 0.35 ? 'dom-interactive' : 'canvas-overview'
  }
  return 'canvas-overview'
}
```

## Implementation Checklist 📋

- [ ] Replace the generic canvas object contract with explicit scene object kinds.
- [ ] Add a new reusable media/asset node schema for dropped images/files.
- [ ] Route page creation on canvas to real `Page` nodes.
- [ ] Render inline live page editors behind zoom/selection gating.
- [ ] Render database preview cards backed by real `Database` nodes.
- [ ] Add connector anchor/binding metadata that survives move/resize.
- [ ] Implement a unified canvas ingestion pipeline for internal drags, URLs, text, and files.
- [ ] Reuse `ExternalReferenceSchema` for dropped URLs.
- [ ] Implement `oEmbed -> Open Graph -> generic card` URL resolution.
- [ ] Reuse `BlobService` for dropped image/file persistence.
- [ ] Promote chunked canvas storage and chunk manager into the primary renderer path.
- [ ] Promote the procedural WebGL grid into the default background renderer path.
- [ ] Promote the existing canvas minimap into the default navigation architecture.
- [ ] Define explicit Canvas/WebGL/DOM layer responsibilities and mount rules.
- [ ] Gate expensive DOM mounts behind visibility and LOD.
- [ ] Keep `rbush` as the primary scene index unless profiling proves it is the bottleneck.
- [ ] Split canvas collaboration state from inline content collaboration state.
- [ ] Reuse `useNode`, `useDatabase`, and `useQuery` for canvas object hydration and side-panel data access.
- [ ] Extend query descriptors later for viewport windows, pagination helpers, and future spatial predicates.
- [ ] Add center-peek state for page/database objects before full focus/open transitions.
- [ ] Add sidebar/focused-surface drag-and-drop parity into the canvas ingestion flow.
- [ ] Add aliases, backlinks, and block/deep-link anchors for linked canvas objects.
- [ ] Add lock, align, tidy-up, frame, and group actions once the base runtime is stable.
- [ ] Update Storybook workbenches to reflect the new typed scene model.

## Validation Checklist 🧪

- [ ] Create a page directly on canvas and edit it inline with another collaborator connected.
- [ ] Create a database directly on canvas and verify preview freshness after row/schema changes.
- [ ] Drag an existing page onto the canvas and preserve identity rather than duplicating content.
- [ ] Drag an existing database onto the canvas and verify preview/open behavior.
- [ ] Drop a URL that supports `oEmbed` and verify embed-capable preview behavior.
- [ ] Drop a URL without `oEmbed` but with Open Graph metadata and verify bookmark rendering.
- [ ] Drop a URL without preview metadata and verify generic link fallback.
- [ ] Drop an image and verify upload, preview sizing, and persistence after reload.
- [ ] Drop a non-image file and verify media/file object rendering and retrieval.
- [ ] Draw shapes and connectors around page/database/media objects.
- [ ] Move or resize connected objects and confirm connectors stay attached correctly.
- [ ] Verify the minimap stays canvas-based and remains responsive while panning large scenes.
- [ ] Verify the background grid remains non-DOM and scales infinitely without DOM growth.
- [ ] Pan across a large scene and confirm bounded DOM count and stable frame times.
- [ ] Verify chunk load/evict behavior under large-scene navigation.
- [ ] Verify far-away objects do not mount inline editors.
- [ ] Verify 60Hz and 120Hz devices both remain smooth under viewport movement.
- [ ] Verify hook-driven side panels and pickers do not fall back to manual store scans.
- [ ] Verify center-peek preserves spatial context and transitions cleanly into full focus/open.
- [ ] Verify linked-object aliases do not break identity, backlinks, or connector targets.
- [ ] Verify lock/select/alignment tools behave predictably on large multi-object selections.
- [ ] Verify undo/redo boundaries between scene changes and content edits.
- [ ] Verify keyboard selection, focus management, and accessible labels for canvas objects.

## References 🔗

### Repository references

- [`packages/canvas/src/types.ts`](../../packages/canvas/src/types.ts)
- [`packages/canvas/src/renderer/Canvas.tsx`](../../packages/canvas/src/renderer/Canvas.tsx)
- [`packages/canvas/src/nodes/CanvasNodeComponent.tsx`](../../packages/canvas/src/nodes/CanvasNodeComponent.tsx)
- [`packages/canvas/src/chunks/chunked-canvas-store.ts`](../../packages/canvas/src/chunks/chunked-canvas-store.ts)
- [`packages/canvas/src/chunks/chunk-manager.ts`](../../packages/canvas/src/chunks/chunk-manager.ts)
- [`packages/canvas/src/store.ts`](../../packages/canvas/src/store.ts)
- [`packages/canvas/src/components/Minimap.tsx`](../../packages/canvas/src/components/Minimap.tsx)
- [`packages/canvas/src/layers/index.ts`](../../packages/canvas/src/layers/index.ts)
- [`packages/canvas/src/layers/webgl-grid.ts`](../../packages/canvas/src/layers/webgl-grid.ts)
- [`apps/electron/src/renderer/App.tsx`](../../apps/electron/src/renderer/App.tsx)
- [`apps/electron/src/renderer/components/CanvasView.tsx`](../../apps/electron/src/renderer/components/CanvasView.tsx)
- [`apps/electron/src/renderer/lib/canvas-shell.ts`](../../apps/electron/src/renderer/lib/canvas-shell.ts)
- [`packages/data/src/schema/schemas/page.ts`](../../packages/data/src/schema/schemas/page.ts)
- [`packages/data/src/schema/schemas/database.ts`](../../packages/data/src/schema/schemas/database.ts)
- [`packages/data/src/schema/schemas/canvas.ts`](../../packages/data/src/schema/schemas/canvas.ts)
- [`packages/data/src/schema/schemas/external-reference.ts`](../../packages/data/src/schema/schemas/external-reference.ts)
- [`packages/data/src/blob/blob-service.ts`](../../packages/data/src/blob/blob-service.ts)
- [`packages/editor/src/hooks/useImageUpload.ts`](../../packages/editor/src/hooks/useImageUpload.ts)
- [`packages/editor/src/hooks/useFileUpload.ts`](../../packages/editor/src/hooks/useFileUpload.ts)
- [`packages/react/src/hooks/useQuery.ts`](../../packages/react/src/hooks/useQuery.ts)
- [`docs/explorations/0037_[_]_USEQUERY_PAGINATION.md`](./0037_[_]_USEQUERY_PAGINATION.md)
- [`docs/explorations/0068_[-]_CANVAS_OPTIMIZATION.md`](./0068_[-]_CANVAS_OPTIMIZATION.md)
- [`docs/explorations/0106_[_]_JOIN_QUERIES_MULTI_TYPE_AGGREGATES_QUERY_PLANNING_API.md`](./0106_[_]_JOIN_QUERIES_MULTI_TYPE_AGGREGATES_QUERY_PLANNING_API.md)

### Web research

- [AFFiNE July 2024 Update](https://affine.pro/blog/whats-new-affine-2024-07)
- [AFFiNE September 2024 Update](https://affine.pro/blog/whats-new-affine-sep)
- [AFFiNE November 2024 Update](https://affine.pro/blog/whats-new-affine-nov-update)
- [AFFiNE December 2024 Update](https://affine.pro/blog/whats-new-affine-dec-update)
- [AFFiNE February 2025 Update](https://affine.pro/blog/whats-new-feb-update)
- [AFFiNE April 2025 Update](https://affine.pro/blog/whats-new-april-update)
- [AFFiNE June 2025 Update](https://affine.pro/blog/whats-new-june-update)
- [AFFiNE home](https://affine.pro/)
- [BlockSuite](https://blocksuite.io/)
- [tldraw Shapes](https://tldraw.dev/docs/shapes)
- [tldraw Bindings](https://tldraw.dev/sdk-features/bindings)
- [tldraw External Content Handling](https://tldraw.dev/sdk-features/external-content)
- [tldraw Embed Shape](https://tldraw.dev/sdk-features/embed-shape)
- [Yjs Subdocuments](https://docs.yjs.dev/api/subdocuments)
- [TanStack Virtual](https://tanstack.com/virtual)
- [TanStack Virtualizer API](https://tanstack.com/virtual/latest/docs/api/virtualizer)
- [oEmbed](https://oembed.com/)
- [The Open Graph protocol](https://ogp.me/)
- [MDN: Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas)
- [MDN: OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [web.dev: Improving HTML5 Canvas performance](https://web.dev/articles/canvas-performance)
- [web.dev: Rendering performance](https://web.dev/articles/rendering-performance)

## Recommendation In One Sentence

xNet should evolve the canvas into a **typed, node-backed, drop-first infinite scene graph** with a deliberate **hybrid WebGL/Canvas/DOM renderer**, where pages are live editable on-canvas, databases default to preview/open behavior, URLs and media become first-class objects, AFFiNE-style peek/alias/backlink ergonomics are layered on top, and chunked + zoom-aware rendering keep the surface fluid at scale.
