/**
 * xNet Web - Entry Point
 */
import { seedCanvasPerformanceScene } from '@xnetjs/canvas'
import { CanvasSchema } from '@xnetjs/data'
import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Y from 'yjs'
import { App } from './App'

type WebCanvasNodeRecord = {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  updatedAt: number
}

type WebCanvasTestHarness = {
  registerCanvasDoc: (canvasId: string, doc: Y.Doc | null) => void
  moveCanvasNode: (input: { nodeId: string; dx: number; dy: number }) => Promise<void>
  removeCanvasNode: (input: { nodeId: string }) => Promise<void>
  seedPerformanceScene: (input?: {
    canvasId?: string
    title?: string
    columns?: number
    rows?: number
    clusterColumns?: number
    clusterRows?: number
  }) => Promise<{
    canvasId: string
    title: string
    nodeCount: number
    edgeCount: number
    bounds: { x: number; y: number; width: number; height: number }
    kindCounts: Record<string, number>
  }>
}

type WindowNodeStore = {
  get(id: string): Promise<WebCanvasNodeRecord | null>
  list(options: {
    schemaId?: string
    limit?: number
    offset?: number
  }): Promise<WebCanvasNodeRecord[]>
  update(
    id: string,
    options: {
      properties: Record<string, unknown>
    }
  ): Promise<WebCanvasNodeRecord>
  getDocumentContent(nodeId: string): Promise<Uint8Array | null>
  setDocumentContent(nodeId: string, content: Uint8Array): Promise<void>
}

declare global {
  interface Window {
    __xnetCanvasTestHarness?: WebCanvasTestHarness | null
    __xnetNodeStore?: WindowNodeStore
  }
}

function createCanvasTestHarness(): WebCanvasTestHarness {
  const liveDocs = new Map<string, Y.Doc>()

  return {
    registerCanvasDoc(canvasId, doc) {
      if (doc) {
        liveDocs.set(canvasId, doc)
        return
      }

      liveDocs.delete(canvasId)
    },

    async moveCanvasNode(input) {
      const store = window.__xnetNodeStore
      if (!store) {
        throw new Error('NodeStore not available')
      }

      for (const [canvasId, doc] of liveDocs.entries()) {
        const nodesMap = doc.getMap<{
          id: string
          position: {
            x: number
            y: number
            width: number
            height: number
          }
        }>('nodes')
        const node = nodesMap.get(input.nodeId)
        if (!node) {
          continue
        }

        doc.transact(() => {
          nodesMap.set(input.nodeId, {
            ...node,
            position: {
              ...node.position,
              x: node.position.x + input.dx,
              y: node.position.y + input.dy
            }
          })
        })

        await store.setDocumentContent(canvasId, Y.encodeStateAsUpdate(doc))
        return
      }

      throw new Error(`Node ${input.nodeId} not found`)
    },

    async removeCanvasNode(input) {
      const store = window.__xnetNodeStore
      if (!store) {
        throw new Error('NodeStore not available')
      }

      for (const [canvasId, doc] of liveDocs.entries()) {
        const nodesMap = doc.getMap('nodes')
        if (!nodesMap.has(input.nodeId)) {
          continue
        }

        doc.transact(() => {
          nodesMap.delete(input.nodeId)
        })

        await store.setDocumentContent(canvasId, Y.encodeStateAsUpdate(doc))
        return
      }

      throw new Error(`Node ${input.nodeId} not found`)
    },

    async seedPerformanceScene(input = {}) {
      const store = window.__xnetNodeStore
      if (!store) {
        throw new Error('NodeStore not available')
      }

      const canvases = await store.list({
        schemaId: CanvasSchema._schemaId,
        limit: 50,
        offset: 0
      })
      const targetCanvas =
        (input.canvasId ? await store.get(input.canvasId) : null) ??
        [...canvases].sort((left, right) => right.updatedAt - left.updatedAt)[0]

      if (!targetCanvas) {
        throw new Error('No canvas available to seed')
      }

      const liveDoc = liveDocs.get(targetCanvas.id)
      const doc = liveDoc ?? new Y.Doc({ guid: targetCanvas.id, gc: false })
      if (!liveDoc) {
        const existingContent = await store.getDocumentContent(targetCanvas.id)
        if (existingContent && existingContent.length > 0) {
          Y.applyUpdate(doc, existingContent)
        }
      }

      const summary = seedCanvasPerformanceScene(doc, {
        columns: input.columns,
        rows: input.rows,
        clusterColumns: input.clusterColumns,
        clusterRows: input.clusterRows
      })
      const title = input.title ?? `Web Canvas Performance Scene (${summary.nodeCount} nodes)`

      if (!liveDoc) {
        await store.setDocumentContent(targetCanvas.id, Y.encodeStateAsUpdate(doc))
      }

      return {
        canvasId: targetCanvas.id,
        title,
        nodeCount: summary.nodeCount,
        edgeCount: summary.edgeCount,
        bounds: summary.bounds,
        kindCounts: Object.fromEntries(
          Object.entries(summary.kindCounts).map(([key, value]) => [key, value ?? 0])
        )
      }
    }
  }
}

window.__xnetCanvasTestHarness = createCanvasTestHarness()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
