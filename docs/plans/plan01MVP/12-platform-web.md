# 12: Platform - Web (TanStack PWA)

> Progressive Web App using TanStack Router

**Duration:** 2 weeks
**Dependencies:** @xnet/sdk, @xnet/react

## Overview

The web app is a PWA built with TanStack Router for fast, type-safe routing with offline-first capabilities.

## App Setup

```bash
cd apps/web
pnpm create vite . --template react-ts
pnpm add @tanstack/react-router @tanstack/router-vite-plugin
pnpm add @xnet/sdk@workspace:* @xnet/react@workspace:*
pnpm add vite-plugin-pwa workbox-window
pnpm add -D @tanstack/router-devtools
```

## Directory Structure

```
apps/web/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── public/
│   ├── manifest.json
│   └── icons/
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # App wrapper
│   ├── routeTree.gen.ts      # Generated routes
│   ├── routes/
│   │   ├── __root.tsx        # Root layout
│   │   ├── index.tsx         # Home page
│   │   ├── doc.$docId.tsx    # Document page
│   │   └── settings.tsx      # Settings page
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── Editor.tsx
│   │   ├── SyncIndicator.tsx
│   │   └── DocumentList.tsx
│   ├── hooks/
│   │   └── useOffline.ts
│   └── styles/
│       └── globals.css
└── README.md
```

## Implementation

### Vite Configuration (vite.config.ts)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'xNet',
        short_name: 'xNet',
        description: 'Collaborative notes powered by xNet',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets'
            }
          }
        ]
      }
    })
  ]
})
```

### Entry Point (main.tsx)

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { XNetProvider } from '@xnet/react'
import { IndexedDBAdapter } from '@xnet/storage'
import { routeTree } from './routeTree.gen'
import './styles/globals.css'

// Create router instance
const router = createRouter({ routeTree })

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
  })
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

// Type safety for router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

### Root Layout (routes/\_\_root.tsx)

```tsx
import { createRootRoute, Outlet, Link } from '@tanstack/react-router'
import { useSync, useIdentity } from '@xnet/react'
import { Sidebar } from '../components/Sidebar'
import { SyncIndicator } from '../components/SyncIndicator'

export const Route = createRootRoute({
  component: RootLayout
})

