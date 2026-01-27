/**
 * Renderer entry point
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { XNetProvider } from '@xnet/react'
import { IndexedDBNodeStorageAdapter, BlobService } from '@xnet/data'
import { ChunkManager } from '@xnet/storage'
import { BlobProvider } from '@xnet/editor/react'
import { XNetDevToolsProvider } from '@xnet/devtools'
import { ThemeProvider } from '@xnet/ui'
import { ConsentManager, TelemetryCollector, TelemetryProvider } from '@xnet/telemetry'
import { createIPCSyncManager } from './lib/ipc-sync-manager'
import { createIPCBlobStore } from './lib/ipc-blob-store'
import { App } from './App'
import './styles.css'

// TODO: In production, load identity from secure storage via IPC
const AUTHOR_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as const
const SIGNING_KEY = new Uint8Array(32).fill(1)

// Telemetry: consent set to 'anonymous' for dev (enables all collection tiers, visible in devtools)
const consentManager = new ConsentManager({ autoLoad: true })
consentManager.setTier('anonymous') // Enable all collection tiers for devtools visibility
const telemetryCollector = new TelemetryCollector({ consent: consentManager })

// IPC-based sync manager routes sync through the main process BSM
const ipcSyncManager = createIPCSyncManager()

async function init() {
  const startTime = performance.now()

  // Get profile name from main process for IndexedDB isolation
  // This allows running multiple Electron instances with separate data
  const profile = await window.xnet.getProfile()
  const dbName = profile === 'default' ? 'xnet-electron-nodes' : `xnet-electron-nodes-${profile}`

  const nodeStorage = new IndexedDBNodeStorageAdapter({ dbName })

  // Blob storage: IPC to main process → ChunkManager → BlobService
  // This routes all blob operations through IPC to main process SQLite,
  // ensuring blobs are available for BSM to sync with peers
  const ipcBlobStore = createIPCBlobStore()
  // ChunkManager expects a BlobStore, but our IPC blob store has the same interface
  const chunkManager = new ChunkManager(ipcBlobStore as any)
  const blobService = new BlobService(chunkManager)

  // Listen for devtools toggle from main process menu
  // Dispatches a custom event that XNetDevToolsProvider can listen to
  window.xnet.onDevToolsToggle(() => {
    window.dispatchEvent(new CustomEvent('xnet-devtools-toggle'))
  })

  const root = createRoot(document.getElementById('root')!)
  root.render(
    <React.StrictMode>
      <ThemeProvider defaultTheme="dark" storageKey="xnet-electron-theme">
        <TelemetryProvider consent={consentManager} collector={telemetryCollector}>
          <XNetProvider
            config={{
              nodeStorage,
              authorDID: AUTHOR_DID,
              signingKey: SIGNING_KEY,
              blobStore: ipcBlobStore as any,
              syncManager: ipcSyncManager
            }}
          >
            <BlobProvider blobService={blobService}>
              <XNetDevToolsProvider
                telemetryCollector={telemetryCollector}
                consentManager={consentManager}
              >
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
