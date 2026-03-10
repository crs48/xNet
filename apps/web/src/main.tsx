/**
 * xNet Web - Entry Point
 */
import {
  getCanvasObjectsMap,
  seedCanvasPerformanceScene,
  type CanvasHandle,
  type FrameStats
} from '@xnetjs/canvas'
import { CanvasSchema } from '@xnetjs/data'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { App } from './App'

type WebCanvasNodeRecord = {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  updatedAt: number
}

type CanvasPerformanceSceneInput = {
  canvasId?: string
  title?: string
  columns?: number
  rows?: number
  startX?: number
  startY?: number
  horizontalGap?: number
  verticalGap?: number
  clusterColumns?: number
  clusterRows?: number
  clusterGapX?: number
  clusterGapY?: number
}

type CanvasFrameBudgetInput = {
  canvasId?: string
  steps?: number
  deltaX?: number
  deltaY?: number
  mode?: 'pan' | 'zoom' | 'mixed'
  zoomDeltaY?: number
  zoomEvery?: number
}

type WebCanvasTestHarness = {
  registerCanvasDoc: (canvasId: string, doc: Y.Doc | null) => void
  registerCanvasAwareness: (canvasId: string, awareness: Awareness | null) => void
  registerCanvasHandle: (canvasId: string, handle: CanvasHandle | null) => void
  setCanvasViewport: (input: {
    canvasId?: string
    x: number
    y: number
    zoom?: number
  }) => Promise<void>
  moveCanvasNode: (input: { nodeId: string; dx: number; dy: number }) => Promise<void>
  getCanvasNodeRect: (input: { nodeId: string }) => Promise<{
    canvasId: string
    x: number
    y: number
    width: number
    height: number
  }>
  removeCanvasNode: (input: { nodeId: string }) => Promise<void>
  setCanvasRemotePresence: (input: {
    canvasId?: string
    key: string
    state: Record<string, unknown> | null
  }) => Promise<{ canvasId: string; clientId: number }>
  seedPerformanceScene: (input?: CanvasPerformanceSceneInput) => Promise<{
    canvasId: string
    title: string
    nodeCount: number
    edgeCount: number
    bounds: { x: number; y: number; width: number; height: number }
    kindCounts: Record<string, number>
  }>
  measureCanvasFrameBudget: (input?: CanvasFrameBudgetInput) => Promise<FrameStats>
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
  const liveAwareness = new Map<string, Awareness>()
  const liveHandles = new Map<string, CanvasHandle>()
  const remotePeers = new Map<string, Map<string, Awareness>>()

  const resolveCanvasId = (canvasId?: string): string => {
    if (canvasId) {
      return canvasId
    }

    const lastAwarenessCanvasId = [...liveAwareness.keys()].at(-1)
    if (lastAwarenessCanvasId) {
      return lastAwarenessCanvasId
    }

    const lastDocCanvasId = [...liveDocs.keys()].at(-1)
    if (lastDocCanvasId) {
      return lastDocCanvasId
    }

    throw new Error('No live canvas registered')
  }

  return {
    registerCanvasDoc(canvasId, doc) {
      if (doc) {
        liveDocs.set(canvasId, doc)
        return
      }

      liveDocs.delete(canvasId)
    },

    registerCanvasAwareness(canvasId, awareness) {
      if (awareness) {
        liveAwareness.set(canvasId, awareness)
        return
      }

      liveAwareness.delete(canvasId)
      remotePeers.delete(canvasId)
    },

    registerCanvasHandle(canvasId, handle) {
      if (handle) {
        liveHandles.set(canvasId, handle)
        return
      }

      liveHandles.delete(canvasId)
    },

    async setCanvasViewport(input) {
      const canvasId = resolveCanvasId(input.canvasId)
      const handle = liveHandles.get(canvasId)
      if (!handle) {
        throw new Error(`No canvas handle registered for canvas ${canvasId}`)
      }

      const snapshot = handle.getViewportSnapshot()
      handle.setViewportSnapshot({
        x: input.x,
        y: input.y,
        zoom: input.zoom ?? snapshot.zoom
      })
    },

    async moveCanvasNode(input) {
      const store = window.__xnetNodeStore
      if (!store) {
        throw new Error('NodeStore not available')
      }

      for (const [canvasId, doc] of liveDocs.entries()) {
        const nodesMap = getCanvasObjectsMap<{
          id: string
          position: {
            x: number
            y: number
            width: number
            height: number
          }
        }>(doc)
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

    async getCanvasNodeRect(input) {
      for (const [canvasId, doc] of liveDocs.entries()) {
        const nodesMap = getCanvasObjectsMap<{
          position: {
            x: number
            y: number
            width: number
            height: number
          }
        }>(doc)
        const node = nodesMap.get(input.nodeId)
        if (!node) {
          continue
        }

        return {
          canvasId,
          x: node.position.x,
          y: node.position.y,
          width: node.position.width,
          height: node.position.height
        }
      }

      throw new Error(`Node ${input.nodeId} not found`)
    },

    async removeCanvasNode(input) {
      const store = window.__xnetNodeStore
      if (!store) {
        throw new Error('NodeStore not available')
      }

      for (const [canvasId, doc] of liveDocs.entries()) {
        const nodesMap = getCanvasObjectsMap(doc)
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

    async setCanvasRemotePresence(input) {
      const canvasId = resolveCanvasId(input.canvasId)
      const targetAwareness = liveAwareness.get(canvasId)
      if (!targetAwareness) {
        throw new Error(`No awareness registered for canvas ${canvasId}`)
      }

      const peersForCanvas = remotePeers.get(canvasId) ?? new Map<string, Awareness>()
      remotePeers.set(canvasId, peersForCanvas)

      let peerAwareness = peersForCanvas.get(input.key)
      if (!peerAwareness) {
        peerAwareness = new Awareness(new Y.Doc())
        peersForCanvas.set(input.key, peerAwareness)
      }

      peerAwareness.setLocalState(input.state)
      const update = encodeAwarenessUpdate(peerAwareness, [peerAwareness.clientID])
      applyAwarenessUpdate(targetAwareness, update, 'remote')

      if (input.state === null) {
        peersForCanvas.delete(input.key)
        if (peersForCanvas.size === 0) {
          remotePeers.delete(canvasId)
        }
      }

      return {
        canvasId,
        clientId: peerAwareness.clientID
      }
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
        startX: input.startX,
        startY: input.startY,
        horizontalGap: input.horizontalGap,
        verticalGap: input.verticalGap,
        clusterColumns: input.clusterColumns,
        clusterRows: input.clusterRows,
        clusterGapX: input.clusterGapX,
        clusterGapY: input.clusterGapY
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
    },

    async measureCanvasFrameBudget(input = {}) {
      const canvasId = resolveCanvasId(input.canvasId)
      const handle = liveHandles.get(canvasId)
      if (!handle) {
        throw new Error(`No canvas handle registered for canvas ${canvasId}`)
      }

      const surface = document.querySelector<HTMLElement>('[data-canvas-surface="true"]')
      if (!surface) {
        throw new Error('Canvas surface not found')
      }

      const steps = Math.max(1, input.steps ?? 18)
      const deltaX = input.deltaX ?? 140
      const deltaY = input.deltaY ?? 90
      const mode = input.mode ?? 'pan'
      const zoomDeltaY = input.zoomDeltaY ?? -7
      const zoomEvery = Math.max(1, input.zoomEvery ?? 3)
      const nextFrame = async (): Promise<void> =>
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
      const rect = surface.getBoundingClientRect()
      const clientX = rect.left + rect.width / 2
      const clientY = rect.top + rect.height / 2

      handle.resetPerformanceStats()
      await nextFrame()

      for (let index = 0; index < steps; index += 1) {
        const shouldZoom = mode === 'zoom' || (mode === 'mixed' && index % zoomEvery === 0)

        surface.dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            cancelable: true,
            ctrlKey: shouldZoom,
            clientX,
            clientY,
            deltaX: shouldZoom ? 0 : index % 2 === 0 ? deltaX : Math.round(deltaX * 0.82),
            deltaY: shouldZoom ? zoomDeltaY : index % 3 === 0 ? deltaY : Math.round(deltaY * 0.74)
          })
        )

        await nextFrame()
      }

      await nextFrame()
      return handle.getPerformanceStats()
    }
  }
}

window.__xnetCanvasTestHarness = createCanvasTestHarness()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
