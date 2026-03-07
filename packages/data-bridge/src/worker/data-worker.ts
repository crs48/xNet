/**
 * DataWorker - Web Worker for off-main-thread data operations
 *
 * This worker runs NodeStore and query operations off the main thread.
 * It exposes an API via Comlink that WorkerBridge uses from the main thread.
 *
 * Key responsibilities:
 * - Initialize and manage NodeStore with in-memory storage
 * - Handle query subscriptions and notify on changes
 * - Execute CRUD operations
 * - Manage Y.Doc pool for collaborative editing
 * - Handle sync and crypto (all signing/verification happens here)
 *
 * Note: This worker uses MemoryNodeStorageAdapter for now. In the future,
 * we could integrate with a SharedWorker-based SQLite solution, but the
 * main app already has SQLite storage via @xnetjs/sqlite.
 *
 * Performance optimizations:
 * - Uses Comlink's transfer() for zero-copy ArrayBuffer transfers
 * - Y.Doc updates are transferred (not copied) to main thread when possible
 * - Initial doc state is transferred on acquire for fast loading
 */

import type {
  WorkerConfig,
  SerializedQueryOptions,
  QueryDelta,
  WorkerSubscription,
  DataWorkerAPI,
  WorkerAcquiredDoc
} from './worker-types'
import type { SyncStatus } from '../types'
import type { DID } from '@xnetjs/core'
import {
  NodeStore,
  MemoryNodeStorageAdapter,
  type NodeState,
  type NodeChangeEvent,
  type SchemaIRI,
  type NodeStorageAdapter
} from '@xnetjs/data'
import { expose, proxy, transfer } from 'comlink'
import * as Y from 'yjs'
import {
  applyNodeChangeToQueryResult,
  applyQueryDescriptor,
  createQueryDescriptor,
  matchesQueryDescriptor
} from '../query-descriptor'

// ─── Y.Doc Pool Configuration ────────────────────────────────────────────────

/** Maximum number of Y.Docs to keep in the pool */
const MAX_DOC_POOL_SIZE = 50

/** Minimum time (ms) before an unused doc can be evicted */
const MIN_DOC_AGE_FOR_EVICTION = 60_000 // 60 seconds

// ─── Y.Doc Pool Entry ────────────────────────────────────────────────────────

interface PoolEntry {
  doc: Y.Doc
  refCount: number
  updateHandlers: Set<(update: Uint8Array, origin: string) => void>
  /** Last time this doc was accessed (for LRU eviction) */
  lastAccessed: number
}

// ─── DataWorker Class ────────────────────────────────────────────────────────

class DataWorker implements DataWorkerAPI {
  private store: NodeStore | null = null
  private storage: NodeStorageAdapter | null = null
  private subscriptions = new Map<
    string,
    WorkerSubscription & { onDelta: (delta: QueryDelta) => void }
  >()
  private status: SyncStatus = 'disconnected'
  private statusHandlers = new Set<(status: SyncStatus) => void>()
  private storeUnsubscribe: (() => void) | null = null

  // Y.Doc pool - the "source of truth" for all documents
  private docPool = new Map<string, PoolEntry>()
  // Client ID counter for Y.Doc instances
  private nextClientId = Math.floor(Math.random() * 2147483647)

  async initialize(config: WorkerConfig): Promise<void> {
    // Create in-memory storage adapter
    // Note: This worker uses in-memory storage. Persistent SQLite storage
    // is handled by the main app via @xnetjs/sqlite.
    this.storage = new MemoryNodeStorageAdapter()

    // Create NodeStore
    this.store = new NodeStore({
      storage: this.storage,
      authorDID: config.authorDID as DID,
      signingKey: new Uint8Array(config.signingKey)
    })
    await this.store.initialize()

    // Set up store change listener for subscriptions
    this.storeUnsubscribe = this.store.subscribe((event) => {
      this.handleStoreChange(event)
    })

    this.setStatus('connected')
  }

  async subscribe(
    queryId: string,
    schemaId: string,
    options: SerializedQueryOptions,
    onDelta: (delta: QueryDelta) => void
  ): Promise<NodeState[]> {
    if (!this.store) {
      throw new Error('DataWorker not initialized')
    }

    // Load initial data
    const descriptor = createQueryDescriptor(schemaId as SchemaIRI, options)
    const nodes = await this.loadQuery(descriptor)

    // Store subscription with proxied callback
    this.subscriptions.set(queryId, {
      schemaId: schemaId as SchemaIRI,
      descriptor,
      options,
      lastResult: nodes,
      onDelta: proxy(onDelta)
    })

    return nodes
  }

  async unsubscribe(queryId: string): Promise<void> {
    this.subscriptions.delete(queryId)
  }

  async reloadQuery(queryId: string): Promise<NodeState[]> {
    const sub = this.subscriptions.get(queryId)
    if (!sub) {
      return []
    }

    const reloaded = await this.loadQuery(sub.descriptor)
    sub.lastResult = reloaded
    return reloaded
  }

