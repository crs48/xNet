/**
 * xNotes Web - Entry Point
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { XNetProvider } from '@xnet/react'
import { IndexedDBAdapter } from '@xnet/sdk'
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

// Storage adapter
const storage = new IndexedDBAdapter()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <XNetProvider config={{ storage }}>
      <RouterProvider router={router} />
    </XNetProvider>
  </React.StrictMode>
)
