/**
 * Batch Writer - Collects storage operations and flushes in batches
 *
 * This reduces the number of IndexedDB transactions by batching multiple
 * operations together. Each operation type is collected separately and
 * flushed when the batch is full or after a timeout.
 */

import type { StorageAdapter, DocumentData } from '../types'
import type { ContentId, Snapshot, SignedUpdate } from '@xnet/core'

// ─── Types ───────────────────────────────────────────────────────────────────

type Operation =
  | { type: 'setDocument'; id: string; data: DocumentData }
  | { type: 'deleteDocument'; id: string }
  | { type: 'appendUpdate'; docId: string; update: SignedUpdate }
  | { type: 'setSnapshot'; docId: string; snapshot: Snapshot }
  | { type: 'setBlob'; cid: ContentId; data: Uint8Array }

interface BatchWriterOptions {
  /** Maximum number of operations before auto-flush (default: 50) */
  maxBatchSize?: number
  /** Maximum time in ms to wait before auto-flush (default: 16ms) */
  maxWaitMs?: number
  /** Enable debug logging */
  debug?: boolean
}

// ─── BatchWriter Class ───────────────────────────────────────────────────────

/**
 * Wraps a StorageAdapter to batch write operations.
 *
 * Read operations pass through immediately to the underlying adapter.
 * Write operations are collected and flushed together for better performance.
 */
export class BatchWriter implements StorageAdapter {
  private adapter: StorageAdapter
  private pending: Operation[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushPromise: Promise<void> | null = null
  private maxBatchSize: number
  private maxWaitMs: number
  private debug: boolean

  constructor(adapter: StorageAdapter, options: BatchWriterOptions = {}) {
    this.adapter = adapter
    this.maxBatchSize = options.maxBatchSize ?? 50
    this.maxWaitMs = options.maxWaitMs ?? 16
    this.debug = options.debug ?? false
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[BatchWriter]', ...args)
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async open(): Promise<void> {
    await this.adapter.open()
  }

  async close(): Promise<void> {
    await this.flush()
    await this.adapter.close()
  }

  async clear(): Promise<void> {
    await this.flush()
    await this.adapter.clear()
  }

  // ─── Read Operations (pass-through) ────────────────────────────────────────

  async getDocument(id: string): Promise<DocumentData | null> {
    // Check pending writes first
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const op = this.pending[i]
      if (op.type === 'setDocument' && op.id === id) {
        return op.data
      }
      if (op.type === 'deleteDocument' && op.id === id) {
        return null
      }
    }
    return this.adapter.getDocument(id)
  }

  async listDocuments(prefix?: string): Promise<string[]> {
    // Flush to ensure consistent read
    await this.flush()
    return this.adapter.listDocuments(prefix)
  }

  async getUpdates(docId: string, since?: string): Promise<SignedUpdate[]> {
    // Get pending updates for this doc
    const pendingUpdates: SignedUpdate[] = []
    for (const op of this.pending) {
      if (op.type === 'appendUpdate' && op.docId === docId) {
        pendingUpdates.push(op.update)
      }
    }

    const persisted = await this.adapter.getUpdates(docId, since)

    // Dedupe by updateHash
    const seen = new Set(persisted.map((u) => u.updateHash))
    for (const u of pendingUpdates) {
      if (!seen.has(u.updateHash)) {
        persisted.push(u)
      }
    }

    return persisted
  }

  async getUpdateCount(docId: string): Promise<number> {
    // Count pending updates for this doc
    let pendingCount = 0
    for (const op of this.pending) {
      if (op.type === 'appendUpdate' && op.docId === docId) {
        pendingCount++
      }
    }
    return (await this.adapter.getUpdateCount(docId)) + pendingCount
  }

  async getSnapshot(docId: string): Promise<Snapshot | null> {
    // Check pending snapshots
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const op = this.pending[i]
      if (op.type === 'setSnapshot' && op.docId === docId) {
        return op.snapshot
      }
    }
    return this.adapter.getSnapshot(docId)
  }

