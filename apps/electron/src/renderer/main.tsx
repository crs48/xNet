/**
 * Renderer entry point
 */
import {
  getCanvasObjectsMap,
  seedCanvasPerformanceScene,
  type CanvasHandle,
  type FrameStats
} from '@xnetjs/canvas'
import { BlobService, CanvasSchema } from '@xnetjs/data'
import { XNetDevToolsProvider, useDevTools } from '@xnetjs/devtools'
import { BlobProvider } from '@xnetjs/editor/react'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { XNetProvider } from '@xnetjs/react'
import { ChunkManager } from '@xnetjs/storage'
import { ConsentManager, TelemetryCollector, TelemetryProvider } from '@xnetjs/telemetry'
import { ThemeProvider } from '@xnetjs/ui'
import React, { useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { App } from './App'
import { createIPCBlobStore } from './lib/ipc-blob-store'
import { IPCNodeStorageAdapter } from './lib/ipc-node-storage'
import { createIPCSyncManager, type IPCSyncManager } from './lib/ipc-sync-manager'
import './styles.css'

type LocalAPIStoreNode = {
  id: string
  schemaId: string
  properties: Record<string, unknown>
  deleted: boolean
  createdAt: number
  updatedAt: number
}

type LocalAPIStore = {
  get(id: string): Promise<LocalAPIStoreNode | null>
  list(options: {
    schemaId?: string
    limit?: number
    offset?: number
  }): Promise<LocalAPIStoreNode[]>
  create(options: {
    schemaId: string
    properties: Record<string, unknown>
  }): Promise<LocalAPIStoreNode>
  update(
    id: string,
    options: {
      properties: Record<string, unknown>
    }
  ): Promise<LocalAPIStoreNode>
  delete(id: string): Promise<void>
  getDocumentContent(nodeId: string): Promise<Uint8Array | null>
  setDocumentContent(nodeId: string, content: Uint8Array): Promise<void>
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

type CanvasTestHarness = {
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
  moveCanvasNodeAsRemote: (input: {
    canvasId?: string
    key: string
    nodeId: string
    dx: number
    dy: number
    state?: Record<string, unknown> | null
  }) => Promise<{
    canvasId: string
    clientId: number | null
    x: number
    y: number
    width: number
    height: number
  }>
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
  duplicateCanvasNodeReference: (input: { nodeId: string; alias?: string }) => Promise<string>
}

// TODO: In production, load identity from secure storage via IPC
// For dev/testing, use a deterministic test identity derived from a fixed seed
// This ensures the DID and signing key are cryptographically matched

// Fixed 32-byte seed for deterministic test identity (DO NOT use in production!)
// Each profile gets a unique identity by hashing the profile name into the seed.
// This ensures multi-instance dev/test runs have distinct DIDs.
const makeTestKey = (profileName: string): Uint8Array => {
  const seed = new Uint8Array([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
    27, 28, 29, 30, 31, 32
  ])
  // Mix profile name into the seed so each profile has a different identity
  for (let i = 0; i < profileName.length; i++) {
    seed[i % 32] ^= profileName.charCodeAt(i)
  }
  return seed
}

// Defer AUTHOR_DID / SIGNING_KEY resolution until we know the profile (see init())
let AUTHOR_DID: `did:key:${string}`
let SIGNING_KEY: Uint8Array

// Telemetry: consent set to 'anonymous' for dev (enables all collection tiers, visible in devtools)
const consentManager = new ConsentManager({ autoLoad: true })
consentManager.setTier('anonymous') // Enable all collection tiers for devtools visibility
const telemetryCollector = new TelemetryCollector({ consent: consentManager })

// IPC-based sync manager routes sync through the main process BSM
const ipcSyncManager = createIPCSyncManager()

declare global {
  interface Window {
    __xnetIpcSyncManager?: IPCSyncManager
    __xnetCanvasTestHarness?: CanvasTestHarness | null
    __xnetRoot?: Root
    __xnetDevToolsToggleCleanup?: (() => void) | null
  }
}

window.__xnetIpcSyncManager = ipcSyncManager

function createCanvasTestHarness(syncManager: IPCSyncManager): CanvasTestHarness {
  const liveDocs = new Map<string, Y.Doc>()
  const liveAwareness = new Map<string, Awareness>()
  const liveHandles = new Map<string, CanvasHandle>()
  const remotePeers = new Map<string, Map<string, Awareness>>()
  const remotePeerDocs = new Map<string, Map<string, Y.Doc>>()

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
      remotePeerDocs.delete(canvasId)
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
        throw new Error(`Canvas handle ${canvasId} not found`)
      }

      const currentSnapshot = handle.getViewportSnapshot()
      handle.setViewportSnapshot({
        x: input.x,
        y: input.y,
        zoom: input.zoom ?? currentSnapshot.zoom
      })
    },

    async moveCanvasNode(input) {
      const store = (window as Window & { __xnetNodeStore?: LocalAPIStore }).__xnetNodeStore
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

    async moveCanvasNodeAsRemote(input) {
      const store = (window as Window & { __xnetNodeStore?: LocalAPIStore }).__xnetNodeStore
      if (!store) {
        throw new Error('NodeStore not available')
      }

      const canvasId = resolveCanvasId(input.canvasId)
      const liveDoc = liveDocs.get(canvasId)
      if (!liveDoc) {
        throw new Error(`No live canvas doc registered for ${canvasId}`)
      }

      const peersForCanvas = remotePeerDocs.get(canvasId) ?? new Map<string, Y.Doc>()
      remotePeerDocs.set(canvasId, peersForCanvas)

      let remoteDoc = peersForCanvas.get(input.key)
      if (!remoteDoc) {
        remoteDoc = new Y.Doc()
        peersForCanvas.set(input.key, remoteDoc)
      }

      const syncUpdate = Y.encodeStateAsUpdate(liveDoc, Y.encodeStateVector(remoteDoc))
      if (syncUpdate.byteLength > 0) {
        Y.applyUpdate(remoteDoc, syncUpdate, 'sync')
      }

      const nodesMap = getCanvasObjectsMap<{
        id: string
        position: {
          x: number
          y: number
          width: number
          height: number
        }
      }>(remoteDoc)
      const node = nodesMap.get(input.nodeId)
      if (!node) {
        throw new Error(`Node ${input.nodeId} not found in canvas ${canvasId}`)
      }

      const liveStateVector = Y.encodeStateVector(liveDoc)

      remoteDoc.transact(() => {
        nodesMap.set(input.nodeId, {
          ...node,
          position: {
            ...node.position,
            x: node.position.x + input.dx,
            y: node.position.y + input.dy
          }
        })
      }, `remote:${input.key}`)

      const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc, liveStateVector)
      if (remoteUpdate.byteLength > 0) {
        Y.applyUpdate(liveDoc, remoteUpdate, `remote:${input.key}`)
      }

      let clientId: number | null = null
      if (input.state !== undefined) {
        const result = await this.setCanvasRemotePresence({
          canvasId,
          key: input.key,
          state: input.state
        })
        clientId = result.clientId
      }

      await store.setDocumentContent(canvasId, Y.encodeStateAsUpdate(liveDoc))

      const updatedNode = getCanvasObjectsMap<{
        position: {
          x: number
          y: number
          width: number
          height: number
        }
      }>(liveDoc).get(input.nodeId)

      if (!updatedNode) {
        throw new Error(`Node ${input.nodeId} disappeared after remote move`)
      }

      return {
        canvasId,
        clientId,
        x: updatedNode.position.x,
        y: updatedNode.position.y,
        width: updatedNode.position.width,
        height: updatedNode.position.height
      }
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
      const store = (window as Window & { __xnetNodeStore?: LocalAPIStore }).__xnetNodeStore
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
      const targetAwareness = liveAwareness.get(canvasId) ?? syncManager.getAwareness(canvasId)
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
      const store = (window as Window & { __xnetNodeStore?: LocalAPIStore }).__xnetNodeStore
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
      if (!liveDoc) {
        syncManager.track(targetCanvas.id, CanvasSchema._schemaId)
      }
      const doc = liveDoc ?? (await syncManager.acquire(targetCanvas.id))
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
      const title = input.title ?? `Canvas Performance Scene (${summary.nodeCount} nodes)`

      await store.update(targetCanvas.id, {
        properties: {
          ...targetCanvas.properties,
          title
        }
      })
      await store.setDocumentContent(targetCanvas.id, Y.encodeStateAsUpdate(doc))

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
    },

    async duplicateCanvasNodeReference(input) {
      const store = (window as Window & { __xnetNodeStore?: LocalAPIStore }).__xnetNodeStore
      if (!store) {
        throw new Error('NodeStore not available')
      }

      for (const [canvasId, doc] of liveDocs.entries()) {
        const nodesMap = getCanvasObjectsMap<{
          id: string
          alias?: string
          position: {
            x: number
            y: number
            width: number
            height: number
          }
          properties: Record<string, unknown>
        }>(doc)
        const sourceNode = nodesMap.get(input.nodeId)
        if (!sourceNode) {
          continue
        }

        const duplicateId = `node_${crypto.randomUUID()}`
        doc.transact(() => {
          nodesMap.set(duplicateId, {
            ...sourceNode,
            id: duplicateId,
            alias: input.alias,
            position: {
              ...sourceNode.position,
              x: sourceNode.position.x + 420,
              y: sourceNode.position.y + 60
            }
          })
        })

        await store.setDocumentContent(canvasId, Y.encodeStateAsUpdate(doc))
        return duplicateId
      }

      throw new Error(`Node ${input.nodeId} not found`)
    }
  }
}

