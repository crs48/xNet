# Canvas Optimization: Infinite Scale, WebGL Rendering, and Professional Diagramming

> How do we transform xNet's canvas into a professional-grade diagramming surface that rivals Figma, Miro, and Affine? This exploration covers virtualization strategies, multi-layer WebGL rendering, lazy-loading for infinite canvases, dense graph support, live presence, and the full spectrum of features needed for a world-class collaborative whiteboard.

**Date**: February 2026
**Status**: Exploration
**Prerequisites**: [0043_OFF_MAIN_THREAD_ARCHITECTURE.md](./0043_OFF_MAIN_THREAD_ARCHITECTURE.md), [0066_OFF_MAIN_THREAD_IMPLEMENTATION.md](./0066_OFF_MAIN_THREAD_IMPLEMENTATION.md)

## Executive Summary

The current canvas implementation uses DOM-based rendering with CSS transforms and an rbush R-tree for spatial indexing. This works well for ~1,000 nodes but will not scale to:

- **Infinite canvases** with 100,000+ nodes
- **Dense graphs** with 10,000+ edges (flowcharts, mind maps, architecture diagrams)
- **Real-time collaboration** with 50+ concurrent users
- **Professional diagramming** (arbitrary shapes, curves, connectors, swimlanes)
- **Embedded rich content** (databases, pages, code blocks, mermaid diagrams)

This exploration proposes a **multi-layer architecture** that combines:

1. **WebGL background layer** - Grid, guides, and decorative elements at 60fps
2. **Canvas 2D edge layer** - Thousands of edges with GPU-accelerated path rendering
3. **Virtualized DOM layer** - Interactive nodes with full React component power
4. **Overlay layer** - Presence cursors, selection boxes, comments

```
┌─────────────────────────────────────────────────────────────────┐
│                        Viewport Container                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              WebGL Layer (Background)                    │   │
│  │  - Infinite grid (procedural, never allocates)          │   │
│  │  - Guides and rulers                                     │   │
│  │  - Gradient backgrounds                                  │   │
│  │  - Performance: 60fps at any zoom level                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Canvas 2D Layer (Edges)                     │   │
│  │  - Bezier curves, orthogonal connectors                  │   │
│  │  - Arrow heads, labels                                   │   │
│  │  - Instanced rendering for 10k+ edges                    │   │
│  │  - Path caching and incremental updates                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Virtualized DOM Layer (Nodes)               │   │
│  │  - Only visible nodes in DOM                             │   │
│  │  - Full React component power                            │   │
│  │  - TipTap editors, databases, code blocks                │   │
│  │  - CSS transforms for positioning                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Overlay Layer (Presence)                    │   │
│  │  - Live cursors with user names                          │   │
│  │  - Selection rectangles                                  │   │
│  │  - Comment pins                                          │   │
│  │  - Drag previews                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Part 1: Current State Analysis

### What Works Today

| Feature          | Implementation            | Limits                 |
| ---------------- | ------------------------- | ---------------------- |
| Spatial indexing | rbush R-tree              | Good for ~10k nodes    |
| Viewport culling | 200px buffer              | Works, no LOD          |
| Pan/zoom         | CSS transforms            | Smooth                 |
| Node rendering   | React components          | ~500 nodes before jank |
| Edge rendering   | SVG paths                 | ~200 edges before jank |
| Selection        | Multi-select with shift   | Works                  |
| Auto-layout      | ELK.js (async)            | Blocks main thread     |
| Comments         | Position + object anchors | Works                  |

### What's Missing

| Feature             | Status      | Impact                       |
| ------------------- | ----------- | ---------------------------- |
| Infinite grid       | None        | No visual scale reference    |
| Minimap             | None        | Lost on large canvases       |
| Lazy-loading        | None        | All nodes in memory          |
| Level-of-detail     | None        | No zoom-based simplification |
| WebGL rendering     | None        | CPU-bound edges/grid         |
| Live cursors        | None        | No presence beyond selection |
| Arbitrary shapes    | Basic       | No freehand, diagrams        |
| Mermaid diagrams    | None        | No diagram embedding         |
| Edge routing        | Auto-anchor | No smart avoidance           |
| Chunked storage     | None        | All in one Y.Map             |
| Worker-based layout | None        | ELK blocks UI                |

### Performance Profile

Current benchmarks (M1 MacBook Pro, Chrome 122):

| Scenario               | Frame Time | Rating     |
| ---------------------- | ---------- | ---------- |
| 100 nodes, 50 edges    | 4ms        | Excellent  |
| 500 nodes, 200 edges   | 12ms       | Good       |
| 1000 nodes, 500 edges  | 28ms       | Acceptable |
| 2000 nodes, 1000 edges | 65ms       | Janky      |
| 5000 nodes, 2500 edges | 180ms      | Unusable   |

The bottlenecks in order:

1. **SVG edge rendering** - Each edge is a separate SVG path element
2. **React reconciliation** - Even memoized, 1000+ components hurt
3. **DOM layout** - CSS transforms are fast, but layout is not
4. **No LOD** - Full detail at any zoom level

## Part 2: Multi-Layer Rendering Architecture

### Layer 1: WebGL Background (Grid, Guides, Decorations)

The grid should be **procedurally generated** in a fragment shader. This means:

- Zero allocations regardless of canvas size
- Constant GPU cost at any zoom level
- Sub-pixel rendering for crisp lines
- Smooth transitions between zoom levels

```glsl
// grid.frag - Procedural infinite grid
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;
uniform vec4 u_gridColor;
uniform vec4 u_majorGridColor;
uniform float u_gridSpacing;
uniform float u_majorEvery;

void main() {
    // Transform screen coordinates to canvas coordinates
    vec2 canvasPos = (gl_FragCoord.xy - u_resolution * 0.5) / u_zoom + u_pan;

    // Calculate grid lines
    vec2 grid = abs(fract(canvasPos / u_gridSpacing - 0.5) - 0.5);
    vec2 majorGrid = abs(fract(canvasPos / (u_gridSpacing * u_majorEvery) - 0.5) - 0.5);

    // Anti-aliased lines (1px regardless of zoom)
    float lineWidth = 1.0 / u_zoom;
    float minorLine = min(
        smoothstep(lineWidth, 0.0, grid.x),
        smoothstep(lineWidth, 0.0, grid.y)
    );
    float majorLine = min(
        smoothstep(lineWidth * 1.5, 0.0, majorGrid.x),
        smoothstep(lineWidth * 1.5, 0.0, majorGrid.y)
    );

    // Composite
    vec4 color = vec4(0.0);
    color = mix(color, u_gridColor, minorLine * 0.3);
    color = mix(color, u_majorGridColor, majorLine * 0.6);

    gl_FragColor = color;
}
```

**Implementation notes:**

- Use a single full-screen quad
- Uniforms updated on viewport change (not every frame)
- Optional: Add axis lines at origin (x=0, y=0) in different color
- Optional: Dot grid pattern as alternative (use `step()` instead of lines)

### Layer 2: Canvas 2D Edges (High-Performance Path Rendering)

SVG doesn't scale. At 1000+ edges, DOM overhead kills performance. Canvas 2D with careful optimization can render 10,000+ edges at 60fps.

**Key optimizations:**

1. **Path caching**: Store `Path2D` objects, only recreate on edge change
2. **Batch by style**: Group edges by stroke color/width, minimize state changes
3. **Culling**: Only draw edges with at least one endpoint visible (expand viewport buffer)
4. **Level-of-detail**: At low zoom, skip labels and simplify curves
5. **Incremental updates**: Don't clear the entire canvas on pan

```typescript
// edge-renderer.ts
interface CachedEdge {
  id: string
  path: Path2D
  bounds: Rect
  style: EdgeStyle
  version: number
}

class EdgeRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private cache = new Map<string, CachedEdge>()
  private styleGroups = new Map<string, string[]>() // styleKey -> edgeIds

  render(edges: CanvasEdge[], viewport: Viewport, nodePositions: Map<string, Rect>) {
    const ctx = this.ctx
    const visibleRect = viewport.getVisibleRect()
    const buffer = 100 / viewport.zoom
    const expandedRect = expandRect(visibleRect, buffer)

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Apply viewport transform
    ctx.setTransform(
      viewport.zoom,
      0,
      0,
      viewport.zoom,
      -viewport.x * viewport.zoom + this.canvas.width / 2,
      -viewport.y * viewport.zoom + this.canvas.height / 2
    )

    // Group edges by style
    this.updateStyleGroups(edges)

    // Render each style group (minimizes ctx state changes)
    for (const [styleKey, edgeIds] of this.styleGroups) {
      const style = this.parseStyleKey(styleKey)
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = style.strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      // Batch all paths with same style
      ctx.beginPath()
      for (const id of edgeIds) {
        const cached = this.getOrCreateCachedEdge(id, edges, nodePositions)
        if (!cached || !intersects(cached.bounds, expandedRect)) continue

        // Add path to current batch
        this.addPathToBatch(ctx, cached.path)
      }
      ctx.stroke()
    }

    // Draw labels (if zoom > threshold)
    if (viewport.zoom > 0.5) {
      this.renderLabels(edges, viewport, expandedRect)
    }
  }

  private getOrCreateCachedEdge(
    id: string,
    edges: CanvasEdge[],
    nodePositions: Map<string, Rect>
  ): CachedEdge | null {
    const edge = edges.find((e) => e.id === id)
    if (!edge) return null

    const cached = this.cache.get(id)
    const sourceRect = nodePositions.get(edge.sourceId)
    const targetRect = nodePositions.get(edge.targetId)
    if (!sourceRect || !targetRect) return null

    // Check if cache is valid
    const version = this.computeVersion(edge, sourceRect, targetRect)
    if (cached && cached.version === version) return cached

    // Create new path
    const path = this.createEdgePath(edge, sourceRect, targetRect)
    const bounds = this.computePathBounds(edge, sourceRect, targetRect)

    const newCached: CachedEdge = {
      id,
      path,
      bounds,
      style: edge.style ?? defaultEdgeStyle,
      version
    }
    this.cache.set(id, newCached)
    return newCached
  }

  private createEdgePath(edge: CanvasEdge, source: Rect, target: Rect): Path2D {
    const path = new Path2D()

    const sourceAnchor = this.computeAnchor(source, edge.sourceAnchor ?? 'auto', target)
    const targetAnchor = this.computeAnchor(target, edge.targetAnchor ?? 'auto', source)

    if (edge.style?.curved) {
      // Bezier curve
      const dx = targetAnchor.x - sourceAnchor.x
      const dy = targetAnchor.y - sourceAnchor.y
      const cx1 = sourceAnchor.x + dx * 0.5
      const cy1 = sourceAnchor.y
      const cx2 = targetAnchor.x - dx * 0.5
      const cy2 = targetAnchor.y

      path.moveTo(sourceAnchor.x, sourceAnchor.y)
      path.bezierCurveTo(cx1, cy1, cx2, cy2, targetAnchor.x, targetAnchor.y)
    } else {
      // Straight line
      path.moveTo(sourceAnchor.x, sourceAnchor.y)
      path.lineTo(targetAnchor.x, targetAnchor.y)
    }

    // Arrow head
    if (edge.style?.markerEnd === 'arrow') {
      this.addArrowHead(path, sourceAnchor, targetAnchor)
    }

    return path
  }
}
```

### Layer 3: Virtualized DOM Nodes

React remains the best choice for interactive nodes because:

- Rich text editing (TipTap) requires DOM
- Embedded databases require full component lifecycle
- Accessibility (screen readers need real DOM elements)
- Developer familiarity

**Virtualization strategy:**

```typescript
// virtualized-node-layer.tsx
interface VirtualizedNodeLayerProps {
  nodes: CanvasNode[]
  viewport: Viewport
  spatialIndex: SpatialIndex
  onNodeChange: (id: string, changes: Partial<CanvasNode>) => void
}

export function VirtualizedNodeLayer({
  nodes,
  viewport,
  spatialIndex,
  onNodeChange
}: VirtualizedNodeLayerProps) {
  // Get visible node IDs from spatial index (O(log n))
  const visibleNodeIds = useMemo(() => {
    const rect = viewport.getVisibleRect()
    const buffer = 300 / viewport.zoom // Larger buffer for scroll
    return spatialIndex.search(expandRect(rect, buffer))
  }, [spatialIndex, viewport.x, viewport.y, viewport.zoom])

  // Create node lookup for O(1) access
  const nodeMap = useMemo(
    () => new Map(nodes.map(n => [n.id, n])),
    [nodes]
  )

  // Only render visible nodes
  const visibleNodes = useMemo(
    () => visibleNodeIds.map(id => nodeMap.get(id)).filter(Boolean),
    [visibleNodeIds, nodeMap]
  )

  // Level-of-detail: use simplified rendering at low zoom
  const lod = useMemo(() => {
    if (viewport.zoom < 0.1) return 'placeholder' // Just colored rectangles
    if (viewport.zoom < 0.3) return 'minimal'     // Title only
    if (viewport.zoom < 0.6) return 'compact'     // Title + icon
    return 'full'                                  // Full content
  }, [viewport.zoom])

  return (
    <div
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        pointerEvents: 'none', // Allow click-through to background
        transform: viewport.getTransform(),
        transformOrigin: '0 0'
      }}
    >
      {visibleNodes.map(node => (
        <VirtualizedNode
          key={node.id}
          node={node}
          lod={lod}
          onNodeChange={onNodeChange}
        />
      ))}
    </div>
  )
}

const VirtualizedNode = memo(function VirtualizedNode({
  node,
  lod,
  onNodeChange
}: {
  node: CanvasNode
  lod: 'placeholder' | 'minimal' | 'compact' | 'full'
  onNodeChange: (id: string, changes: Partial<CanvasNode>) => void
}) {
  // Placeholder: just a colored rectangle (for extreme zoom-out)
  if (lod === 'placeholder') {
    return (
      <div
        style={{
          position: 'absolute',
          left: node.position.x,
          top: node.position.y,
          width: node.position.width,
          height: node.position.height,
          backgroundColor: getNodeColor(node),
          borderRadius: 4
        }}
      />
    )
  }

  // Full rendering: complete interactive node
  return (
    <CanvasNodeComponent
      node={node}
      minimal={lod === 'minimal'}
      compact={lod === 'compact'}
      onNodeChange={onNodeChange}
    />
  )
})
```

### Layer 4: Presence Overlay

Live cursors and selection need their own layer for:

- High update frequency (30-60fps cursor movement)
- Independence from main canvas transforms
- Always-on-top rendering

```typescript
// presence-overlay.tsx
interface PresenceOverlayProps {
  viewport: Viewport
  localCursor: Point | null
  remoteCursors: RemoteCursor[]
  selections: RemoteSelection[]
  dragPreview: DragPreview | null
}