  async create(schemaId: string, data: Record<string, unknown>, id?: string): Promise<NodeState> {
    if (!this.store) {
      throw new Error('DataWorker not initialized')
    }

    return this.store.create({
      id,
      schemaId: schemaId as SchemaIRI,
      properties: data
    })
  }

  async update(nodeId: string, changes: Record<string, unknown>): Promise<NodeState> {
    if (!this.store) {
      throw new Error('DataWorker not initialized')
    }

    return this.store.update(nodeId, { properties: changes })
  }

  async delete(nodeId: string): Promise<void> {
    if (!this.store) {
      throw new Error('DataWorker not initialized')
    }

    await this.store.delete(nodeId)
  }

  async restore(nodeId: string): Promise<NodeState> {
    if (!this.store) {
      throw new Error('DataWorker not initialized')
    }

    return this.store.restore(nodeId)
  }

  async get(nodeId: string): Promise<NodeState | null> {
    if (!this.store) {
      throw new Error('DataWorker not initialized')
    }

    return this.store.get(nodeId)
  }

  // ─── Document Operations ────────────────────────────────────────────────────

  async acquireDoc(
    nodeId: string,
    onUpdate: (update: Uint8Array, origin: string) => void
  ): Promise<WorkerAcquiredDoc> {
    if (!this.storage) {
      throw new Error('DataWorker not initialized')
    }

    let entry = this.docPool.get(nodeId)

    if (entry) {
      // Update last accessed time
      entry.lastAccessed = Date.now()
    } else {
      // Create new Y.Doc as source of truth
      const doc = new Y.Doc({ guid: nodeId, gc: false })

      // Load persisted state from storage
      const storedContent = await this.storage.getDocumentContent(nodeId)
      if (storedContent && storedContent.length > 0) {
        Y.applyUpdate(doc, storedContent, 'storage')
      }

      entry = {
        doc,
        refCount: 0,
        updateHandlers: new Set(),
        lastAccessed: Date.now()
      }

      // Evict old unused docs if pool is at capacity
      this.evictOldDocs()

      // Set up persistence - save on every update
      doc.on('update', (update: Uint8Array, origin: unknown) => {
        // Persist to storage (fire and forget for performance)
        const content = Y.encodeStateAsUpdate(doc)
        this.storage?.setDocumentContent(nodeId, content).catch((err) => {
          console.error('[DataWorker] Failed to persist doc:', err)
        })

        // Forward remote updates to all registered handlers
        // (but not local updates - those came from the handler's own doc)
        if (origin === 'remote') {
          const handlers = Array.from(entry!.updateHandlers)
          for (let i = 0; i < handlers.length; i++) {
            try {
              // For the last handler, we can transfer ownership of the buffer
              // For previous handlers, we need to copy since transfer is destructive
              const isLast = i === handlers.length - 1
              const updateToSend = isLast ? update : new Uint8Array(update)

              // Use Comlink's transfer() for zero-copy when possible
              if (isLast && update.buffer.byteLength === update.byteLength) {
                // Transfer the ArrayBuffer for zero-copy (only works if we own the whole buffer)
                handlers[i](
                  transfer(updateToSend, [updateToSend.buffer]) as unknown as Uint8Array,
                  'remote'
                )
              } else {
                handlers[i](updateToSend, 'remote')
              }
            } catch (err) {
              console.error('[DataWorker] Update handler error:', err)
            }
          }
        }
      })

      this.docPool.set(nodeId, entry)
    }

    // Register the update handler
    const proxiedHandler = proxy(onUpdate)
    entry.updateHandlers.add(proxiedHandler)
    entry.refCount++

    // Get current state to send to main thread
    // Use transfer() for zero-copy transfer of the initial state
    const state = Y.encodeStateAsUpdate(entry.doc)

    // Return with the state transferred for zero-copy
    // Note: We return the transfer-wrapped result - Comlink handles this specially
    return transfer(
      {
        nodeId,
        state,
        clientId: this.nextClientId++
      },
      [state.buffer]
    )
  }

  releaseDoc(nodeId: string): void {
    const entry = this.docPool.get(nodeId)
    if (!entry) return

    entry.refCount--

    // Note: We keep the doc in the pool even when refCount hits 0
    // This allows background sync to continue and avoids reloading on re-acquire
    // A separate eviction policy could remove old unused docs if memory is a concern
  }

  applyLocalUpdate(nodeId: string, update: Uint8Array): void {
    const entry = this.docPool.get(nodeId)
    if (!entry) {
      console.warn('[DataWorker] applyLocalUpdate: doc not acquired:', nodeId)
      return
    }

    // Apply the update from the main-thread mirror doc to our source-of-truth doc
    // Mark as 'local' origin so we don't echo it back to the sender
    Y.applyUpdate(entry.doc, update, 'local')

    // TODO: In the future, this is where we'd broadcast to the network
    // For now, the update is persisted via the doc's update listener
  }

