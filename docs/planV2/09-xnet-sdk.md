# 09: @xnet/sdk

> Unified SDK bundle for easy integration

**Duration:** 1 week
**Dependencies:** All @xnet/* packages

## Overview

This package bundles all xNet packages into a single, easy-to-use SDK with a unified API.

## Package Setup

```bash
cd packages/sdk
pnpm add -D vitest typescript tsup
# Add all workspace dependencies
pnpm add @xnet/core@workspace:* @xnet/crypto@workspace:* @xnet/identity@workspace:*
pnpm add @xnet/storage@workspace:* @xnet/data@workspace:* @xnet/network@workspace:*
pnpm add @xnet/query@workspace:* @xnet/react@workspace:*
```

## Directory Structure

```
packages/sdk/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main entry point
│   ├── client.ts             # XNet client class
│   ├── client.test.ts
│   └── presets/
│       ├── browser.ts        # Browser preset
│       ├── node.ts           # Node.js preset
│       └── react-native.ts   # React Native preset
└── README.md
```

## Implementation

### XNet Client (client.ts)

```typescript
import { IndexedDBAdapter, MemoryAdapter, type StorageAdapter } from '@xnet/storage'
import { generateIdentity, generateKeyBundle, type Identity, type KeyBundle } from '@xnet/identity'
import { createNode, stopNode, type NetworkNode, type NetworkConfig } from '@xnet/network'
import { createDocument, loadDocument, getDocumentState, type XDocument, type DocumentType } from '@xnet/data'
import { createLocalQueryEngine, createSearchIndex, type Query, type QueryResult, type SearchIndex } from '@xnet/query'
import { SnapshotManager } from '@xnet/storage'

export interface XNetClientConfig {
  /** Storage adapter (default: IndexedDB in browser, Memory in tests) */
  storage?: StorageAdapter
  /** Network configuration */
  network?: Partial<NetworkConfig>
  /** Enable P2P networking (default: true) */
  enableNetwork?: boolean
  /** Existing identity to use */
  identity?: Identity
  /** Existing key bundle */
  keyBundle?: KeyBundle
}

export interface XNetClient {
  // Lifecycle
  readonly isReady: boolean
  readonly identity: Identity
  start(): Promise<void>
  stop(): Promise<void>

  // Documents
  createDocument(options: CreateDocOptions): Promise<XDocument>
  getDocument(id: string): Promise<XDocument | null>
  deleteDocument(id: string): Promise<void>
  listDocuments(workspace?: string): Promise<string[]>

  // Queries
  query<T>(query: Query): Promise<QueryResult<T>>
  search(text: string, limit?: number): Promise<{ id: string; title: string; score: number }[]>

  // Network
  readonly peers: string[]
  readonly syncStatus: 'offline' | 'connecting' | 'synced'
  connectToPeer(multiaddr: string): Promise<void>

  // Events
  on(event: 'document:update', handler: (docId: string) => void): () => void
  on(event: 'sync:status', handler: (status: string) => void): () => void
  on(event: 'peer:connect', handler: (peerId: string) => void): () => void
}

interface CreateDocOptions {
  workspace: string
  type: DocumentType
  title: string
  parent?: string
}

