# 04: @xnetjs/storage

> IndexedDB, SQLite adapters, snapshots, and persistence

**Duration:** 2 weeks
**Dependencies:** @xnetjs/crypto, @xnetjs/core (Phase 0)

## Overview

This package provides storage adapters for different platforms and implements snapshot-based persistence.

## Package Setup

```bash
cd packages/storage
pnpm add idb comlink
pnpm add -D vitest typescript tsup fake-indexeddb
pnpm add @xnetjs/crypto@workspace:* @xnetjs/core@workspace:*
```

## Directory Structure

```
packages/storage/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Public exports
│   ├── types.ts              # Storage interfaces
│   ├── adapters/
│   │   ├── indexeddb.ts      # Browser IndexedDB
│   │   ├── indexeddb.test.ts
│   │   ├── sqlite.ts         # Native SQLite (stub)
│   │   └── memory.ts         # In-memory (testing)
│   ├── snapshots/
│   │   ├── manager.ts        # Snapshot creation/loading
│   │   ├── manager.test.ts
│   │   └── compaction.ts     # Storage compaction
│   └── blobs/
│       ├── store.ts          # Blob storage
│       └── store.test.ts
└── README.md
```

## Implementation

### Types (types.ts)

```typescript
import type { ContentId, Snapshot, SignedUpdate } from '@xnetjs/core'

export interface StorageAdapter {
  // Document operations
  getDocument(id: string): Promise<DocumentData | null>
  setDocument(id: string, data: DocumentData): Promise<void>
  deleteDocument(id: string): Promise<void>
  listDocuments(prefix?: string): Promise<string[]>

  // Update log
  appendUpdate(docId: string, update: SignedUpdate): Promise<void>
  getUpdates(docId: string, since?: string): Promise<SignedUpdate[]>
  getUpdateCount(docId: string): Promise<number>

  // Snapshots
  getSnapshot(docId: string): Promise<Snapshot | null>
  setSnapshot(docId: string, snapshot: Snapshot): Promise<void>

  // Blobs
  getBlob(cid: ContentId): Promise<Uint8Array | null>
  setBlob(cid: ContentId, data: Uint8Array): Promise<void>
  hasBlob(cid: ContentId): Promise<boolean>

  // Lifecycle
  open(): Promise<void>
  close(): Promise<void>
  clear(): Promise<void>
}

export interface DocumentData {
  id: string
  content: Uint8Array
  metadata: DocumentMetadata
  version: number
}

export interface DocumentMetadata {
  created: number
  updated: number
  type: string
  workspace?: string
}

export interface StorageStats {
  documentCount: number
  totalSize: number
  snapshotCount: number
  updateCount: number
}
```

### IndexedDB Adapter (adapters/indexeddb.ts)

```typescript
import { openDB, type IDBPDatabase } from 'idb'
import type { StorageAdapter, DocumentData, DocumentMetadata } from '../types'
import type { ContentId, Snapshot, SignedUpdate } from '@xnetjs/core'

const DB_NAME = 'xnet-storage'
const DB_VERSION = 1

interface XNetDB {
  documents: DocumentData
  updates: { docId: string; updateHash: string; update: SignedUpdate }
  snapshots: { docId: string; snapshot: Snapshot }
  blobs: { cid: string; data: Uint8Array }
}

export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBPDatabase<XNetDB> | null = null

  async open(): Promise<void> {
    this.db = await openDB<XNetDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Documents store
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' })
        }

        // Updates store
        if (!db.objectStoreNames.contains('updates')) {
          const store = db.createObjectStore('updates', { keyPath: ['docId', 'updateHash'] })
          store.createIndex('byDoc', 'docId')
        }

        // Snapshots store
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'docId' })
        }

        // Blobs store
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'cid' })
        }
      }
    })
  }

  async close(): Promise<void> {
    this.db?.close()
    this.db = null
  }

  async clear(): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    const tx = this.db.transaction(['documents', 'updates', 'snapshots', 'blobs'], 'readwrite')
    await Promise.all([
      tx.objectStore('documents').clear(),
      tx.objectStore('updates').clear(),
      tx.objectStore('snapshots').clear(),
      tx.objectStore('blobs').clear(),
      tx.done
    ])
  }

  // Document operations
  async getDocument(id: string): Promise<DocumentData | null> {
    if (!this.db) throw new Error('Database not open')
    return (await this.db.get('documents', id)) ?? null
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.put('documents', data)
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.delete('documents', id)
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    if (!this.db) throw new Error('Database not open')
    const all = await this.db.getAllKeys('documents')
    if (!prefix) return all
    return all.filter((id) => id.startsWith(prefix))
  }

  // Update operations
  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.add('updates', { docId, updateHash: update.updateHash, update })
  }

  async getUpdates(docId: string, _since?: string): Promise<SignedUpdate[]> {
    if (!this.db) throw new Error('Database not open')
    const all = await this.db.getAllFromIndex('updates', 'byDoc', docId)
    return all.map((row) => row.update)
  }

  async getUpdateCount(docId: string): Promise<number> {
    if (!this.db) throw new Error('Database not open')
    return this.db.countFromIndex('updates', 'byDoc', docId)
  }

  // Snapshot operations
  async getSnapshot(docId: string): Promise<Snapshot | null> {
    if (!this.db) throw new Error('Database not open')
    const row = await this.db.get('snapshots', docId)
    return row?.snapshot ?? null
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.put('snapshots', { docId, snapshot })
  }

  // Blob operations
  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    if (!this.db) throw new Error('Database not open')
    const row = await this.db.get('blobs', cid)
    return row?.data ?? null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    if (!this.db) throw new Error('Database not open')
    await this.db.put('blobs', { cid, data })
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    if (!this.db) throw new Error('Database not open')
    const count = await this.db.count('blobs', cid)
    return count > 0
  }
}
```

