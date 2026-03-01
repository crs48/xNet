# @xnet/canvas

Infinite canvas for spatial visualization of xNet documents -- R-tree spatial indexing, ELK.js auto-layout, and Yjs-backed state.

## Installation

```bash
pnpm add @xnet/canvas
```

## Features

- **Spatial indexing** -- R-tree (rbush) for efficient viewport queries
- **Auto-layout** -- ELK.js graph layout algorithms
- **Yjs-backed store** -- Canvas state synced via CRDT
- **Pan/zoom** -- Smooth viewport navigation
- **Canvas comments** -- Spatial comment pins with overlay
- **React hooks** -- `useCanvas`, `useCanvasComments`

## Usage

```tsx
import { Canvas, useCanvas, createCanvasDoc, createNode, createEdge } from '@xnet/canvas'

function MyCanvas() {
  const doc = createCanvasDoc('canvas-1', 'My canvas')
  const { addNode, updateNodePosition, addEdge, pan, zoomAt } = useCanvas({ doc })

  // Example operations
  const nodeA = createNode('card', { x: 100, y: 120 })
  const nodeB = createNode('card', { x: 320, y: 200 })
  addNode(nodeA)
  addNode(nodeB)
  updateNodePosition(nodeA.id, { x: 140, y: 150 })
  addEdge(createEdge(nodeA.id, nodeB.id))
  pan(24, 12)
  zoomAt(0, 0, 1.1)

  return <Canvas doc={doc} />
}
```

### Spatial Index

```typescript
import { SpatialIndex } from '@xnet/canvas'

const index = new SpatialIndex()
index.insert({ id: '1', x: 0, y: 0, width: 100, height: 50 })

// Query a viewport rectangle
const visible = index.search({ minX: -50, minY: -50, maxX: 200, maxY: 200 })
```

### Layout Engine

```typescript
import { LayoutEngine } from '@xnet/canvas'

const engine = new LayoutEngine()
const layout = await engine.layout(nodes, edges, {
  algorithm: 'layered',
  direction: 'DOWN'
})
```

### Canvas Store (Yjs)

```typescript
import { CanvasStore } from '@xnet/canvas'

// Yjs-backed canvas state
const store = new CanvasStore(ydoc)
store.addNode({ id: '1', type: 'document', x: 100, y: 200 })
store.addEdge({ source: '1', target: '2' })
```

### Canvas Comments

```tsx
import { CommentOverlay } from '@xnet/canvas'

function CanvasWithComments({ canvasNodeId, transform, objects }) {
  return <CommentOverlay canvasNodeId={canvasNodeId} transform={transform} objects={objects} />
}
```

## Architecture

```mermaid
flowchart TD
    subgraph React["React Layer"]
        CanvasComp["Canvas Component"]
        UseCanvas["useCanvas"]
        UseComments["useCanvasComments"]
        CommentUI["CommentPin +<br/>CommentOverlay"]
    end

    subgraph Core["Core"]
        Store["CanvasStore<br/><small>Yjs-backed state</small>"]
        Spatial["SpatialIndex<br/><small>R-tree (rbush)</small>"]
        Layout["LayoutEngine<br/><small>ELK.js</small>"]
    end

    CanvasComp --> UseCanvas --> Store
    Store --> Spatial
    Store --> Layout
    UseComments --> CommentUI
```

## Modules

| Module                       | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `spatial/index.ts`           | R-tree spatial indexing                            |
| `layout/index.ts`            | ELK.js auto-layout                                 |
| `store.ts`                   | Yjs-backed canvas store                            |
| `hooks/useCanvas.ts`         | Canvas React hook                                  |
| `hooks/useCanvasComments.ts` | Comments React hook                                |
| `comments/index.ts`          | CommentPin, CommentOverlay                         |
| `types.ts`                   | Point, Rect, CanvasNode, CanvasEdge, ViewportState |

## Dependencies

- `@xnet/core`, `@xnet/data`, `@xnet/react`, `@xnet/ui`, `@xnet/vectors`
- `rbush` -- R-tree spatial indexing
- `elkjs` -- Graph layout algorithms
- `yjs` -- CRDT state

## Testing

```bash
pnpm --filter @xnet/canvas test
```

4 test files covering spatial indexing, layout, store, and comments.