/**
 * Component that instruments the sync manager with devtools.
 * Must be rendered inside XNetDevToolsProvider to access the event bus.
 */
function SyncInstrumentation({ syncManager }: { syncManager: IPCSyncManager }) {
  const { eventBus } = useDevTools()

  useEffect(() => {
    if (!eventBus) return
    return syncManager.instrument(eventBus)
  }, [eventBus, syncManager])

  return null
}

/**
 * SEC-03: Component that connects Local API store requests to the NodeStore.
 *
 * This replaces the vulnerable executeJavaScript approach in local-api.ts.
 * Store operations are now handled via structured IPC messages, preventing
 * code injection attacks from malicious Local API requests.
 *
 * Must be rendered inside XNetProvider to access the store.
 */
function LocalAPIStoreHandler() {
  useEffect(() => {
    // Register handler for Local API store requests
    const cleanup = window.xnetLocalAPI?.onStoreRequest?.(async (request) => {
      // Access the store via window (set by XNetProvider)
      const store = (window as Window & { __xnetNodeStore?: LocalAPIStore }).__xnetNodeStore
      if (!store) {
        throw new Error('NodeStore not available')
      }

      const { operation, params } = request

      switch (operation) {
        case 'get': {
          const node = await store.get(params.id as string)
          if (!node) return null
          return {
            id: node.id,
            schemaId: node.schemaId,
            properties: node.properties,
            deleted: node.deleted,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt
          }
        }

        case 'list': {
          const nodes = await store.list({
            schemaId: params.schemaId as string | undefined,
            limit: params.limit as number,
            offset: params.offset as number
          })
          return nodes.map((n) => ({
            id: n.id,
            schemaId: n.schemaId,
            properties: n.properties,
            deleted: n.deleted,
            createdAt: n.createdAt,
            updatedAt: n.updatedAt
          }))
        }

        case 'create': {
          const node = await store.create({
            schemaId: params.schemaId as string,
            properties: params.properties as Record<string, unknown>
          })
          return {
            id: node.id,
            schemaId: node.schemaId,
            properties: node.properties,
            deleted: node.deleted,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt
          }
        }

        case 'update': {
          const node = await store.update(params.id as string, {
            properties: params.properties as Record<string, unknown>
          })
          return {
            id: node.id,
            schemaId: node.schemaId,
            properties: node.properties,
            deleted: node.deleted,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt
          }
        }

        case 'delete': {
          await store.delete(params.id as string)
          return undefined
        }

        default:
          throw new Error(`Unknown Local API store operation: ${operation}`)
      }
    })

    return cleanup
  }, [])

  return null
}