interface RemoteCursor {
  peerId: string
  user: { name: string; color: string; avatar?: string }
  position: Point // Canvas coordinates
  lastSeen: number
}

export function PresenceOverlay({
  viewport,
  remoteCursors,
  selections,
  dragPreview
}: PresenceOverlayProps) {
  return (
    <div className="presence-overlay" style={{ pointerEvents: 'none' }}>
      {/* Remote cursors */}
      {remoteCursors.map(cursor => {
        // Convert canvas coords to screen coords
        const screen = viewport.canvasToScreen(cursor.position.x, cursor.position.y)
        const isStale = Date.now() - cursor.lastSeen > 5000

        return (
          <div
            key={cursor.peerId}
            className="remote-cursor"
            style={{
              left: screen.x,
              top: screen.y,
              opacity: isStale ? 0.3 : 1,
              transition: 'left 50ms, top 50ms, opacity 300ms'
            }}
          >
            {/* Cursor icon */}
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path
                d="M5.65 2.65L18.35 12.35L12.35 13.35L10.35 19.35L5.65 2.65Z"
                fill={cursor.user.color}
                stroke="white"
                strokeWidth="1.5"
              />
            </svg>
            {/* Name tag */}
            <span
              className="cursor-name"
              style={{ backgroundColor: cursor.user.color }}
            >
              {cursor.user.name}
            </span>
          </div>
        )
      })}

      {/* Remote selections */}
      {selections.map(selection => (
        <SelectionIndicator
          key={selection.peerId}
          selection={selection}
          viewport={viewport}
        />
      ))}

      {/* Drag preview */}
      {dragPreview && (
        <DragPreviewOverlay preview={dragPreview} viewport={viewport} />
      )}
    </div>
  )
}
```

## Part 3: Infinite Canvas with Lazy-Loading

### The Challenge

A truly infinite canvas cannot load all nodes at once. We need:

1. **Spatial chunking**: Divide canvas into tiles, load tiles on demand
2. **Progressive loading**: Nearest tiles first, background tiles later
3. **Eviction**: Unload distant tiles to free memory
4. **Seamless experience**: No visible loading when panning smoothly

### Chunked Storage Architecture

```typescript
// chunk-manager.ts

const CHUNK_SIZE = 2048 // Canvas units per chunk
const LOAD_RADIUS = 2 // Load chunks within 2 tiles of viewport
const EVICT_RADIUS = 4 // Evict chunks beyond 4 tiles

interface Chunk {
  key: string // "x,y" e.g., "0,0", "-1,2"
  x: number
  y: number
  nodes: CanvasNode[]
  edges: CanvasEdge[] // Edges where both endpoints are in this chunk
  loaded: boolean
  loading: boolean
  lastAccessed: number
}

class ChunkManager {
  private chunks = new Map<string, Chunk>()
  private crossChunkEdges: CanvasEdge[] = [] // Edges spanning multiple chunks
  private loadQueue: string[] = []
  private isLoading = false

  constructor(
    private store: ChunkStore,
    private onChunkLoaded: (chunk: Chunk) => void
  ) {}

  updateViewport(viewport: Viewport) {
    const visibleChunks = this.getChunksInViewport(viewport, LOAD_RADIUS)
    const evictableChunks = this.getChunksOutsideRadius(viewport, EVICT_RADIUS)

    // Queue loading for missing chunks (prioritize center)
    const center = { x: viewport.x, y: viewport.y }
    const sortedByDistance = visibleChunks
      .filter((key) => !this.chunks.has(key) || !this.chunks.get(key)!.loaded)
      .sort((a, b) => {
        const distA = this.chunkDistanceFromPoint(a, center)
        const distB = this.chunkDistanceFromPoint(b, center)
        return distA - distB
      })

    this.loadQueue = [
      ...sortedByDistance,
      ...this.loadQueue.filter(
        (key) => !sortedByDistance.includes(key) && visibleChunks.includes(key)
      )
    ]

    // Evict distant chunks
    for (const key of evictableChunks) {
      if (this.chunks.has(key)) {
        this.chunks.delete(key)
      }
    }

    this.processLoadQueue()
  }

  private async processLoadQueue() {
    if (this.isLoading || this.loadQueue.length === 0) return

    this.isLoading = true
    const key = this.loadQueue.shift()!

    try {
      const chunk = await this.store.loadChunk(key)
      this.chunks.set(key, chunk)
      this.onChunkLoaded(chunk)
    } catch (err) {
      console.error(`Failed to load chunk ${key}:`, err)
    } finally {
      this.isLoading = false
      // Continue processing queue
      if (this.loadQueue.length > 0) {
        requestIdleCallback(() => this.processLoadQueue())
      }
    }
  }

  private getChunksInViewport(viewport: Viewport, radius: number): string[] {
    const rect = viewport.getVisibleRect()
    const minChunkX = Math.floor((rect.x - radius * CHUNK_SIZE) / CHUNK_SIZE)
    const maxChunkX = Math.ceil((rect.x + rect.width + radius * CHUNK_SIZE) / CHUNK_SIZE)
    const minChunkY = Math.floor((rect.y - radius * CHUNK_SIZE) / CHUNK_SIZE)
    const maxChunkY = Math.ceil((rect.y + rect.height + radius * CHUNK_SIZE) / CHUNK_SIZE)

    const chunks: string[] = []
    for (let x = minChunkX; x <= maxChunkX; x++) {
      for (let y = minChunkY; y <= maxChunkY; y++) {
        chunks.push(`${x},${y}`)
      }
    }
    return chunks
  }
}
```

### Yjs Storage for Chunks

Each chunk is stored as a separate Y.Map within the canvas Y.Doc:

```typescript
// chunked-canvas-store.ts

interface ChunkedCanvasDoc {
  metadata: Y.Map<unknown> // title, created, updated
  chunks: Y.Map<Y.Map<unknown>> // chunkKey -> { nodes: Y.Map, edges: Y.Map }
  crossEdges: Y.Map<unknown> // Edges spanning chunks
  index: Y.Map<unknown> // Node ID -> chunk key (for fast lookup)
}

class ChunkedCanvasStore {
  private ydoc: Y.Doc
  private metadata: Y.Map<unknown>
  private chunks: Y.Map<Y.Map<unknown>>
  private crossEdges: Y.Map<unknown>
  private index: Y.Map<unknown>

  constructor(id: string) {
    this.ydoc = new Y.Doc({ guid: id, gc: false })
    this.metadata = this.ydoc.getMap('metadata')
    this.chunks = this.ydoc.getMap('chunks')
    this.crossEdges = this.ydoc.getMap('crossEdges')
    this.index = this.ydoc.getMap('index')
  }

