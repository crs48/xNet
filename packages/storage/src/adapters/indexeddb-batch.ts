/**
 * IndexedDB Batch Transaction Writer
 *
 * Extends IndexedDBAdapter to batch multiple writes into single transactions.
 * This significantly improves write performance by:
 * 1. Reducing transaction overhead (commit/sync costs)
 * 2. Allowing IndexedDB to optimize multiple writes together
 * 3. Reducing IPC round-trips in web workers
 *
 * @deprecated Use `SQLiteStorageAdapter` from `./sqlite` instead.
 * This adapter will be removed in a future version.
 * See: docs/plans/plan03_9_5IndexedDBToSQLite/
 */

import type { StorageAdapter, DocumentData } from '../types'
import type { ContentId, Snapshot, SignedUpdate } from '@xnet/core'
import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'xnet-storage'
const DB_VERSION = 1

interface XNetDB {
  documents: DocumentData
  updates: { docId: string; updateHash: string; update: SignedUpdate }
  snapshots: { docId: string; snapshot: Snapshot }
  blobs: { cid: string; data: Uint8Array }
}

type StoreNames = 'documents' | 'updates' | 'snapshots' | 'blobs'

// ─── Operation Types ─────────────────────────────────────────────────────────

type WriteOperation =
  | { store: 'documents'; op: 'put'; data: DocumentData }
  | { store: 'documents'; op: 'delete'; key: string }
  | {
      store: 'updates'
      op: 'put'
      data: { docId: string; updateHash: string; update: SignedUpdate }
    }
  | { store: 'snapshots'; op: 'put'; data: { docId: string; snapshot: Snapshot } }
  | { store: 'blobs'; op: 'put'; data: { cid: string; data: Uint8Array } }

interface BatchOptions {
  /** Maximum operations before auto-flush (default: 100) */
  maxBatchSize?: number
  /** Maximum time in ms before auto-flush (default: 16ms - one frame) */
  maxWaitMs?: number
  /** Enable debug logging */
  debug?: boolean
}

// ─── IndexedDB Batch Adapter ─────────────────────────────────────────────────

/**
 * IndexedDB adapter with batched write transactions.
 *
 * Collects write operations and flushes them in a single transaction
 * for better performance. Reads check pending writes first.
 */
