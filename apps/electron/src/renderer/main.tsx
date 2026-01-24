/**
 * Renderer entry point
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { XNetProvider, type SyncManager } from '@xnet/react'
import { IndexedDBNodeStorageAdapter } from '@xnet/data'
import { XNetDevToolsProvider } from '@xnet/devtools'
import { ThemeProvider } from '@xnet/ui'
import { ConsentManager, TelemetryCollector, TelemetryProvider } from '@xnet/telemetry'
import { createIPCSyncManager } from './lib/ipc-sync-manager'
import { App } from './App'
import './styles.css'

// TODO: In production, load identity from secure storage via IPC
const AUTHOR_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as const
const SIGNING_KEY = new Uint8Array(32).fill(1)

// Telemetry: consent set to 'anonymous' for dev (enables all collection tiers, visible in devtools)
const consentManager = new ConsentManager({ autoLoad: true })
consentManager.setTier('anonymous') // Enable all collection tiers for devtools visibility
const telemetryCollector = new TelemetryCollector({ consent: consentManager })

// Create IPC-based sync manager for desktop (routes through main process BSM)
const ipcSyncManager: SyncManager | undefined = window.xnetBSM ? createIPCSyncManager() : undefined

async function init() {
  const startTime = performance.now()

  // Get profile name from main process for IndexedDB isolation
  // This allows running multiple Electron instances with separate data
  const profile = await window.xnet.getProfile()
  const dbName = profile === 'default' ? 'xnet-electron-nodes' : `xnet-electron-nodes-${profile}`

  const nodeStorage = new IndexedDBNodeStorageAdapter({ dbName })

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
              syncManager: ipcSyncManager
            }}
          >
            <XNetDevToolsProvider
              telemetryCollector={telemetryCollector}
              consentManager={consentManager}
            >
              <App />
            </XNetDevToolsProvider>
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
