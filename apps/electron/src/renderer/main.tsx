/**
 * Renderer entry point
 */
import { BlobService } from '@xnetjs/data'
import { XNetDevToolsProvider, useDevTools } from '@xnetjs/devtools'
import { BlobProvider } from '@xnetjs/editor/react'
import { identityFromPrivateKey } from '@xnetjs/identity'
import { XNetProvider } from '@xnetjs/react'
import { ChunkManager } from '@xnetjs/storage'
import { ConsentManager, TelemetryCollector, TelemetryProvider } from '@xnetjs/telemetry'
import { ThemeProvider } from '@xnetjs/ui'
import React, { useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
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
    __xnetRoot?: Root
    __xnetDevToolsToggleCleanup?: (() => void) | null
  }
}

window.__xnetIpcSyncManager = ipcSyncManager

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
    window.__xnetDevToolsToggleCleanup?.()
    window.__xnetDevToolsToggleCleanup = null
  })
}
