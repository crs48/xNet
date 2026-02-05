/**
 * IndexedDB storage adapter for NodeStore.
 *
 * Persistent storage for browser environments using IndexedDB.
 */

import type {
  NodeId,
  NodeChange,
  NodeState,
  NodeStorageAdapter,
  ListNodesOptions,
  CountNodesOptions
} from './types'
import type { ContentId } from '@xnet/core'
import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'xnet-nodes'
const DB_VERSION = 3

interface NodeDB {
  nodes: NodeState
  changes: NodeChange & { nodeId: NodeId }
  documentContent: { nodeId: NodeId; content: Uint8Array }
  meta: { key: string; value: unknown }
  yjsSnapshots: {
    nodeId: NodeId
    timestamp: number
    snapshot: Uint8Array
    docState: Uint8Array
    byteSize: number
  }
}

export interface IndexedDBNodeStorageAdapterOptions {
  /** Custom database name (default: 'xnet-nodes') */
  dbName?: string
}

/**
 * IndexedDB-based storage adapter for NodeStore.
 *
 * Provides persistent storage for:
 * - Nodes (materialized state)
 * - Changes (event log for sync)
 * - Document content (Y.Doc binary state)
 * - Metadata (Lamport time, etc.)
 *
 * @example
 * ```typescript
 * const adapter = new IndexedDBNodeStorageAdapter()
 * await adapter.open()
 *
 * const store = new NodeStore({
 *   storage: adapter,
 *   authorDID: 'did:key:...',
 *   signingKey: privateKey
 * })
 * ```
 */
export class IndexedDBNodeStorageAdapter implements NodeStorageAdapter {
  private db: IDBPDatabase<NodeDB> | null = null
  private dbName: string

  constructor(options?: IndexedDBNodeStorageAdapterOptions) {
    this.dbName = options?.dbName ?? DB_NAME
  }