  // ─── Status ─────────────────────────────────────────────────────────────────

  getStatus(): SyncStatus {
    return this.status
  }

  onStatusChange(handler: (status: SyncStatus) => void): void {
    this.statusHandlers.add(proxy(handler))
  }

  async destroy(): Promise<void> {
    // Unsubscribe from store
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe()
      this.storeUnsubscribe = null
    }

    // Destroy all Y.Docs in the pool
    for (const entry of this.docPool.values()) {
      entry.doc.destroy()
    }
    this.docPool.clear()

    // Close storage (if it supports close)
    if (this.storage?.close) {
      await this.storage.close()
    }
    this.storage = null

    // Clear state
    this.store = null
    this.subscriptions.clear()
    this.statusHandlers.clear()

    this.setStatus('disconnected')
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  private async loadQuery(descriptor: WorkerSubscription['descriptor']): Promise<NodeState[]> {
    if (!this.store) return []

    let nodes: NodeState[]

    if (descriptor.nodeId) {
      // Single node query
      const node = await this.store.get(descriptor.nodeId)
      nodes = node ? [node] : []
    } else {
      // List query
      nodes = await this.store.list({
        schemaId: descriptor.schemaId,
        includeDeleted: descriptor.includeDeleted
      })
    }

    return applyQueryDescriptor(nodes, descriptor)
  }

  private handleStoreChange(event: NodeChangeEvent): void {
    const { node, change } = event
    const schemaId: SchemaIRI | undefined = node?.schemaId ?? change.payload.schemaId

    if (!schemaId) return

    // Find subscriptions that match this schema
    for (const [queryId, sub] of this.subscriptions) {
      if (sub.schemaId !== schemaId) continue

      void this.applyStoreChangeToSubscription(queryId, sub, change.payload.nodeId, node ?? null)
    }
  }

  private async applyStoreChangeToSubscription(
    _queryId: string,
    sub: WorkerSubscription & { onDelta: (delta: QueryDelta) => void },
    nodeId: string,
    nextNode: NodeState | null
  ): Promise<void> {
    const currentContains = sub.lastResult.some((node) => node.id === nodeId)
    const nextMatches = matchesQueryDescriptor(sub.descriptor, nextNode)
    const delta = applyNodeChangeToQueryResult({
      descriptor: sub.descriptor,
      currentData: sub.lastResult,
      nodeId,
      nextNode
    })

    if (delta.kind === 'noop') {
      return
    }

    if (delta.kind === 'reload') {
      const reloaded = await this.loadQuery(sub.descriptor)
      sub.lastResult = reloaded
      sub.onDelta({ type: 'reload', data: reloaded })
      return
    }

    sub.lastResult = delta.data

    if (!currentContains && nextMatches && nextNode) {
      sub.onDelta({
        type: 'add',
        node: nextNode,
        index: delta.data.findIndex((node) => node.id === nextNode.id)
      })
      return
    }

    if (currentContains && !nextMatches) {
      sub.onDelta({ type: 'remove', nodeId })
      return
    }

    if (currentContains && nextMatches && nextNode) {
      sub.onDelta({ type: 'update', nodeId, node: nextNode })
    }
  }

  private setStatus(status: SyncStatus): void {
    this.status = status
    for (const handler of this.statusHandlers) {
      handler(status)
    }
  }

  /**
   * Evict unused Y.Docs from the pool to manage memory.
   * Only evicts docs with refCount=0 that haven't been accessed recently.
   */
  private evictOldDocs(): void {
    if (this.docPool.size < MAX_DOC_POOL_SIZE) return

    const now = Date.now()
    const candidates: Array<{ nodeId: string; lastAccessed: number }> = []

    // Find eviction candidates: docs with no refs and old enough
    for (const [nodeId, entry] of this.docPool) {
      if (entry.refCount === 0 && now - entry.lastAccessed > MIN_DOC_AGE_FOR_EVICTION) {
        candidates.push({ nodeId, lastAccessed: entry.lastAccessed })
      }
    }

    if (candidates.length === 0) return

    // Sort by lastAccessed (oldest first)
    candidates.sort((a, b) => a.lastAccessed - b.lastAccessed)

    // Evict enough to get below 80% of max size
    const targetSize = Math.floor(MAX_DOC_POOL_SIZE * 0.8)
    const toEvict = this.docPool.size - targetSize

    for (let i = 0; i < Math.min(toEvict, candidates.length); i++) {
      const nodeId = candidates[i].nodeId
      const entry = this.docPool.get(nodeId)
      if (entry) {
        // Persist one final time before destroying
        if (this.storage) {
          const content = Y.encodeStateAsUpdate(entry.doc)
          this.storage.setDocumentContent(nodeId, content).catch(() => {
            // Silent fail on eviction persist
          })
        }
        entry.doc.destroy()
        this.docPool.delete(nodeId)
      }
    }
  }
}

// ─── Expose Worker API ───────────────────────────────────────────────────────

expose(new DataWorker())