  addNode(node: CanvasNode): void {
    const chunkKey = this.getChunkKey(node.position)

    this.ydoc.transact(() => {
      // Ensure chunk exists
      if (!this.chunks.has(chunkKey)) {
        const chunk = new Y.Map()
        chunk.set('nodes', new Y.Map())
        chunk.set('edges', new Y.Map())
        this.chunks.set(chunkKey, chunk)
      }

      // Add node to chunk
      const chunk = this.chunks.get(chunkKey)!
      const nodes = chunk.get('nodes') as Y.Map<unknown>
      nodes.set(node.id, node)

      // Update index
      this.index.set(node.id, chunkKey)
    })
  }

  moveNode(nodeId: string, newPosition: CanvasNodePosition): void {
    const oldChunkKey = this.index.get(nodeId) as string
    const newChunkKey = this.getChunkKey(newPosition)

    if (oldChunkKey === newChunkKey) {
      // Same chunk, just update position
      const chunk = this.chunks.get(oldChunkKey)!
      const nodes = chunk.get('nodes') as Y.Map<unknown>
      const node = nodes.get(nodeId) as CanvasNode
      nodes.set(nodeId, { ...node, position: newPosition })
    } else {
      // Moving to different chunk
      this.ydoc.transact(() => {
        // Remove from old chunk
        const oldChunk = this.chunks.get(oldChunkKey)!
        const oldNodes = oldChunk.get('nodes') as Y.Map<unknown>
        const node = oldNodes.get(nodeId) as CanvasNode
        oldNodes.delete(nodeId)

        // Add to new chunk (creating if needed)
        if (!this.chunks.has(newChunkKey)) {
          const chunk = new Y.Map()
          chunk.set('nodes', new Y.Map())
          chunk.set('edges', new Y.Map())
          this.chunks.set(newChunkKey, chunk)
        }
        const newChunk = this.chunks.get(newChunkKey)!
        const newNodes = newChunk.get('nodes') as Y.Map<unknown>
        newNodes.set(nodeId, { ...node, position: newPosition })

        // Update index
        this.index.set(nodeId, newChunkKey)

        // Update edges that reference this node
        this.updateEdgesForMovedNode(nodeId, oldChunkKey, newChunkKey)
      })
    }
  }

  private getChunkKey(position: CanvasNodePosition): string {
    const chunkX = Math.floor(position.x / CHUNK_SIZE)
    const chunkY = Math.floor(position.y / CHUNK_SIZE)
    return `${chunkX},${chunkY}`
  }
}
```

## Part 4: Dense Graph Support

### The Problem

Flowcharts, mind maps, and architecture diagrams often have thousands of edges. Current SVG rendering falls apart at ~200 edges. We need:

1. **Edge bundling**: Group parallel edges to reduce visual clutter
2. **Smart routing**: Avoid crossing nodes where possible
3. **Orthogonal connectors**: Right-angle paths for professional diagrams
4. **Semantic zoom**: More detail at higher zoom levels

### Edge Bundling Algorithm

```typescript
// edge-bundling.ts

interface BundledEdge {
  id: string
  originalEdges: CanvasEdge[]
  path: Point[]
  width: number // Proportional to edge count
}

function bundleEdges(
  edges: CanvasEdge[],
  nodePositions: Map<string, Rect>,
  bundleThreshold: number = 50 // Pixels
): BundledEdge[] {
  // Group edges by proximity of their midpoints
  const edgeMidpoints = edges.map((edge) => {
    const source = nodePositions.get(edge.sourceId)!
    const target = nodePositions.get(edge.targetId)!
    return {
      edge,
      midpoint: {
        x: (source.x + source.width / 2 + target.x + target.width / 2) / 2,
        y: (source.y + source.height / 2 + target.y + target.height / 2) / 2
      }
    }
  })

  // Cluster edges with nearby midpoints
  const clusters = clusterByDistance(edgeMidpoints, bundleThreshold)

  return clusters.map((cluster) => {
    if (cluster.length === 1) {
      // Single edge, no bundling needed
      return {
        id: cluster[0].edge.id,
        originalEdges: [cluster[0].edge],
        path: computeEdgePath(cluster[0].edge, nodePositions),
        width: 2
      }
    }

    // Multiple edges: compute bundled path
    const bundledPath = computeBundledPath(cluster, nodePositions)
    return {
      id: `bundle-${cluster.map((c) => c.edge.id).join('-')}`,
      originalEdges: cluster.map((c) => c.edge),
      path: bundledPath,
      width: Math.min(2 + cluster.length * 0.5, 8)
    }
  })
}
```

### Orthogonal Edge Routing

Professional diagrams use right-angle connectors. This requires path-finding:

```typescript
// orthogonal-router.ts

interface RouterConfig {
  gridSize: number // Routing grid size (e.g., 10px)
  nodeMargin: number // Minimum distance from nodes (e.g., 20px)
  bendPenalty: number // Cost for each bend (higher = fewer bends)
}

class OrthogonalRouter {
  constructor(private config: RouterConfig) {}

  route(
    source: Rect,
    sourceAnchor: EdgeAnchor,
    target: Rect,
    targetAnchor: EdgeAnchor,
    obstacles: Rect[]
  ): Point[] {
    const start = this.getAnchorPoint(source, sourceAnchor)
    const end = this.getAnchorPoint(target, targetAnchor)

    // Use A* with orthogonal movement only
    const path = this.astar(start, end, obstacles)

    // Simplify path (remove redundant points on same line)
    return this.simplifyPath(path)
  }

  private astar(start: Point, end: Point, obstacles: Rect[]): Point[] {
    const grid = this.config.gridSize
    const openSet = new MinHeap<PathNode>()
    const closedSet = new Set<string>()

    const startNode: PathNode = {
      x: Math.round(start.x / grid) * grid,
      y: Math.round(start.y / grid) * grid,
      g: 0,
      h: this.heuristic(start, end),
      parent: null,
      direction: null
    }

    openSet.push(startNode, startNode.g + startNode.h)

    while (!openSet.isEmpty()) {
      const current = openSet.pop()!
      const key = `${current.x},${current.y}`

      if (closedSet.has(key)) continue
      closedSet.add(key)

      // Check if we reached the end
      if (this.isNearEnd(current, end, grid)) {
        return this.reconstructPath(current, end)
      }

      // Explore orthogonal neighbors
      for (const [dx, dy, dir] of [
        [0, -1, 'up'],
        [1, 0, 'right'],
        [0, 1, 'down'],
        [-1, 0, 'left']
      ] as const) {
        const nx = current.x + dx * grid
        const ny = current.y + dy * grid

        // Skip if obstacle
        if (this.collidesWithObstacle(nx, ny, obstacles)) continue

        // Calculate cost (penalize bends)
        const bendCost =
          current.direction && current.direction !== dir ? this.config.bendPenalty : 0
        const g = current.g + grid + bendCost
        const h = this.heuristic({ x: nx, y: ny }, end)

        openSet.push(
          {
            x: nx,
            y: ny,
            g,
            h,
            parent: current,
            direction: dir
          },
          g + h
        )
      }
    }

    // No path found, fall back to straight line
    return [start, end]
  }
}
```

## Part 5: Minimap and Navigation

### Minimap Component

```typescript
// minimap.tsx