### Tests (adapters/indexeddb.test.ts)

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IndexedDBAdapter } from './indexeddb'

describe('IndexedDBAdapter', () => {
  let adapter: IndexedDBAdapter

  beforeEach(async () => {
    adapter = new IndexedDBAdapter()
    await adapter.open()
  })

  afterEach(async () => {
    await adapter.clear()
    await adapter.close()
  })

  it('should store and retrieve document', async () => {
    const doc = {
      id: 'doc-1',
      content: new Uint8Array([1, 2, 3]),
      metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
      version: 1
    }
    await adapter.setDocument('doc-1', doc)
    const retrieved = await adapter.getDocument('doc-1')
    expect(retrieved?.id).toBe('doc-1')
  })

  it('should list documents with prefix', async () => {
    await adapter.setDocument('workspace/doc-1', {
      id: 'workspace/doc-1',
      content: new Uint8Array(),
      metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
      version: 1
    })
    await adapter.setDocument('workspace/doc-2', {
      id: 'workspace/doc-2',
      content: new Uint8Array(),
      metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
      version: 1
    })
    await adapter.setDocument('other/doc-3', {
      id: 'other/doc-3',
      content: new Uint8Array(),
      metadata: { created: Date.now(), updated: Date.now(), type: 'page' },
      version: 1
    })

    const docs = await adapter.listDocuments('workspace/')
    expect(docs).toHaveLength(2)
  })

  it('should store and retrieve blob by CID', async () => {
    const cid = 'cid:blake3:abc123' as const
    const data = new Uint8Array([1, 2, 3, 4, 5])
    await adapter.setBlob(cid, data)
    const retrieved = await adapter.getBlob(cid)
    expect(retrieved).toEqual(data)
  })
})
```

### Memory Adapter (adapters/memory.ts)

```typescript
import type { StorageAdapter, DocumentData } from '../types'
import type { ContentId, Snapshot, SignedUpdate } from '@xnetjs/core'

/**
 * In-memory storage for testing
 */
export class MemoryAdapter implements StorageAdapter {
  private documents = new Map<string, DocumentData>()
  private updates = new Map<string, SignedUpdate[]>()
  private snapshots = new Map<string, Snapshot>()
  private blobs = new Map<string, Uint8Array>()

  async open(): Promise<void> {}
  async close(): Promise<void> {}

  async clear(): Promise<void> {
    this.documents.clear()
    this.updates.clear()
    this.snapshots.clear()
    this.blobs.clear()
  }

  async getDocument(id: string): Promise<DocumentData | null> {
    return this.documents.get(id) ?? null
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    this.documents.set(id, data)
  }