export async function createXNetClient(config: XNetClientConfig = {}): Promise<XNetClient> {
  // Initialize storage
  const storage = config.storage ?? new IndexedDBAdapter()
  await storage.open()

  // Initialize identity
  const keyBundle = config.keyBundle ?? generateKeyBundle()
  const identity = config.identity ?? keyBundle.identity

  // Initialize search index
  const searchIndex = createSearchIndex()

  // Initialize network (optional)
  let networkNode: NetworkNode | null = null
  if (config.enableNetwork !== false) {
    try {
      networkNode = await createNode({
        did: identity.did,
        privateKey: keyBundle.signingKey,
        config: config.network
      })
    } catch (e) {
      console.warn('Failed to start network:', e)
    }
  }

  // Initialize snapshot manager
  const snapshotManager = new SnapshotManager({
    adapter: storage,
    triggers: { updateCount: 10000, timeInterval: 24 * 60 * 60 * 1000, storagePressure: 0.8 },
    signingKey: keyBundle.signingKey,
    creatorDID: identity.did
  })

  // Document cache
  const documentCache = new Map<string, XDocument>()

  // Event handlers
  const eventHandlers = new Map<string, Set<Function>>()

  // Query engine
  const queryEngine = createLocalQueryEngine(storage, async (id) => {
    return documentCache.get(id) ?? null
  })

  let isReady = true
  let syncStatus: 'offline' | 'connecting' | 'synced' = networkNode ? 'connecting' : 'offline'

  const client: XNetClient = {
    get isReady() { return isReady },
    get identity() { return identity },
    get peers() { return networkNode ? [] : [] }, // Would get from network
    get syncStatus() { return syncStatus },

    async start(): Promise<void> {
      if (networkNode) {
        syncStatus = 'synced'
        emit('sync:status', syncStatus)
      }
    },

    async stop(): Promise<void> {
      if (networkNode) {
        await stopNode(networkNode)
        networkNode = null
      }
      await storage.close()
      isReady = false
    },

    async createDocument(options: CreateDocOptions): Promise<XDocument> {
      const id = `${options.workspace}/${generateId()}`
      const doc = createDocument({
        id,
        workspace: options.workspace,
        type: options.type,
        title: options.title,
        createdBy: identity.did,
        signingKey: keyBundle.signingKey
      })

      // Save to storage
      const state = getDocumentState(doc)
      await storage.setDocument(id, {
        id,
        content: state,
        metadata: { created: Date.now(), updated: Date.now(), type: options.type, workspace: options.workspace },
        version: 1
      })

      // Add to cache and search index
      documentCache.set(id, doc)
      searchIndex.add(doc)

      return doc
    },

    async getDocument(id: string): Promise<XDocument | null> {
      // Check cache
      if (documentCache.has(id)) {
        return documentCache.get(id)!
      }

      // Load from storage
      const stored = await storage.getDocument(id)
      if (!stored) return null

      const doc = loadDocument(id, stored.metadata.workspace ?? '', stored.metadata.type as DocumentType, stored.content)
      documentCache.set(id, doc)
      searchIndex.add(doc)

      return doc
    },

    async deleteDocument(id: string): Promise<void> {
      await storage.deleteDocument(id)
      documentCache.delete(id)
      searchIndex.remove(id)
    },

    async listDocuments(workspace?: string): Promise<string[]> {
      return storage.listDocuments(workspace)
    },

    async query<T>(query: Query): Promise<QueryResult<T>> {
      return queryEngine.query<T>(query)
    },

    async search(text: string, limit = 20) {
      const results = searchIndex.search({ text, limit })
      return results.map(r => ({ id: r.id, title: r.title, score: r.score }))
    },

    async connectToPeer(multiaddr: string): Promise<void> {
      if (!networkNode) throw new Error('Network not enabled')
      // Would connect to peer
    },

    on(event: string, handler: Function): () => void {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set())
      }
      eventHandlers.get(event)!.add(handler)
      return () => eventHandlers.get(event)?.delete(handler)
    }
  }

  function emit(event: string, ...args: unknown[]) {
    eventHandlers.get(event)?.forEach(h => h(...args))
  }

  function generateId(): string {
    return Math.random().toString(36).substring(2, 15)
  }

  return client
}
```

### Tests (client.test.ts)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createXNetClient, type XNetClient } from './client'
import { MemoryAdapter } from '@xnet/storage'

describe('XNetClient', () => {
  let client: XNetClient

  beforeEach(async () => {
    client = await createXNetClient({
      storage: new MemoryAdapter(),
      enableNetwork: false
    })
  })

  afterEach(async () => {
    await client.stop()
  })

  it('should create client with identity', () => {
    expect(client.identity).toBeDefined()
    expect(client.identity.did).toMatch(/^did:key:z/)
  })

  it('should create and get document', async () => {
    const doc = await client.createDocument({
      workspace: 'test-ws',
      type: 'page',
      title: 'Test Page'
    })

    expect(doc.id).toContain('test-ws/')
    expect(doc.metadata.title).toBe('Test Page')

    const retrieved = await client.getDocument(doc.id)
    expect(retrieved?.id).toBe(doc.id)
  })

  it('should list documents', async () => {
    await client.createDocument({ workspace: 'ws1', type: 'page', title: 'Doc 1' })
    await client.createDocument({ workspace: 'ws1', type: 'page', title: 'Doc 2' })
    await client.createDocument({ workspace: 'ws2', type: 'page', title: 'Doc 3' })

    const ws1Docs = await client.listDocuments('ws1/')
    expect(ws1Docs).toHaveLength(2)

    const allDocs = await client.listDocuments()
    expect(allDocs).toHaveLength(3)
  })

  it('should delete document', async () => {
    const doc = await client.createDocument({
      workspace: 'test',
      type: 'page',
      title: 'To Delete'
    })

    await client.deleteDocument(doc.id)
    const retrieved = await client.getDocument(doc.id)
    expect(retrieved).toBeNull()
  })

  it('should search documents', async () => {
    await client.createDocument({ workspace: 'test', type: 'page', title: 'Meeting Notes' })
    await client.createDocument({ workspace: 'test', type: 'page', title: 'Project Plan' })

    const results = await client.search('meeting')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toBe('Meeting Notes')
  })
})
```

### Browser Preset (presets/browser.ts)

```typescript
import { createXNetClient, type XNetClientConfig, type XNetClient } from '../client'
import { IndexedDBAdapter } from '@xnet/storage'

export async function createBrowserClient(
  config: Partial<XNetClientConfig> = {}
): Promise<XNetClient> {
  return createXNetClient({
    storage: new IndexedDBAdapter(),
    enableNetwork: true,
    ...config
  })
}
```

### Public Exports (index.ts)

```typescript
// Main client
export { createXNetClient, type XNetClient, type XNetClientConfig } from './client'

// Presets
export { createBrowserClient } from './presets/browser'

// Re-export commonly used types and functions
export type { Identity, KeyBundle } from '@xnet/identity'
export type { XDocument, DocumentType, Block, BlockType } from '@xnet/data'
export type { Query, QueryResult, SearchResult } from '@xnet/query'
export type { StorageAdapter } from '@xnet/storage'
export type { NetworkConfig, ConnectionStatus } from '@xnet/network'

// Re-export React integration
export * from '@xnet/react'
```

## Usage Example

```typescript
import { createBrowserClient } from '@xnet/sdk'

async function main() {
  // Create client
  const client = await createBrowserClient()

  // Create a document
  const doc = await client.createDocument({
    workspace: 'my-workspace',
    type: 'page',
    title: 'Getting Started'
  })

  console.log('Created:', doc.id)

  // Search documents
  const results = await client.search('getting')
  console.log('Found:', results)

  // Query documents
  const pages = await client.query({
    type: 'page',
    filters: [{ field: 'workspace', operator: 'eq', value: 'my-workspace' }]
  })
  console.log('Pages:', pages.items)

  // Clean up
  await client.stop()
}
```

## Validation Checklist

- [ ] Client initializes with default config
- [ ] Client initializes with custom storage
- [ ] Document CRUD operations work
- [ ] Search works
- [ ] Query works
- [ ] Events fire correctly
- [ ] All tests pass

## Next Step

Proceed to [10-platform-electron.md](./10-platform-electron.md)
