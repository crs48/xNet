/**
 * Renderer entry point
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { XNetProvider } from '@xnet/react'
import { IndexedDBNodeStorageAdapter } from '@xnet/data'
import { App } from './App'
import './styles.css'

// TODO: In production, load identity from secure storage via IPC
const AUTHOR_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as const
const SIGNING_KEY = new Uint8Array(32).fill(1)

async function init() {
  // Get profile name from main process for IndexedDB isolation
  // This allows running multiple Electron instances with separate data
  const profile = await window.xnet.getProfile()
  const dbName = profile === 'default' ? 'xnet-electron-nodes' : `xnet-electron-nodes-${profile}`

  const nodeStorage = new IndexedDBNodeStorageAdapter({ dbName })

  const root = createRoot(document.getElementById('root')!)
  root.render(
    <React.StrictMode>
      <XNetProvider
        config={{
          nodeStorage,
          authorDID: AUTHOR_DID,
          signingKey: SIGNING_KEY
        }}
      >
        <App />
      </XNetProvider>
    </React.StrictMode>
  )
}

init()