interface MinimapProps {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: Viewport
  canvasBounds: Rect
  width?: number
  height?: number
  onViewportChange: (viewport: Partial<Viewport>) => void
}

export function Minimap({
  nodes,
  edges,
  viewport,
  canvasBounds,
  width = 200,
  height = 150,
  onViewportChange
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Calculate scale to fit canvas bounds in minimap
  const scale = useMemo(() => {
    if (!canvasBounds.width || !canvasBounds.height) return 1
    return Math.min(
      width / canvasBounds.width,
      height / canvasBounds.height
    ) * 0.9 // 10% padding
  }, [canvasBounds, width, height])

  // Render minimap
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio || 1

    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    // Clear
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
    ctx.fillRect(0, 0, width, height)

    // Center offset
    const offsetX = width / 2 - canvasBounds.x * scale - canvasBounds.width * scale / 2
    const offsetY = height / 2 - canvasBounds.y * scale - canvasBounds.height * scale / 2

    // Draw nodes as rectangles
    ctx.fillStyle = 'rgba(59, 130, 246, 0.6)'
    for (const node of nodes) {
      const x = node.position.x * scale + offsetX
      const y = node.position.y * scale + offsetY
      const w = Math.max(node.position.width * scale, 2)
      const h = Math.max(node.position.height * scale, 2)
      ctx.fillRect(x, y, w, h)
    }

    // Draw edges as lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const edge of edges) {
      const source = nodes.find(n => n.id === edge.sourceId)
      const target = nodes.find(n => n.id === edge.targetId)
      if (!source || !target) continue

      const sx = (source.position.x + source.position.width / 2) * scale + offsetX
      const sy = (source.position.y + source.position.height / 2) * scale + offsetY
      const tx = (target.position.x + target.position.width / 2) * scale + offsetX
      const ty = (target.position.y + target.position.height / 2) * scale + offsetY

      ctx.moveTo(sx, sy)
      ctx.lineTo(tx, ty)
    }
    ctx.stroke()

    // Draw viewport rectangle
    const visibleRect = viewport.getVisibleRect()
    const vx = visibleRect.x * scale + offsetX
    const vy = visibleRect.y * scale + offsetY
    const vw = visibleRect.width * scale
    const vh = visibleRect.height * scale

    ctx.strokeStyle = 'rgba(59, 130, 246, 1)'
    ctx.lineWidth = 2
    ctx.strokeRect(vx, vy, vw, vh)

    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'
    ctx.fillRect(vx, vy, vw, vh)
  }, [nodes, edges, viewport, canvasBounds, width, height, scale])

  // Handle click to pan
  const handleClick = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top

    const offsetX = width / 2 - canvasBounds.x * scale - canvasBounds.width * scale / 2
    const offsetY = height / 2 - canvasBounds.y * scale - canvasBounds.height * scale / 2

    const canvasX = (clickX - offsetX) / scale
    const canvasY = (clickY - offsetY) / scale

    onViewportChange({ x: canvasX, y: canvasY })
  }

  return (
    <div className="minimap-container">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onClick={handleClick}
        onMouseDown={handleDragStart}
        style={{ cursor: 'pointer' }}
      />
    </div>
  )
}
```

### Navigation Tools

```typescript
// navigation-tools.tsx

interface NavigationToolsProps {
  viewport: Viewport
  canvasBounds: Rect
  onViewportChange: (changes: Partial<Viewport>) => void
}

export function NavigationTools({
  viewport,
  canvasBounds,
  onViewportChange
}: NavigationToolsProps) {
  const zoomIn = () => {
    const newZoom = Math.min(viewport.zoom * 1.5, 4)
    onViewportChange({ zoom: newZoom })
  }

  const zoomOut = () => {
    const newZoom = Math.max(viewport.zoom / 1.5, 0.1)
    onViewportChange({ zoom: newZoom })
  }

  const fitToContent = () => {
    if (!canvasBounds.width || !canvasBounds.height) return

    const padding = 50
    const scaleX = (viewport.width - padding * 2) / canvasBounds.width
    const scaleY = (viewport.height - padding * 2) / canvasBounds.height
    const newZoom = Math.min(scaleX, scaleY, 1) // Don't zoom in past 100%

    onViewportChange({
      x: canvasBounds.x + canvasBounds.width / 2,
      y: canvasBounds.y + canvasBounds.height / 2,
      zoom: newZoom
    })
  }

  const resetView = () => {
    onViewportChange({ x: 0, y: 0, zoom: 1 })
  }

  return (
    <div className="navigation-tools">
      <button onClick={zoomIn} title="Zoom In (Ctrl+Plus)">
        <ZoomInIcon />
      </button>
      <span className="zoom-level">{Math.round(viewport.zoom * 100)}%</span>
      <button onClick={zoomOut} title="Zoom Out (Ctrl+Minus)">
        <ZoomOutIcon />
      </button>
      <div className="divider" />
      <button onClick={fitToContent} title="Fit to Content (Ctrl+1)">
        <FitIcon />
      </button>
      <button onClick={resetView} title="Reset View (Ctrl+0)">
        <ResetIcon />
      </button>
    </div>
  )
}
```

## Part 6: Rich Node Types

### Embedded Content Nodes

The canvas should support rich embedded content, not just cards:

```typescript
// node-types.ts

type CanvasNodeType =
  | 'card' // Simple text card
  | 'frame' // Grouping container
  | 'shape' // Geometric shape (rect, circle, diamond, etc.)
  | 'image' // Image with optional annotations
  | 'embed' // Embedded xNet node (page, database, etc.)
  | 'group' // Logical grouping (invisible)
  | 'sticky' // Sticky note (colored, handwriting-style)
  | 'code' // Code block with syntax highlighting
  | 'mermaid' // Mermaid diagram
  | 'table' // Embedded table/database view
  | 'text' // Freestanding rich text
  | 'connector' // Smart connector (for edge labels)
  | 'swimlane' // Horizontal/vertical lane container

interface MermaidNode extends BaseCanvasNode {
  type: 'mermaid'
  properties: {
    code: string // Mermaid DSL
    theme?: 'default' | 'dark' | 'forest' | 'neutral'
    renderedSvg?: string // Cached SVG output
    lastRenderHash?: string
  }
}

interface EmbedNode extends BaseCanvasNode {
  type: 'embed'
  linkedNodeId: string // xNet node ID
  properties: {
    viewType: 'card' | 'full' | 'database' | 'kanban' | 'calendar'
    collapsed?: boolean
  }
}

interface SwimLaneNode extends BaseCanvasNode {
  type: 'swimlane'
  properties: {
    orientation: 'horizontal' | 'vertical'
    title: string
    color: string
    childNodeIds: string[] // Nodes contained in this lane
  }
}
```

### Mermaid Diagram Integration

```typescript
// mermaid-node.tsx

import mermaid from 'mermaid'
import { useEffect, useState, useRef } from 'react'

interface MermaidNodeProps {
  node: MermaidNode
  onUpdate: (changes: Partial<MermaidNode['properties']>) => void
  isEditing: boolean
}