function RootLayout() {
  const { status, peerCount } = useSync()
  const { identity, isAuthenticated } = useIdentity()

  return (
    <div className="app-layout">
      <header className="app-header">
        <Link to="/" className="logo">
          xNet
        </Link>
        <div className="header-right">
          <SyncIndicator status={status} peerCount={peerCount} />
          {isAuthenticated && (
            <span className="identity" title={identity?.did}>
              {identity?.did.slice(0, 16)}...
            </span>
          )}
        </div>
      </header>

      <div className="app-body">
        <Sidebar />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

### Home Page (routes/index.tsx)

```tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@xnet/react'
import { useXNet } from '@xnet/react'

export const Route = createFileRoute('/')({
  component: HomePage
})

function HomePage() {
  const { store, isReady } = useXNet()
  const { data: documents, loading } = useQuery({
    type: 'page',
    filters: [],
    sort: [{ field: 'updated', direction: 'desc' }],
    limit: 20
  })

  const createDocument = async () => {
    // Would create document via store
    console.log('Create document')
  }

  if (!isReady || loading) {
    return <div className="loading">Loading...</div>
  }

  return (
    <div className="home-page">
      <div className="page-header">
        <h1>All Pages</h1>
        <button onClick={createDocument} className="btn-primary">
          + New Page
        </button>
      </div>

      {documents.length === 0 ? (
        <div className="empty-state">
          <p>No documents yet. Create your first page!</p>
        </div>
      ) : (
        <ul className="document-list">
          {documents.map((doc: any) => (
            <li key={doc.id}>
              <Link to="/doc/$docId" params={{ docId: doc.id }}>
                <span className="doc-title">{doc.title || 'Untitled'}</span>
                <span className="doc-date">{new Date(doc.updated).toLocaleDateString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

### Document Page (routes/doc.$docId.tsx)

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { useDocument, usePresence } from '@xnet/react'
import { Editor } from '../components/Editor'

export const Route = createFileRoute('/doc/$docId')({
  component: DocumentPage
})

function DocumentPage() {
  const { docId } = Route.useParams()
  const { data: document, loading, error, update } = useDocument(docId)
  const { localPresence, remotePresences, setPresence } = usePresence(docId)

  if (loading) {
    return <div className="loading">Loading document...</div>
  }

  if (error) {
    return <div className="error">Error: {error.message}</div>
  }

  if (!document) {
    return <div className="not-found">Document not found</div>
  }

  return (
    <div className="document-page">
      <div className="document-header">
        <input
          type="text"
          className="title-input"
          value={document.metadata.title}
          onChange={(e) =>
            update((d) => {
              d.metadata.title = e.target.value
            })
          }
          placeholder="Untitled"
        />

        {remotePresences.length > 0 && (
          <div className="presence-avatars">
            {remotePresences.map((p) => (
              <span
                key={p.did}
                className="avatar"
                style={{ backgroundColor: p.color }}
                title={p.name}
              >
                {p.name[0]}
              </span>
            ))}
          </div>
        )}
      </div>

      <Editor
        document={document}
        onChange={(content) =>
          update((d) => {
            // Would update Yjs content
          })
        }
        onCursorChange={(cursor) => setPresence({ cursor })}
      />
    </div>
  )
}
```

### Sidebar Component (components/Sidebar.tsx)

```tsx
import { Link, useLocation } from '@tanstack/react-router'
import { useQuery } from '@xnet/react'

export function Sidebar() {
  const location = useLocation()
  const { data: documents } = useQuery({
    type: 'any',
    filters: [],
    sort: [{ field: 'updated', direction: 'desc' }],
    limit: 50
  })

  return (
    <aside className="sidebar">
      <nav>
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
          All Pages
        </Link>

        <div className="sidebar-section">
          <h3>Recent</h3>
          <ul>
            {documents.slice(0, 10).map((doc: any) => (
              <li key={doc.id}>
                <Link
                  to="/doc/$docId"
                  params={{ docId: doc.id }}
                  className={location.pathname.includes(doc.id) ? 'active' : ''}
                >
                  {doc.title || 'Untitled'}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <Link to="/settings">Settings</Link>
      </nav>
    </aside>
  )
}
```

### Sync Indicator (components/SyncIndicator.tsx)

```tsx
interface Props {
  status: 'offline' | 'connecting' | 'synced'
  peerCount: number
}

export function SyncIndicator({ status, peerCount }: Props) {
  const statusColors = {
    offline: '#ff4444',
    connecting: '#ffaa00',
    synced: '#44ff44'
  }

  return (
    <div className="sync-indicator" title={`${status} - ${peerCount} peers`}>
      <span className="status-dot" style={{ backgroundColor: statusColors[status] }} />
      <span className="status-text">{status === 'synced' ? `${peerCount} peers` : status}</span>
    </div>
  )
}
```

### Offline Hook (hooks/useOffline.ts)

```typescript
import { useState, useEffect } from 'react'

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return isOffline
}
```

### Global Styles (styles/globals.css)

```css
:root {
  --color-bg: #ffffff;
  --color-text: #1a1a1a;
  --color-border: #e5e5e5;
  --color-primary: #0066cc;
  --sidebar-width: 240px;
  --header-height: 48px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--color-bg);
  color: var(--color-text);
}

.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-header {
  height: var(--header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border);
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: var(--sidebar-width);
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
  padding: 16px;
}

.app-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.btn-primary {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
}

.sync-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #666;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
```

### PWA Manifest (public/manifest.json)

```json
{
  "name": "xNet",
  "short_name": "xNet",
  "description": "Collaborative notes powered by xNet",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#ffffff",
  "background_color": "#ffffff",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

## Validation Checklist

- [ ] App builds without errors
- [ ] App loads in browser
- [ ] TanStack Router navigation works
- [ ] PWA installs correctly
- [ ] App works offline
- [ ] Document CRUD works
- [ ] IndexedDB persists data
- [ ] Service worker caches assets

## Next Step

Proceed to [13-xnet-features.md](./13-xnet-features.md)
