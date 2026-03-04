# 08: @xnetjs/react

> React hooks for xNet integration

**Duration:** 2 weeks
**Dependencies:** @xnetjs/data, @xnetjs/storage, @xnetjs/network, @xnetjs/query

## Overview

This package provides React hooks for seamless integration with xNet. It handles reactive updates, sync status, and presence.

## Package Setup

```bash
cd packages/react
pnpm add react zustand
pnpm add -D vitest typescript tsup @testing-library/react @types/react jsdom
pnpm add @xnetjs/data@workspace:* @xnetjs/storage@workspace:* @xnetjs/network@workspace:* @xnetjs/query@workspace:*
```

## Directory Structure

```
packages/react/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Public exports
│   ├── context.ts            # XNet context provider
│   ├── hooks/
│   │   ├── useDocument.ts    # Document hook
│   │   ├── useDocument.test.ts
│   │   ├── useQuery.ts       # Query hook
│   │   ├── useQuery.test.ts
│   │   ├── useMutation.ts    # Mutation hook
│   │   ├── useSync.ts        # Sync status hook
│   │   ├── usePresence.ts    # Presence hook
│   │   └── useIdentity.ts    # Identity hook
│   └── store/
│       └── xnet.ts           # Zustand store
└── README.md
```

## Implementation

### Context Provider (context.ts)

```typescript
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { StorageAdapter } from '@xnetjs/storage'
import type { NetworkNode } from '@xnetjs/network'
import type { Identity } from '@xnetjs/identity'
import type { SearchIndex } from '@xnetjs/query'
import { createXNetStore, type XNetStore } from './store/xnet'

export interface XNetConfig {
  storage: StorageAdapter
  network?: NetworkNode
  identity?: Identity
  searchIndex?: SearchIndex
}

export interface XNetContextValue {
  store: XNetStore
  storage: StorageAdapter
  network?: NetworkNode
  identity?: Identity
  searchIndex?: SearchIndex
  isReady: boolean
}

const XNetContext = createContext<XNetContextValue | null>(null)

export interface XNetProviderProps {
  config: XNetConfig
  children: ReactNode
}

export function XNetProvider({ config, children }: XNetProviderProps): JSX.Element {
  const [store] = useState(() => createXNetStore(config))
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    // Initialize storage
    config.storage.open().then(() => {
      setIsReady(true)
    })

    return () => {
      config.storage.close()
    }
  }, [config.storage])

  const value: XNetContextValue = {
    store,
    storage: config.storage,
    network: config.network,
    identity: config.identity,
    searchIndex: config.searchIndex,
    isReady
  }

  return React.createElement(XNetContext.Provider, { value }, children)
}

export function useXNet(): XNetContextValue {
  const context = useContext(XNetContext)
  if (!context) {
    throw new Error('useXNet must be used within an XNetProvider')
  }
  return context
}
```

### Zustand Store (store/xnet.ts)

```typescript
import { create } from 'zustand'
import type { XDocument } from '@xnetjs/data'
import type { XNetConfig } from '../context'

export interface DocumentState {
  doc: XDocument
  loading: boolean
  error?: Error
  dirty: boolean
}

export interface XNetState {
  documents: Map<string, DocumentState>
  syncStatus: 'offline' | 'connecting' | 'synced'
  peers: string[]
}

export interface XNetActions {
  loadDocument: (id: string) => Promise<XDocument | null>
  updateDocument: (id: string, updater: (doc: XDocument) => void) => void
  setSyncStatus: (status: XNetState['syncStatus']) => void
  setPeers: (peers: string[]) => void
}

export type XNetStore = XNetState & XNetActions

export function createXNetStore(config: XNetConfig) {
  return create<XNetStore>((set, get) => ({
    documents: new Map(),
    syncStatus: 'offline',
    peers: [],

    async loadDocument(id: string): Promise<XDocument | null> {
      const existing = get().documents.get(id)
      if (existing && !existing.loading) {
        return existing.doc
      }

      // Mark as loading
      set((state) => {
        const docs = new Map(state.documents)
        docs.set(id, { doc: null as any, loading: true, dirty: false })
        return { documents: docs }
      })

      try {
        // Load from storage
        const stored = await config.storage.getDocument(id)
        if (!stored) {
          set((state) => {
            const docs = new Map(state.documents)
            docs.delete(id)
            return { documents: docs }
          })
          return null
        }

        // Create XDocument from stored data
        // This would use @xnetjs/data to reconstruct
        const doc = {
          id,
          ydoc: null as any,
          workspace: '',
          type: 'page',
          metadata: {}
        } as XDocument

        set((state) => {
          const docs = new Map(state.documents)
          docs.set(id, { doc, loading: false, dirty: false })
          return { documents: docs }
        })

        return doc
      } catch (error) {
        set((state) => {
          const docs = new Map(state.documents)
          docs.set(id, { doc: null as any, loading: false, error: error as Error, dirty: false })
          return { documents: docs }
        })
        return null
      }
    },

    updateDocument(id: string, updater: (doc: XDocument) => void): void {
      const state = get().documents.get(id)
      if (!state?.doc) return

      updater(state.doc)

      set((s) => {
        const docs = new Map(s.documents)
        docs.set(id, { ...state, dirty: true })
        return { documents: docs }
      })
    },

    setSyncStatus(status: XNetState['syncStatus']): void {
      set({ syncStatus: status })
    },

    setPeers(peers: string[]): void {
      set({ peers })
    }
  }))
}
```

