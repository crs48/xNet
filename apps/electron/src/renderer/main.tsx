/**
 * Renderer entry point
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { XNetProvider } from '@xnet/react'
import { IndexedDBNodeStorageAdapter } from '@xnet/data'
import { App } from './App'
import './styles.css'

// Use IndexedDB for NodeStore persistence in the renderer
// This works the same as the web app
const nodeStorage = new IndexedDBNodeStorageAdapter({
  dbName: 'xnet-electron-nodes'
})

// TODO: In production, load identity from secure storage via IPC
const AUTHOR_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as const
const SIGNING_KEY = new Uint8Array(32).fill(1)

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