  /**
   * Open the database connection.
   * Must be called before using the adapter.
   */
  async open(): Promise<void> {
    this.db = await openDB<NodeDB>(this.dbName, DB_VERSION, {
      upgrade(db: IDBPDatabase<NodeDB>) {
        // Nodes store - materialized state
        if (!db.objectStoreNames.contains('nodes')) {
          const store = db.createObjectStore('nodes', { keyPath: 'id' })
          store.createIndex('bySchema', 'schemaId')
          store.createIndex('byCreatedAt', 'createdAt')
        }

        // Changes store - event log
        if (!db.objectStoreNames.contains('changes')) {
          const store = db.createObjectStore('changes', { keyPath: 'hash' })
          store.createIndex('byNodeId', 'payload.nodeId')
          store.createIndex('byLamport', 'lamport.time')
        }

        // Document content store - Y.Doc state
        if (!db.objectStoreNames.contains('documentContent')) {
          db.createObjectStore('documentContent', { keyPath: 'nodeId' })
        }

        // Meta store - sync state, etc.
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' })
        }

        // Yjs snapshot store - for document time travel
        if (!db.objectStoreNames.contains('yjsSnapshots')) {
          const store = db.createObjectStore('yjsSnapshots', {
            autoIncrement: true
          })
          store.createIndex('byNodeId', 'nodeId')
          store.createIndex('byNodeIdTimestamp', ['nodeId', 'timestamp'])
        }
      }
    })
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    this.db?.close()
    this.db = null
  }

  private ensureOpen(): IDBPDatabase<NodeDB> {
    if (!this.db) {
      throw new Error('IndexedDBNodeStorageAdapter: Database not open. Call open() first.')
    }
    return this.db
  }

  // ==========================================================================
  // Change Log Operations
  // ==========================================================================

  async appendChange(change: NodeChange): Promise<void> {
    const db = this.ensureOpen()
    // Use put() instead of add() to handle duplicate changes gracefully
    // (same change may be received multiple times during sync)
    await db.put('changes', change as NodeChange & { nodeId: NodeId })
  }

  async getChanges(nodeId: NodeId): Promise<NodeChange[]> {
    const db = this.ensureOpen()
    const changes = await db.getAllFromIndex('changes', 'byNodeId', nodeId)
    // Sort by Lamport time
    return changes.sort((a, b) => a.lamport.time - b.lamport.time)
  }

  async getAllChanges(): Promise<NodeChange[]> {
    const db = this.ensureOpen()
    const changes = await db.getAll('changes')
    // Sort by Lamport time for consistent ordering
    return changes.sort((a, b) => a.lamport.time - b.lamport.time)
  }

  async getChangesSince(sinceLamport: number): Promise<NodeChange[]> {
    const db = this.ensureOpen()
    const range = IDBKeyRange.lowerBound(sinceLamport, true)
    const changes = await db.getAllFromIndex('changes', 'byLamport', range)
    return changes.sort((a, b) => a.lamport.time - b.lamport.time)
  }

  async getChangeByHash(hash: ContentId): Promise<NodeChange | null> {
    const db = this.ensureOpen()
    return (await db.get('changes', hash)) ?? null
  }

  async getLastChange(nodeId: NodeId): Promise<NodeChange | null> {
    const db = this.ensureOpen()
    const changes = await db.getAllFromIndex('changes', 'byNodeId', nodeId)
    if (changes.length === 0) return null
    // Sort by Lamport time and return the latest
    changes.sort((a, b) => b.lamport.time - a.lamport.time)
    return changes[0]
  }

  // ==========================================================================
  // Materialized State Operations
  // ==========================================================================

  async getNode(id: NodeId): Promise<NodeState | null> {
    const db = this.ensureOpen()
    return (await db.get('nodes', id)) ?? null
  }

  async setNode(node: NodeState): Promise<void> {
    const db = this.ensureOpen()
    await db.put('nodes', node)
  }

  async deleteNode(id: NodeId): Promise<void> {
    const db = this.ensureOpen()

    // Get all change hashes for this node first
    const changes = await db.getAllFromIndex('changes', 'byNodeId', id)
    const changeHashes = changes.map((c) => c.hash)

    // Delete in a transaction
    const tx = db.transaction(['nodes', 'changes', 'documentContent'], 'readwrite')
    await tx.objectStore('nodes').delete(id)
    await tx.objectStore('documentContent').delete(id)

    // Delete all changes for this node
    for (const hash of changeHashes) {
      await tx.objectStore('changes').delete(hash)
    }

    await tx.done
  }

  async listNodes(options?: ListNodesOptions): Promise<NodeState[]> {
    const db = this.ensureOpen()

    let nodes: NodeState[]

    // Use index if filtering by schema
    if (options?.schemaId) {
      nodes = await db.getAllFromIndex('nodes', 'bySchema', options.schemaId)
    } else {
      nodes = await db.getAll('nodes')
    }

    // Filter deleted
    if (!options?.includeDeleted) {
      nodes = nodes.filter((n) => !n.deleted)
    }

    // Sort by creation time (newest first)
    nodes.sort((a, b) => b.createdAt - a.createdAt)

    // Pagination
    const offset = options?.offset ?? 0
    const limit = options?.limit ?? nodes.length

    return nodes.slice(offset, offset + limit)
  }

  async countNodes(options?: CountNodesOptions): Promise<number> {
    const db = this.ensureOpen()

    let nodes: NodeState[]

    if (options?.schemaId) {
      nodes = await db.getAllFromIndex('nodes', 'bySchema', options.schemaId)
    } else {
      nodes = await db.getAll('nodes')
    }

    // Filter deleted
    if (!options?.includeDeleted) {
      nodes = nodes.filter((n) => !n.deleted)
    }

    return nodes.length
  }

  // ==========================================================================
  // Sync State
  // ==========================================================================

  async getLastLamportTime(): Promise<number> {
    const db = this.ensureOpen()
    const row = await db.get('meta', 'lastLamportTime')
    return (row?.value as number) ?? 0
  }

  async setLastLamportTime(time: number): Promise<void> {
    const db = this.ensureOpen()
    const current = await this.getLastLamportTime()
    if (time > current) {
      await db.put('meta', { key: 'lastLamportTime', value: time })
    }
  }

  // ==========================================================================
  // Document Content Operations (for nodes with CRDT document)
  // ==========================================================================

  async getDocumentContent(nodeId: NodeId): Promise<Uint8Array | null> {
    const db = this.ensureOpen()
    const row = await db.get('documentContent', nodeId)
    return row?.content ?? null
  }

  async setDocumentContent(nodeId: NodeId, content: Uint8Array): Promise<void> {
    const db = this.ensureOpen()
    await db.put('documentContent', { nodeId, content })
  }

  // ==========================================================================
  // Yjs Snapshot Operations (for document time travel)
  // ==========================================================================

  async saveYjsSnapshot(snapshot: {
    nodeId: NodeId
    timestamp: number
    snapshot: Uint8Array
    docState: Uint8Array
    byteSize: number
  }): Promise<void> {
    const db = this.ensureOpen()
    await db.add('yjsSnapshots', snapshot)
  }

  async getYjsSnapshots(nodeId: NodeId): Promise<
    {
      nodeId: NodeId
      timestamp: number
      snapshot: Uint8Array
      docState: Uint8Array
      byteSize: number
    }[]
  > {
    const db = this.ensureOpen()
    const results = await db.getAllFromIndex('yjsSnapshots', 'byNodeId', nodeId)
    return results.sort((a, b) => a.timestamp - b.timestamp)
  }

  async deleteYjsSnapshots(nodeId: NodeId): Promise<void> {
    const db = this.ensureOpen()
    const tx = db.transaction('yjsSnapshots', 'readwrite')
    const index = tx.store.index('byNodeId')
    let cursor = await index.openCursor(nodeId)
    while (cursor) {
      cursor.delete()
      cursor = await cursor.continue()
    }
    await tx.done
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Clear all data (for testing or reset).
   */
  async clear(): Promise<void> {
    const db = this.ensureOpen()
    const storeNames = Array.from(db.objectStoreNames) as (keyof NodeDB)[]
    const tx = db.transaction(storeNames, 'readwrite')
    await Promise.all([...storeNames.map((name) => tx.objectStore(name).clear()), tx.done])
  }
}