### useDocument Hook (hooks/useDocument.ts)

```typescript
import { useEffect, useMemo, useCallback } from 'react'
import { useXNet } from '../context'

export interface UseDocumentOptions {
  autoLoad?: boolean
}

export interface UseDocumentResult<T = unknown> {
  data: T | null
  loading: boolean
  error?: Error
  update: (updater: (data: T) => void) => void
  refresh: () => Promise<void>
}

export function useDocument<T = unknown>(
  docId: string | null,
  options: UseDocumentOptions = {}
): UseDocumentResult<T> {
  const { autoLoad = true } = options
  const { store, isReady } = useXNet()

  // Get document state from store
  const docState = useMemo(() => {
    if (!docId) return null
    return store.documents.get(docId)
  }, [store.documents, docId])

  // Load document on mount
  useEffect(() => {
    if (autoLoad && isReady && docId && !docState) {
      store.loadDocument(docId)
    }
  }, [autoLoad, isReady, docId, docState, store])

  const update = useCallback(
    (updater: (data: T) => void) => {
      if (docId) {
        store.updateDocument(docId, (doc) => {
          // Would apply update to Yjs doc
          updater(doc as unknown as T)
        })
      }
    },
    [docId, store]
  )

  const refresh = useCallback(async () => {
    if (docId) {
      await store.loadDocument(docId)
    }
  }, [docId, store])

  return {
    data: docState?.doc as T | null,
    loading: docState?.loading ?? (autoLoad && !!docId),
    error: docState?.error,
    update,
    refresh
  }
}
```

### useQuery Hook (hooks/useQuery.ts)

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useXNet } from '../context'
import { createLocalQueryEngine, type Query, type QueryResult } from '@xnetjs/query'

export interface UseQueryOptions {
  enabled?: boolean
  refetchInterval?: number
}

export interface UseQueryResult<T> {
  data: T[]
  loading: boolean
  error?: Error
  total: number
  hasMore: boolean
  refetch: () => Promise<void>
  fetchMore: () => Promise<void>
}

export function useQuery<T = unknown>(
  query: Query,
  options: UseQueryOptions = {}
): UseQueryResult<T> {
  const { enabled = true, refetchInterval } = options
  const { storage, isReady } = useXNet()

  const [state, setState] = useState<{
    data: T[]
    loading: boolean
    error?: Error
    total: number
    hasMore: boolean
    cursor?: string
  }>({
    data: [],
    loading: true,
    total: 0,
    hasMore: false
  })

  const execute = useCallback(
    async (append = false) => {
      if (!isReady || !enabled) return

      setState((s) => ({ ...s, loading: true, error: undefined }))

      try {
        const engine = createLocalQueryEngine(storage, async () => null)
        const queryWithCursor =
          append && state.cursor ? { ...query, offset: parseInt(state.cursor) } : query

        const result = await engine.query<T>(queryWithCursor)

        setState((s) => ({
          data: append ? [...s.data, ...result.items] : result.items,
          loading: false,
          total: result.total,
          hasMore: result.hasMore,
          cursor: result.cursor
        }))
      } catch (error) {
        setState((s) => ({ ...s, loading: false, error: error as Error }))
      }
    },
    [isReady, enabled, storage, query, state.cursor]
  )

  useEffect(() => {
    execute()
  }, [execute])

  useEffect(() => {
    if (refetchInterval && refetchInterval > 0) {
      const interval = setInterval(() => execute(), refetchInterval)
      return () => clearInterval(interval)
    }
  }, [refetchInterval, execute])

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    total: state.total,
    hasMore: state.hasMore,
    refetch: () => execute(false),
    fetchMore: () => execute(true)
  }
}
```

### useSync Hook (hooks/useSync.ts)

```typescript
import { useEffect, useState } from 'react'
import { useXNet } from '../context'

