/**
 * xNet Web - Entry Point
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { XNetProvider } from '@xnet/react'
import { IndexedDBNodeStorageAdapter, BlobService } from '@xnet/data'
import { IndexedDBAdapter, BlobStore, ChunkManager } from '@xnet/storage'
import { BlobProvider } from '@xnet/editor/react'
import { ThemeProvider } from '@xnet/ui'
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

// Storage adapter - IndexedDB for persistent browser storage
const nodeStorage = new IndexedDBNodeStorageAdapter()

// Blob storage: IndexedDBAdapter → BlobStore → ChunkManager → BlobService
const storageAdapter = new IndexedDBAdapter()
const blobStore = new BlobStore(storageAdapter)
const chunkManager = new ChunkManager(blobStore)
const blobService = new BlobService(chunkManager)

// TODO: In production, generate/load identity from secure storage
const AUTHOR_DID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as const
const SIGNING_KEY = new Uint8Array(32).fill(1)

async function init() {
  await storageAdapter.open()

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ThemeProvider defaultTheme="system" storageKey="xnet-web-theme">
        <XNetProvider
          config={{
            nodeStorage,
            authorDID: AUTHOR_DID,
            signingKey: SIGNING_KEY,
            blobStore
          }}
        >
          <BlobProvider blobService={blobService}>
            <RouterProvider router={router} />
          </BlobProvider>
        </XNetProvider>
      </ThemeProvider>
    </React.StrictMode>
  )
}

init()
