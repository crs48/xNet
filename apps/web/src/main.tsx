/**
 * xNet Web - Entry Point
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { XNetProvider } from '@xnet/react'
import { IndexedDBAdapter } from '@xnet/storage'
import { MemoryNodeStorageAdapter } from '@xnet/data'
import { routeTree } from './routeTree.gen'
import './styles/globals.css'

// Create router instance
const router = createRouter({ routeTree })

// Type safety for router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Storage adapters
const storage = new IndexedDBAdapter()
const nodeStorage = new MemoryNodeStorageAdapter()

// TODO: In production, generate/load identity from secure storage
const AUTHOR_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as const
const SIGNING_KEY = new Uint8Array(32).fill(1)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <XNetProvider
      config={{
        storage,
        nodeStorage,
        authorDID: AUTHOR_DID,
        signingKey: SIGNING_KEY
      }}
    >
      <RouterProvider router={router} />
    </XNetProvider>
  </React.StrictMode>
)