export interface UseSyncResult {
  status: 'offline' | 'connecting' | 'synced'
  peers: string[]
  peerCount: number
}

export function useSync(): UseSyncResult {
  const { store, network } = useXNet()

  const [state, setState] = useState<UseSyncResult>({
    status: 'offline',
    peers: [],
    peerCount: 0
  })

  useEffect(() => {
    if (!network) {
      setState({ status: 'offline', peers: [], peerCount: 0 })
      return
    }

    // Subscribe to store changes
    const unsubscribe = store.subscribe((s) => {
      setState({
        status: s.syncStatus,
        peers: s.peers,
        peerCount: s.peers.length
      })
    })

    // Set initial connected state
    store.setSyncStatus('connecting')

    return () => {
      unsubscribe()
    }
  }, [network, store])

  return state
}
```

### usePresence Hook (hooks/usePresence.ts)

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useXNet } from '../context'
import type { UserPresence } from '@xnetjs/data'

export interface UsePresenceResult {
  localPresence: UserPresence | null
  remotePresences: UserPresence[]
  setPresence: (presence: Partial<UserPresence>) => void
}

export function usePresence(docId: string): UsePresenceResult {
  const { identity } = useXNet()

  const [localPresence, setLocalPresence] = useState<UserPresence | null>(null)
  const [remotePresences, setRemotePresences] = useState<UserPresence[]>([])

  useEffect(() => {
    if (identity) {
      setLocalPresence({
        did: identity.did,
        name: 'User', // Would come from profile
        color: generateColor(identity.did)
      })
    }
  }, [identity])

  const setPresence = useCallback((update: Partial<UserPresence>) => {
    setLocalPresence((prev) => (prev ? { ...prev, ...update } : null))
    // Would broadcast to awareness
  }, [])

  return {
    localPresence,
    remotePresences,
    setPresence
  }
}

function generateColor(did: string): string {
  // Generate consistent color from DID
  let hash = 0
  for (let i = 0; i < did.length; i++) {
    hash = did.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = hash % 360
  return `hsl(${hue}, 70%, 50%)`
}
```

### useIdentity Hook (hooks/useIdentity.ts)

```typescript
import { useXNet } from '../context'
import type { Identity } from '@xnetjs/identity'

export interface UseIdentityResult {
  identity: Identity | null
  isAuthenticated: boolean
  did: string | null
}

export function useIdentity(): UseIdentityResult {
  const { identity } = useXNet()

  return {
    identity: identity ?? null,
    isAuthenticated: !!identity,
    did: identity?.did ?? null
  }
}
```

### Public Exports (index.ts)

```typescript
// Context
export { XNetProvider, useXNet, type XNetConfig, type XNetContextValue } from './context'

// Hooks
export { useDocument, type UseDocumentOptions, type UseDocumentResult } from './hooks/useDocument'
export { useQuery, type UseQueryOptions, type UseQueryResult } from './hooks/useQuery'
export { useSync, type UseSyncResult } from './hooks/useSync'
export { usePresence, type UsePresenceResult } from './hooks/usePresence'
export { useIdentity, type UseIdentityResult } from './hooks/useIdentity'

// Store
export { createXNetStore, type XNetStore, type XNetState, type XNetActions } from './store/xnet'
```

## Usage Example

```tsx
import { XNetProvider, useDocument, useQuery, useSync } from '@xnetjs/react'
import { IndexedDBAdapter } from '@xnetjs/storage'

// Setup
const storage = new IndexedDBAdapter()

function App() {
  return (
    <XNetProvider config={{ storage }}>
      <DocumentViewer docId="doc-123" />
    </XNetProvider>
  )
}

function DocumentViewer({ docId }: { docId: string }) {
  const { data, loading, update } = useDocument(docId)
  const { status, peerCount } = useSync()

  if (loading) return <div>Loading...</div>
  if (!data) return <div>Not found</div>

  return (
    <div>
      <div>
        Status: {status} ({peerCount} peers)
      </div>
      <h1>{data.metadata.title}</h1>
      <button
        onClick={() =>
          update((d) => {
            d.metadata.title = 'New Title'
          })
        }
      >
        Update Title
      </button>
    </div>
  )
}
```

## Validation Checklist

- [ ] XNetProvider initializes correctly
- [ ] useDocument loads and caches documents
- [ ] useQuery fetches and paginates
- [ ] useSync reflects connection status
- [ ] usePresence tracks users
- [ ] All hooks work with SSR (no window access on init)
- [ ] All tests pass

## Next Step

Proceed to [09-xnet-sdk.md](./09-xnet-sdk.md)