export function MermaidNodeComponent({
  node,
  onUpdate,
  isEditing
}: MermaidNodeProps) {
  const [svg, setSvg] = useState<string>(node.properties.renderedSvg ?? '')
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Render mermaid diagram
  useEffect(() => {
    if (isEditing) return // Don't re-render while editing

    const renderDiagram = async () => {
      const hash = hashCode(node.properties.code)
      if (hash === node.properties.lastRenderHash && node.properties.renderedSvg) {
        setSvg(node.properties.renderedSvg)
        return
      }

      try {
        const id = `mermaid-${node.id}`
        const { svg } = await mermaid.render(id, node.properties.code)
        setSvg(svg)
        setError(null)

        // Cache the result
        onUpdate({
          renderedSvg: svg,
          lastRenderHash: hash
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to render diagram')
      }
    }

    renderDiagram()
  }, [node.properties.code, isEditing])

  if (isEditing) {
    return (
      <div className="mermaid-editor">
        <textarea
          value={node.properties.code}
          onChange={(e) => onUpdate({ code: e.target.value })}
          placeholder="Enter Mermaid diagram code..."
          spellCheck={false}
        />
        <div className="mermaid-help">
          <a href="https://mermaid.js.org/syntax/flowchart.html" target="_blank">
            Mermaid syntax reference
          </a>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mermaid-error">
        <span>Diagram Error</span>
        <code>{error}</code>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
```

### Checklist Node

```typescript
// checklist-node.tsx

interface ChecklistItem {
  id: string
  text: string
  checked: boolean
  indent: number
}

interface ChecklistNodeProps {
  items: ChecklistItem[]
  onItemChange: (id: string, changes: Partial<ChecklistItem>) => void
  onItemAdd: (afterId: string | null) => void
  onItemDelete: (id: string) => void
}

export function ChecklistNode({
  items,
  onItemChange,
  onItemAdd,
  onItemDelete
}: ChecklistNodeProps) {
  return (
    <div className="checklist-node">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="checklist-item"
          style={{ paddingLeft: item.indent * 20 }}
        >
          <input
            type="checkbox"
            checked={item.checked}
            onChange={(e) => onItemChange(item.id, { checked: e.target.checked })}
          />
          <input
            type="text"
            value={item.text}
            onChange={(e) => onItemChange(item.id, { text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onItemAdd(item.id)
              } else if (e.key === 'Backspace' && item.text === '') {
                e.preventDefault()
                onItemDelete(item.id)
              } else if (e.key === 'Tab') {
                e.preventDefault()
                const newIndent = e.shiftKey
                  ? Math.max(0, item.indent - 1)
                  : Math.min(4, item.indent + 1)
                onItemChange(item.id, { indent: newIndent })
              }
            }}
          />
        </div>
      ))}
      <button
        className="add-item"
        onClick={() => onItemAdd(items[items.length - 1]?.id ?? null)}
      >
        + Add item
      </button>
    </div>
  )
}
```

## Part 7: Live Presence and Collaboration

### Cursor Broadcasting

Using the existing Yjs Awareness system:

```typescript
// canvas-presence.ts

interface CanvasPresence {
  cursor?: Point // Canvas coordinates
  selection?: string[] // Selected node IDs
  viewport?: {
    x: number
    y: number
    zoom: number
  }
  activity?: 'idle' | 'dragging' | 'drawing' | 'editing'
}

class CanvasPresenceManager {
  private awareness: Awareness
  private throttledBroadcast: () => void
  private pendingState: Partial<CanvasPresence> = {}

  constructor(awareness: Awareness) {
    this.awareness = awareness

    // Throttle cursor broadcasts to 30fps
    this.throttledBroadcast = throttle(() => {
      const current = (this.awareness.getLocalState() as CanvasPresence) ?? {}
      this.awareness.setLocalState({
        ...current,
        ...this.pendingState
      })
      this.pendingState = {}
    }, 33) // ~30fps
  }

  updateCursor(position: Point | null) {
    this.pendingState.cursor = position ?? undefined
    this.throttledBroadcast()
  }

  updateSelection(nodeIds: string[]) {
    // Selection updates are immediate (not throttled)
    const current = (this.awareness.getLocalState() as CanvasPresence) ?? {}
    this.awareness.setLocalState({
      ...current,
      selection: nodeIds
    })
  }

  updateActivity(activity: CanvasPresence['activity']) {
    this.pendingState.activity = activity
    this.throttledBroadcast()
  }

  getRemotePresence(): Map<number, CanvasPresence> {
    const states = new Map<number, CanvasPresence>()
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== this.awareness.clientID) {
        states.set(clientId, state as CanvasPresence)
      }
    })
    return states
  }

  onPresenceChange(callback: (states: Map<number, CanvasPresence>) => void): () => void {
    const handler = () => callback(this.getRemotePresence())
    this.awareness.on('change', handler)
    return () => this.awareness.off('change', handler)
  }
}
```

### Selection Locking

When a user is editing a node, prevent others from editing the same node:

```typescript
// selection-lock.ts

interface SelectionLock {
  nodeId: string
  ownerId: number // Awareness clientID
  ownerName: string
  ownerColor: string
  acquiredAt: number
}

class SelectionLockManager {
  private locks = new Map<string, SelectionLock>()

  constructor(
    private awareness: Awareness,
    private onLocksChange: (locks: Map<string, SelectionLock>) => void
  ) {
    // Listen for remote lock changes
    awareness.on('change', () => {
      this.updateLocksFromAwareness()
    })
  }

  tryAcquireLock(nodeId: string): boolean {
    const existingLock = this.locks.get(nodeId)
    if (existingLock && existingLock.ownerId !== this.awareness.clientID) {
      // Already locked by someone else
      return false
    }

    // Acquire lock
    const current = (this.awareness.getLocalState() as CanvasPresence) ?? {}
    this.awareness.setLocalState({
      ...current,
      editingNodeId: nodeId
    })

    return true
  }

  releaseLock(nodeId: string): void {
    const current = (this.awareness.getLocalState() as CanvasPresence) ?? {}
    if (current.editingNodeId === nodeId) {
      const { editingNodeId, ...rest } = current
      this.awareness.setLocalState(rest)
    }
  }

  isLocked(nodeId: string): SelectionLock | null {
    return this.locks.get(nodeId) ?? null
  }

  private updateLocksFromAwareness(): void {
    const newLocks = new Map<string, SelectionLock>()

    this.awareness.getStates().forEach((state, clientId) => {
      const presence = state as CanvasPresence & { editingNodeId?: string }
      if (presence.editingNodeId) {
        newLocks.set(presence.editingNodeId, {
          nodeId: presence.editingNodeId,
          ownerId: clientId,
          ownerName: presence.user?.name ?? 'Unknown',
          ownerColor: presence.user?.color ?? '#888',
          acquiredAt: Date.now()
        })
      }
    })

    this.locks = newLocks
    this.onLocksChange(newLocks)
  }
}
```

## Part 8: Drawing Tools

### Freehand Drawing

```typescript
// drawing-tool.ts

interface DrawingPath {
  points: Point[]
  smoothed?: Point[]
  strokeWidth: number
  strokeColor: string
  timestamp: number
}