export class IndexedDBBatchAdapter implements StorageAdapter {
  private db: IDBPDatabase<XNetDB> | null = null
  private pending: WriteOperation[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushPromise: Promise<void> | null = null
  private maxBatchSize: number
  private maxWaitMs: number
  private debug: boolean

  // In-memory write-through cache for reads during pending writes
  private pendingDocuments = new Map<string, DocumentData | null>()
  private pendingSnapshots = new Map<string, Snapshot>()
  private pendingBlobs = new Map<string, Uint8Array>()
  private pendingUpdates = new Map<string, SignedUpdate[]>() // docId -> updates

  constructor(options: BatchOptions = {}) {
    this.maxBatchSize = options.maxBatchSize ?? 100
    this.maxWaitMs = options.maxWaitMs ?? 16
    this.debug = options.debug ?? false
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[IndexedDBBatch]', ...args)
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async open(): Promise<void> {
    this.db = await openDB<XNetDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('updates')) {
          const store = db.createObjectStore('updates', { keyPath: ['docId', 'updateHash'] })
          store.createIndex('byDoc', 'docId')
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots', { keyPath: 'docId' })
        }
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs', { keyPath: 'cid' })
        }
      }
    })
  }

  async close(): Promise<void> {
    await this.flush()
    this.db?.close()
    this.db = null
    this.clearPendingCache()
  }

  async clear(): Promise<void> {
    await this.flush()
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

  // ─── Document Operations ───────────────────────────────────────────────────

  async getDocument(id: string): Promise<DocumentData | null> {
    // Check pending cache first
    if (this.pendingDocuments.has(id)) {
      return this.pendingDocuments.get(id) ?? null
    }
    if (!this.db) throw new Error('Database not open')
    return (await this.db.get('documents', id)) ?? null
  }

  async setDocument(id: string, data: DocumentData): Promise<void> {
    this.pendingDocuments.set(id, data)
    this.pending.push({ store: 'documents', op: 'put', data })
    this.scheduleFlush()
  }

  async deleteDocument(id: string): Promise<void> {
    this.pendingDocuments.set(id, null) // Mark as deleted
    this.pending.push({ store: 'documents', op: 'delete', key: id })
    this.scheduleFlush()
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    await this.flush() // Ensure consistent read
    if (!this.db) throw new Error('Database not open')

    const all = await this.db.getAllKeys('documents')
    if (!prefix) return all as string[]
    return (all as string[]).filter((id) => id.startsWith(prefix))
  }

  // ─── Update Operations ─────────────────────────────────────────────────────

  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    // Add to pending updates cache
    const existing = this.pendingUpdates.get(docId) ?? []
    // Dedupe by hash
    if (!existing.some((u) => u.updateHash === update.updateHash)) {
      existing.push(update)
      this.pendingUpdates.set(docId, existing)
      this.pending.push({
        store: 'updates',
        op: 'put',
        data: { docId, updateHash: update.updateHash, update }
      })
      this.scheduleFlush()
    }
  }

  async getUpdates(docId: string, _since?: string): Promise<SignedUpdate[]> {
    if (!this.db) throw new Error('Database not open')

    // Get persisted updates
    const all = await this.db.getAllFromIndex('updates', 'byDoc', docId)
    const updates = all.map((row) => row.update)

    // Merge with pending updates
    const pending = this.pendingUpdates.get(docId) ?? []
    const seenHashes = new Set(updates.map((u) => u.updateHash))
    for (const u of pending) {
      if (!seenHashes.has(u.updateHash)) {
        updates.push(u)
      }
    }

    return updates
  }

  async getUpdateCount(docId: string): Promise<number> {
    if (!this.db) throw new Error('Database not open')

    const persisted = await this.db.countFromIndex('updates', 'byDoc', docId)
    const pending = this.pendingUpdates.get(docId)?.length ?? 0

    // Note: This may slightly overcount if pending contains duplicates of persisted
    // But it's an approximate count used for compaction decisions, so acceptable
    return persisted + pending
  }

  // ─── Snapshot Operations ───────────────────────────────────────────────────

  async getSnapshot(docId: string): Promise<Snapshot | null> {
    // Check pending cache
    if (this.pendingSnapshots.has(docId)) {
      return this.pendingSnapshots.get(docId) ?? null
    }
    if (!this.db) throw new Error('Database not open')

    const row = await this.db.get('snapshots', docId)
    return row?.snapshot ?? null
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    this.pendingSnapshots.set(docId, snapshot)
    this.pending.push({ store: 'snapshots', op: 'put', data: { docId, snapshot } })
    this.scheduleFlush()
  }

  // ─── Blob Operations ───────────────────────────────────────────────────────

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    // Check pending cache
    if (this.pendingBlobs.has(cid)) {
      return this.pendingBlobs.get(cid) ?? null
    }
    if (!this.db) throw new Error('Database not open')

    const row = await this.db.get('blobs', cid)
    return row?.data ?? null
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    // Dedupe
    if (!this.pendingBlobs.has(cid)) {
      this.pendingBlobs.set(cid, data)
      this.pending.push({ store: 'blobs', op: 'put', data: { cid, data } })
      this.scheduleFlush()
    }
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    if (this.pendingBlobs.has(cid)) return true
    if (!this.db) throw new Error('Database not open')

    const count = await this.db.count('blobs', cid)
    return count > 0
  }

  // ─── Flush Logic ───────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.pending.length >= this.maxBatchSize) {
      this.flush()
      return
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        this.flush()
      }, this.maxWaitMs)
    }
  }

  /**
   * Flush all pending operations in a single transaction.
   */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    // Wait for any in-progress flush
    if (this.flushPromise) {
      await this.flushPromise
    }

    if (this.pending.length === 0) {
      return
    }

    const operations = this.pending
    this.pending = []

    this.log('Flushing', operations.length, 'operations in single transaction')

    this.flushPromise = this.executeFlush(operations)
    try {
      await this.flushPromise
      // Clear pending cache after successful flush
      this.clearPendingCache()
    } catch (err) {
      // On error, restore operations to pending
      this.pending = [...operations, ...this.pending]
      throw err
    } finally {
      this.flushPromise = null
    }
  }

  private async executeFlush(operations: WriteOperation[]): Promise<void> {
    if (!this.db) throw new Error('Database not open')

    // Determine which stores we need
    const stores = new Set<StoreNames>()
    for (const op of operations) {
      stores.add(op.store)
    }

    // Create single transaction for all stores
    const tx = this.db.transaction(Array.from(stores), 'readwrite')

    // Execute all operations
    const promises: Promise<unknown>[] = []

    for (const op of operations) {
      switch (op.store) {
        case 'documents':
          if (op.op === 'put') {
            promises.push(tx.objectStore('documents').put(op.data))
          } else {
            promises.push(tx.objectStore('documents').delete(op.key))
          }
          break

        case 'updates':
          promises.push(tx.objectStore('updates').put(op.data))
          break

        case 'snapshots':
          promises.push(tx.objectStore('snapshots').put(op.data))
          break

        case 'blobs':
          promises.push(tx.objectStore('blobs').put(op.data))
          break
      }
    }

    // Wait for all operations and transaction completion
    await Promise.all([...promises, tx.done])
  }

  private clearPendingCache(): void {
    this.pendingDocuments.clear()
    this.pendingSnapshots.clear()
    this.pendingBlobs.clear()
    this.pendingUpdates.clear()
  }

  // ─── Utility ───────────────────────────────────────────────────────────────

  /**
   * Get the number of pending operations
   */
  get pendingCount(): number {
    return this.pending.length
  }
}

/**
 * Create an IndexedDB adapter with batched writes.
 */
export function createIndexedDBBatchAdapter(options?: BatchOptions): IndexedDBBatchAdapter {
  return new IndexedDBBatchAdapter(options)
}