async function init() {
  const startTime = performance.now()

  // Get profile name from main process for identity isolation
  // This allows running multiple Electron instances with separate identities
  const profile = await window.xnet.getProfile()

  // Resolve identity per profile so each instance has a unique DID
  const testKey = makeTestKey(profile)
  const testIdentity = identityFromPrivateKey(testKey)
  AUTHOR_DID = testIdentity.did as `did:key:${string}`
  SIGNING_KEY = testKey

  // IPC-based node storage that routes to data process SQLite
  // This ensures nodes persist locally and are available for sync
  // See: docs/explorations/0074_ELECTRON_IPC_NODE_STORAGE.md
  const nodeStorage = new IPCNodeStorageAdapter()

  // Blob storage: IPC to main process → ChunkManager → BlobService
  // This routes all blob operations through IPC to main process SQLite,
  // ensuring blobs are available for BSM to sync with peers
  const ipcBlobStore = createIPCBlobStore()
  // ChunkManager expects a BlobStore, but our IPC blob store has the same interface
  const providerBlobStore = ipcBlobStore as unknown as ConstructorParameters<typeof ChunkManager>[0]
  const chunkManager = new ChunkManager(providerBlobStore)
  const blobService = new BlobService(chunkManager)

  // Listen for devtools toggle from main process menu.
  // Keep only one active listener across HMR reloads.
  window.__xnetDevToolsToggleCleanup?.()
  window.__xnetDevToolsToggleCleanup = window.xnet.onDevToolsToggle(() => {
    window.dispatchEvent(new CustomEvent('xnet-devtools-toggle'))
  })
  window.__xnetCanvasTestHarness = createCanvasTestHarness(ipcSyncManager)

  const container = document.getElementById('root')
  if (!container) {
    throw new Error('Root container #root not found')
  }

  const root = window.__xnetRoot ?? createRoot(container)
  window.__xnetRoot = root
  root.render(
    <React.StrictMode>
      <ThemeProvider defaultTheme="dark" storageKey="xnet-electron-theme">
        <TelemetryProvider consent={consentManager} collector={telemetryCollector}>
          <XNetProvider
            config={{
              nodeStorage,
              authorDID: AUTHOR_DID,
              signingKey: SIGNING_KEY,
              blobStore: providerBlobStore,
              runtime: {
                mode: 'ipc',
                fallback: 'error',
                diagnostics: import.meta.env.DEV
              },
              syncManager: ipcSyncManager,
              platform: 'electron'
            }}
          >
            <BlobProvider blobService={blobService}>
              <XNetDevToolsProvider
                telemetryCollector={telemetryCollector}
                consentManager={consentManager}
                fabInitialOffset={{ x: 16, y: 220 }}
              >
                <SyncInstrumentation syncManager={ipcSyncManager} />
                <LocalAPIStoreHandler />
                <App />
              </XNetDevToolsProvider>
            </BlobProvider>
          </XNetProvider>
        </TelemetryProvider>
      </ThemeProvider>
    </React.StrictMode>
  )

  // Report startup performance (deferred to ensure devtools instrumentation is mounted)
  const startupDuration = performance.now() - startTime
  setTimeout(() => {
    telemetryCollector.reportPerformance('app.startup', startupDuration, 'renderer')
  }, 100)
}

init()

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    window.__xnetCanvasTestHarness = null
    window.__xnetDevToolsToggleCleanup?.()
    window.__xnetDevToolsToggleCleanup = null
  })
}