  async deleteDocument(id: string): Promise<void> {
    this.documents.delete(id)
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    const ids = Array.from(this.documents.keys())
    if (!prefix) return ids
    return ids.filter((id) => id.startsWith(prefix))
  }

  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    const list = this.updates.get(docId) ?? []
    list.push(update)
    this.updates.set(docId, list)
  }

  async getUpdates(docId: string): Promise<SignedUpdate[]> {
    return this.updates.get(docId) ?? []
  }

  async getUpdateCount(docId: string): Promise<number> {
    return (this.updates.get(docId) ?? []).length
  }

  async getSnapshot(docId: string): Promise<Snapshot | null> {
    return this.snapshots.get(docId) ?? null
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    this.snapshots.set(docId, snapshot)
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    return this.blobs.get(cid) ?? null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    this.blobs.set(cid, data)
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    return this.blobs.has(cid)
  }
}
```

### Snapshot Manager (snapshots/manager.ts)

```typescript
import type { StorageAdapter } from '../types'
import type { Snapshot, SignedUpdate, SnapshotTriggers } from '@xnetjs/core'
import { shouldCreateSnapshot } from '@xnetjs/core'
import { sign } from '@xnetjs/crypto'
import pako from 'pako'

export interface SnapshotManagerOptions {
  adapter: StorageAdapter
  triggers: SnapshotTriggers
  signingKey: Uint8Array
  creatorDID: string
}

export class SnapshotManager {
  private adapter: StorageAdapter
  private triggers: SnapshotTriggers
  private signingKey: Uint8Array
  private creatorDID: string
  private lastSnapshotTime = new Map<string, number>()

  constructor(options: SnapshotManagerOptions) {
    this.adapter = options.adapter
    this.triggers = options.triggers
    this.signingKey = options.signingKey
    this.creatorDID = options.creatorDID
  }

  /**
   * Load document with snapshot + updates since
   */
  async loadDocument(docId: string): Promise<{
    snapshot: Snapshot | null
    updates: SignedUpdate[]
  }> {
    const snapshot = await this.adapter.getSnapshot(docId)
    const updates = await this.adapter.getUpdates(docId)
    return { snapshot, updates }
  }

  /**
   * Check if snapshot should be created
   */
  async shouldSnapshot(docId: string): Promise<boolean> {
    const updateCount = await this.adapter.getUpdateCount(docId)
    const lastTime = this.lastSnapshotTime.get(docId) ?? 0
    // Estimate storage - simplified
    return shouldCreateSnapshot(updateCount, lastTime, 0, 100, this.triggers)
  }

  /**
   * Create snapshot of current state
   */
  async createSnapshot(docId: string, state: Uint8Array): Promise<Snapshot> {
    const compressed = pako.deflate(state)
    const stateVector = new Uint8Array(0) // Would be actual state vector

    const snapshotData = {
      id: `${docId}-${Date.now()}`,
      documentId: docId,
      stateVector,
      compressedState: compressed,
      timestamp: Date.now(),
      creatorDID: this.creatorDID
    }

    const dataToSign = new TextEncoder().encode(
      JSON.stringify({
        id: snapshotData.id,
        documentId: snapshotData.documentId,
        timestamp: snapshotData.timestamp
      })
    )
    const signature = sign(dataToSign, this.signingKey)

    const snapshot: Snapshot = {
      ...snapshotData,
      signature,
      contentId: `cid:blake3:${Date.now()}` as const // Would be actual CID
    }

    await this.adapter.setSnapshot(docId, snapshot)
    this.lastSnapshotTime.set(docId, Date.now())

    return snapshot
  }

  /**
   * Decompress snapshot state
   */
  decompressState(snapshot: Snapshot): Uint8Array {
    return pako.inflate(snapshot.compressedState)
  }
}
```

### Public Exports (index.ts)

```typescript
// Types
export type { StorageAdapter, DocumentData, DocumentMetadata, StorageStats } from './types'

// Adapters
export { IndexedDBAdapter } from './adapters/indexeddb'
export { MemoryAdapter } from './adapters/memory'
// export { SQLiteAdapter } from './adapters/sqlite' // Native only

// Snapshot management
export { SnapshotManager, type SnapshotManagerOptions } from './snapshots/manager'
```

## Validation Checklist

- [ ] IndexedDB adapter passes all CRUD tests
- [ ] Memory adapter works for testing
- [ ] Snapshot creation compresses state
- [ ] Snapshot loading decompresses state
- [ ] Document loads in <100ms with snapshot + 1k updates
- [ ] All tests pass with >80% coverage

## Next Step

Proceed to [05-xnet-data.md](./05-xnet-data.md)