class DrawingTool {
  private isDrawing = false
  private currentPath: DrawingPath | null = null
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  onPointerDown(e: PointerEvent, canvasPoint: Point) {
    this.isDrawing = true
    this.currentPath = {
      points: [canvasPoint],
      strokeWidth: 2,
      strokeColor: '#000000',
      timestamp: Date.now()
    }

    // Start capturing pointer
    this.canvas.setPointerCapture(e.pointerId)
  }

  onPointerMove(e: PointerEvent, canvasPoint: Point) {
    if (!this.isDrawing || !this.currentPath) return

    // Add point with pressure (if available)
    const pressure = e.pressure || 0.5
    this.currentPath.points.push({
      x: canvasPoint.x,
      y: canvasPoint.y,
      pressure
    } as Point & { pressure: number })

    // Draw incrementally (only the new segment)
    this.drawSegment(
      this.currentPath.points[this.currentPath.points.length - 2],
      this.currentPath.points[this.currentPath.points.length - 1]
    )
  }

  onPointerUp(e: PointerEvent): DrawingPath | null {
    if (!this.isDrawing || !this.currentPath) return null

    this.isDrawing = false
    this.canvas.releasePointerCapture(e.pointerId)

    // Smooth the path
    this.currentPath.smoothed = this.smoothPath(this.currentPath.points)

    const result = this.currentPath
    this.currentPath = null

    return result
  }

  private smoothPath(points: Point[]): Point[] {
    if (points.length < 3) return points

    // Catmull-Rom spline smoothing
    const smoothed: Point[] = []

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)]
      const p1 = points[i]
      const p2 = points[Math.min(points.length - 1, i + 1)]
      const p3 = points[Math.min(points.length - 1, i + 2)]

      // Add interpolated points
      for (let t = 0; t < 1; t += 0.25) {
        smoothed.push(this.catmullRom(p0, p1, p2, p3, t))
      }
    }

    smoothed.push(points[points.length - 1])
    return smoothed
  }

  private catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
    const t2 = t * t
    const t3 = t2 * t

    return {
      x:
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y:
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    }
  }
}
```

### Shape Tools

```typescript
// shape-tool.ts

type ShapeType =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'diamond'
  | 'triangle'
  | 'hexagon'
  | 'star'
  | 'arrow'
  | 'line'
  | 'cylinder'
  | 'cloud'

interface ShapeConfig {
  type: ShapeType
  fill: string
  stroke: string
  strokeWidth: number
  cornerRadius?: number
  points?: number // For star/polygon
}

function createShapePath(type: ShapeType, bounds: Rect, config: ShapeConfig): Path2D {
  const path = new Path2D()
  const { x, y, width, height } = bounds
  const cx = x + width / 2
  const cy = y + height / 2

  switch (type) {
    case 'rectangle':
      path.rect(x, y, width, height)
      break

    case 'rounded-rectangle':
      const r = Math.min(config.cornerRadius ?? 8, width / 2, height / 2)
      path.moveTo(x + r, y)
      path.lineTo(x + width - r, y)
      path.quadraticCurveTo(x + width, y, x + width, y + r)
      path.lineTo(x + width, y + height - r)
      path.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
      path.lineTo(x + r, y + height)
      path.quadraticCurveTo(x, y + height, x, y + height - r)
      path.lineTo(x, y + r)
      path.quadraticCurveTo(x, y, x + r, y)
      break

    case 'ellipse':
      path.ellipse(cx, cy, width / 2, height / 2, 0, 0, Math.PI * 2)
      break

    case 'diamond':
      path.moveTo(cx, y)
      path.lineTo(x + width, cy)
      path.lineTo(cx, y + height)
      path.lineTo(x, cy)
      path.closePath()
      break

    case 'triangle':
      path.moveTo(cx, y)
      path.lineTo(x + width, y + height)
      path.lineTo(x, y + height)
      path.closePath()
      break

    case 'hexagon':
      const hexRadius = Math.min(width, height) / 2
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2
        const px = cx + hexRadius * Math.cos(angle)
        const py = cy + hexRadius * Math.sin(angle)
        if (i === 0) path.moveTo(px, py)
        else path.lineTo(px, py)
      }
      path.closePath()
      break

    case 'star':
      const outerRadius = Math.min(width, height) / 2
      const innerRadius = outerRadius * 0.4
      const numPoints = config.points ?? 5
      for (let i = 0; i < numPoints * 2; i++) {
        const angle = (Math.PI / numPoints) * i - Math.PI / 2
        const radius = i % 2 === 0 ? outerRadius : innerRadius
        const px = cx + radius * Math.cos(angle)
        const py = cy + radius * Math.sin(angle)
        if (i === 0) path.moveTo(px, py)
        else path.lineTo(px, py)
      }
      path.closePath()
      break

    // ... other shapes
  }

  return path
}
```

## Part 9: Worker-Based Layout

### Moving ELK.js Off-Thread

Layout computation is CPU-intensive and should never block the main thread:

```typescript
// layout-worker.ts (Web Worker)

import ELK from 'elkjs/lib/elk.bundled.js'

const elk = new ELK()

interface LayoutRequest {
  id: string
  nodes: Array<{ id: string; width: number; height: number }>
  edges: Array<{ id: string; sourceId: string; targetId: string }>
  algorithm: 'layered' | 'force' | 'radial' | 'tree'
  options?: Record<string, string>
}

self.onmessage = async (e: MessageEvent<LayoutRequest>) => {
  const { id, nodes, edges, algorithm, options } = e.data

  try {
    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': algorithm,
        'elk.spacing.nodeNode': '50',
        'elk.layered.spacing.nodeNodeBetweenLayers': '100',
        ...options
      },
      children: nodes.map((n) => ({
        id: n.id,
        width: n.width,
        height: n.height
      })),
      edges: edges.map((e) => ({
        id: e.id,
        sources: [e.sourceId],
        targets: [e.targetId]
      }))
    }

    const result = await elk.layout(graph)

    const positions = new Map<string, { x: number; y: number }>()
    for (const child of result.children ?? []) {
      positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
    }

    self.postMessage({
      id,
      success: true,
      positions: Object.fromEntries(positions)
    })
  } catch (err) {
    self.postMessage({
      id,
      success: false,
      error: err instanceof Error ? err.message : 'Layout failed'
    })
  }
}
```

### Layout Manager

```typescript
// layout-manager.ts

class LayoutManager {
  private worker: Worker
  private pending = new Map<
    string,
    {
      resolve: (positions: Map<string, Point>) => void
      reject: (error: Error) => void
    }
  >()

  constructor() {
    this.worker = new Worker(new URL('./layout-worker.ts', import.meta.url))

    this.worker.onmessage = (e) => {
      const { id, success, positions, error } = e.data
      const pending = this.pending.get(id)
      if (!pending) return

      this.pending.delete(id)

      if (success) {
        pending.resolve(new Map(Object.entries(positions)))
      } else {
        pending.reject(new Error(error))
      }
    }
  }