  async getBlob(cid: ContentId): Promise<Uint8Array | null> {
    // Check pending blobs
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const op = this.pending[i]
      if (op.type === 'setBlob' && op.cid === cid) {
        return op.data
      }
    }
    return this.adapter.getBlob(cid)
  }

  async hasBlob(cid: ContentId): Promise<boolean> {
    // Check pending blobs
    for (const op of this.pending) {
      if (op.type === 'setBlob' && op.cid === cid) {
        return true
      }
    }
    return this.adapter.hasBlob(cid)
  }

  // ─── Write Operations (batched) ────────────────────────────────────────────

  async setDocument(id: string, data: DocumentData): Promise<void> {
    // Remove any pending delete for same id
    this.pending = this.pending.filter((op) => !(op.type === 'deleteDocument' && op.id === id))
    // Update or add
    const existing = this.pending.find((op) => op.type === 'setDocument' && op.id === id)
    if (existing && existing.type === 'setDocument') {
      existing.data = data
    } else {
      this.pending.push({ type: 'setDocument', id, data })
    }
    this.scheduleFlush()
  }

  async deleteDocument(id: string): Promise<void> {
    // Remove any pending setDocument for same id
    this.pending = this.pending.filter((op) => !(op.type === 'setDocument' && op.id === id))
    this.pending.push({ type: 'deleteDocument', id })
    this.scheduleFlush()
  }

  async appendUpdate(docId: string, update: SignedUpdate): Promise<void> {
    // Dedupe by updateHash
    const exists = this.pending.some(
      (op) =>
        op.type === 'appendUpdate' &&
        op.docId === docId &&
        op.update.updateHash === update.updateHash
    )
    if (!exists) {
      this.pending.push({ type: 'appendUpdate', docId, update })
    }
    this.scheduleFlush()
  }

  async setSnapshot(docId: string, snapshot: Snapshot): Promise<void> {
    // Replace any pending snapshot for same doc
    this.pending = this.pending.filter((op) => !(op.type === 'setSnapshot' && op.docId === docId))
    this.pending.push({ type: 'setSnapshot', docId, snapshot })
    this.scheduleFlush()
  }

  async setBlob(cid: ContentId, data: Uint8Array): Promise<void> {
    // Dedupe by cid
    const exists = this.pending.some((op) => op.type === 'setBlob' && op.cid === cid)
    if (!exists) {
      this.pending.push({ type: 'setBlob', cid, data })
    }
    this.scheduleFlush()
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
   * Flush all pending operations to storage.
   * Safe to call multiple times - will wait for any in-progress flush.
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

    this.log('Flushing', operations.length, 'operations')

    this.flushPromise = this.executeFlush(operations)
    try {
      await this.flushPromise
    } finally {
      this.flushPromise = null
    }
  }

  private async executeFlush(operations: Operation[]): Promise<void> {
    // Group operations by type for potential optimization
    const setDocuments: Array<{ id: string; data: DocumentData }> = []
    const deleteDocuments: string[] = []
    const appendUpdates: Array<{ docId: string; update: SignedUpdate }> = []
    const setSnapshots: Array<{ docId: string; snapshot: Snapshot }> = []
    const setBlobs: Array<{ cid: ContentId; data: Uint8Array }> = []

    for (const op of operations) {
      switch (op.type) {
        case 'setDocument':
          setDocuments.push({ id: op.id, data: op.data })
          break
        case 'deleteDocument':
          deleteDocuments.push(op.id)
          break
        case 'appendUpdate':
          appendUpdates.push({ docId: op.docId, update: op.update })
          break
        case 'setSnapshot':
          setSnapshots.push({ docId: op.docId, snapshot: op.snapshot })
          break
        case 'setBlob':
          setBlobs.push({ cid: op.cid, data: op.data })
          break
      }
    }

    // Execute all operations
    // The underlying adapter may or may not batch these internally
    // but we've at least reduced the number of JS→native calls
    const promises: Promise<void>[] = []

    for (const { id, data } of setDocuments) {
      promises.push(this.adapter.setDocument(id, data))
    }

    for (const id of deleteDocuments) {
      promises.push(this.adapter.deleteDocument(id))
    }

    for (const { docId, update } of appendUpdates) {
      promises.push(this.adapter.appendUpdate(docId, update))
    }

    for (const { docId, snapshot } of setSnapshots) {
      promises.push(this.adapter.setSnapshot(docId, snapshot))
    }

    for (const { cid, data } of setBlobs) {
      promises.push(this.adapter.setBlob(cid, data))
    }

    await Promise.all(promises)
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
 * Create a BatchWriter that wraps an existing storage adapter.
 */
export function createBatchWriter(
  adapter: StorageAdapter,
  options?: BatchWriterOptions
): BatchWriter {
  return new BatchWriter(adapter, options)
}