  async layout(
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    algorithm: 'layered' | 'force' | 'radial' | 'tree' = 'layered',
    options?: Record<string, string>
  ): Promise<Map<string, Point>> {
    const id = crypto.randomUUID()

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })

      this.worker.postMessage({
        id,
        nodes: nodes.map((n) => ({
          id: n.id,
          width: n.position.width,
          height: n.position.height
        })),
        edges: edges.map((e) => ({
          id: e.id,
          sourceId: e.sourceId,
          targetId: e.targetId
        })),
        algorithm,
        options
      })
    })
  }

  terminate(): void {
    this.worker.terminate()
  }
}
```

## Part 10: Implementation Checklist

### Phase 1: Core Infrastructure (2-3 weeks)

- [ ] **WebGL Grid Layer**
  - [ ] Set up WebGL context alongside existing canvas
  - [ ] Implement procedural grid fragment shader
  - [ ] Add zoom-responsive grid spacing
  - [ ] Support dot grid as alternative style
  - [ ] Add axis lines at origin

- [ ] **Canvas 2D Edge Layer**
  - [ ] Replace SVG with Canvas 2D rendering
  - [ ] Implement Path2D caching
  - [ ] Add style-based batching
  - [ ] Implement viewport culling
  - [ ] Add level-of-detail (hide labels at low zoom)

- [ ] **Virtualized Node Layer**
  - [ ] Refactor to only render visible nodes
  - [ ] Implement LOD rendering (placeholder/minimal/compact/full)
  - [ ] Add buffer zone for smooth scrolling
  - [ ] Profile and optimize memoization

### Phase 2: Lazy-Loading & Scale (2-3 weeks)

- [ ] **Chunked Storage**
  - [ ] Design chunk-based Y.Doc structure
  - [ ] Implement ChunkManager
  - [ ] Add progressive loading queue
  - [ ] Implement eviction for distant chunks
  - [ ] Handle cross-chunk edges

- [ ] **Spatial Index Optimization**
  - [ ] Benchmark rbush at 100k nodes
  - [ ] Consider quadtree for very large canvases
  - [ ] Add bulk operations for chunk loading

### Phase 3: Navigation & Presence (1-2 weeks)

- [ ] **Minimap**
  - [ ] Canvas-based minimap rendering
  - [ ] Click-to-navigate
  - [ ] Drag-to-pan viewport
  - [ ] Visible nodes/edges indicator

- [ ] **Navigation Tools**
  - [ ] Zoom in/out buttons
  - [ ] Zoom slider
  - [ ] Fit to content
  - [ ] Reset view
  - [ ] Keyboard shortcuts

- [ ] **Live Cursors**
  - [ ] Broadcast cursor position via Awareness
  - [ ] Render remote cursors with names
  - [ ] Throttle to 30fps
  - [ ] Fade stale cursors

- [ ] **Selection Presence**
  - [ ] Show remote selections
  - [ ] Edit locking
  - [ ] Visual indicators for locked nodes

### Phase 4: Rich Content (2-3 weeks)

- [ ] **Mermaid Diagrams**
  - [ ] Mermaid node type
  - [ ] Live preview during editing
  - [ ] Cache rendered SVG
  - [ ] Handle resize

- [ ] **Checklists**
  - [ ] Checklist node type
  - [ ] Keyboard navigation (Tab for indent)
  - [ ] Enter to add, Backspace to delete
  - [ ] Drag to reorder

- [ ] **Embedded Nodes**
  - [ ] Page embed view
  - [ ] Database embed view
  - [ ] Kanban embed view
  - [ ] Collapse/expand

- [ ] **Shape Library**
  - [ ] Basic shapes (rect, ellipse, diamond, etc.)
  - [ ] Shape picker UI
  - [ ] Shape resizing with aspect lock
  - [ ] Fill and stroke options

### Phase 5: Drawing & Diagramming (2-3 weeks)

- [ ] **Freehand Drawing**
  - [ ] Pen tool with pressure support
  - [ ] Path smoothing
  - [ ] Stroke width options
  - [ ] Eraser tool

- [ ] **Edge Routing**
  - [ ] Orthogonal connector routing
  - [ ] A\* pathfinding around obstacles
  - [ ] Edge labels with smart positioning
  - [ ] Waypoints for manual routing

- [ ] **Edge Bundling**
  - [ ] Detect parallel edges
  - [ ] Bundle edges with shared paths
  - [ ] Unbundle on hover

- [ ] **Swimlanes**
  - [ ] Swimlane container node
  - [ ] Drag nodes into lanes
  - [ ] Auto-resize lanes

### Phase 6: Performance & Polish (1-2 weeks)

- [ ] **Worker-Based Layout**
  - [ ] Move ELK.js to Web Worker
  - [ ] Add layout progress indicator
  - [ ] Support cancellation

- [ ] **Performance Testing**
  - [ ] Benchmark at 10k nodes
  - [ ] Benchmark at 100k nodes
  - [ ] Profile memory usage
  - [ ] Test on low-end devices

- [ ] **Accessibility**
  - [ ] Keyboard navigation
  - [ ] Screen reader support
  - [ ] Focus management
  - [ ] High contrast mode

## Prior Art & References

### Figma

- WebGL-based rendering (custom engine)
- CRDT for real-time sync (custom, not Yjs)
- Frames as grouping containers
- Boolean operations for shapes
- Component instances with overrides

### Miro

- Canvas 2D + DOM hybrid
- WebSocket-based real-time
- Extensive widget library
- Video chat integration
- AI features (summarize, expand)

### Affine

- Yjs for real-time sync
- Block-based editor
- Canvas mode vs document mode
- Open source (we can learn from their code)

### TLDraw

- React-based canvas library
- Custom rendering engine
- Open source with MIT license
- Excellent shape tools
- Very clean API

### Excalidraw

- Simple drawing tool
- Hand-drawn aesthetic
- Very performant for its use case
- Open source

## Conclusion

This exploration outlines a comprehensive plan to transform xNet's canvas into a professional-grade diagramming and whiteboarding surface. The key architectural decisions are:

1. **Multi-layer rendering** separates concerns and optimizes each layer independently
2. **WebGL for background** enables infinite grid without allocations
3. **Canvas 2D for edges** scales to 10,000+ connections
4. **Virtualized DOM for nodes** keeps React's power where it's needed
5. **Chunked storage** enables truly infinite canvases
6. **Worker-based layout** never blocks the UI

The implementation can be done incrementally, with each phase delivering value independently. The total estimated timeline is 10-16 weeks, with the core infrastructure (Phases 1-2) taking 4-6 weeks and providing the foundation for all subsequent features.

## Appendix: Performance Targets

| Metric                   | Current | Target  | How to Measure             |
| ------------------------ | ------- | ------- | -------------------------- |
| Nodes before jank        | ~500    | 10,000+ | Frame time < 16ms at 60fps |
| Edges before jank        | ~200    | 5,000+  | Frame time < 16ms at 60fps |
| Pan/zoom latency         | ~5ms    | <2ms    | Performance.now() delta    |
| Initial load (1k nodes)  | ~500ms  | <100ms  | First paint timing         |
| Memory (1k nodes)        | ~50MB   | <30MB   | Chrome DevTools Memory     |
| Cursor broadcast latency | N/A     | <50ms   | Round-trip measurement     |
