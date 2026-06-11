/**
 * DataWorker host - the worker-resident data layer (exploration 0164)
 *
 * This class runs NodeStore, query subscriptions, and invalidation off the
 * main thread. It is exposed via Comlink by `data-worker.ts`; tests
 * instantiate it directly.
 *
 * Key responsibilities:
 * - Initialize and manage NodeStore inside the worker
 * - Handle query subscriptions and push per-query deltas to the main thread
 * - Execute CRUD operations and atomic transactions
 * - Manage Y.Doc pool for collaborative editing
 * - Handle signing/verification (all crypto happens here)
 *
 * Invalidation mirrors MainThreadBridge's 0163 machinery:
 * - Bounded working sets keep limited+ordered queries incremental
 * - Batch change events hydrate touched nodes once instead of re-querying
 * - Re-queries graft previous node references back in for unchanged rows
 */

import type {
  WorkerConfig,
  SerializedQueryOptions,
  QueryDelta,
  WorkerSubscription,
  DataWorkerAPI,
  WorkerAcquiredDoc
} from './worker-types'
import type { BridgeTransactionResult, QueryDescriptor, SyncStatus } from '../types'
import type { DID } from '@xnetjs/core'
import {
  NodeStore,
  MemoryNodeStorageAdapter,
  SQLiteNodeStorageAdapter,
  type NodeState,
  type NodeChangeEvent,
  type NodeBatchChangeEvent,
  type SchemaIRI,
  type NodeStorageAdapter,
  type NodeBatchWriteInput,
  type NodeBatchWriteResult,
  type TransactionOperation
} from '@xnetjs/data'
import { createWebCryptoChangeSigner } from '@xnetjs/sync'
import { proxy, transfer } from 'comlink'
import * as Y from 'yjs'
import {
  applyNodeChangeToBoundedQueryResult,
  applyNodeChangeToQueryResult,
  createBoundedWorkingSet,
  createBoundedWorkingSetDescriptor,
  createQueryDescriptor,
  queryDescriptorSupportsBoundedDelta,
  reuseEquivalentNodeReferences,
  type BoundedQueryWorkingSet
} from '../query-descriptor'
import { groupNodeChangeEventsBySchema } from '../utils/change-events'
import { PortSQLiteAdapter } from './port-sqlite-adapter'

// Above this many events in one flush (or one storage batch), invalidation
// stops applying per-node deltas and falls back to re-querying each affected
// subscription once. Matches MainThreadBridge: delta application is pure
// in-memory work, so only genuinely bulk flows (imports, migrations) pay
// for re-queries.
const BULK_STORE_CHANGE_RELOAD_THRESHOLD = 250

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

// ─── Subscription State ──────────────────────────────────────────────────────

interface ActiveWorkerSubscription extends WorkerSubscription {
  onDelta: (delta: QueryDelta) => void
  /** Overfetched prefix buffer for bounded (limit + orderBy) descriptors */
  workingSet: BoundedQueryWorkingSet | null
}

/**
 * Translate a visible-result transition into the wire delta sent to the
 * main thread. Relies on node-reference reuse: unchanged rows keep their
 * object identity through delta application and identity-merged reloads,
 * so reference inequality means the row changed.
 */
export function computeQueryDelta(previous: NodeState[], next: NodeState[]): QueryDelta | null {
  const previousById = new Map(previous.map((node) => [node.id, node]))
  const nextIds = new Set(next.map((node) => node.id))

  const added = next.filter((node) => !previousById.has(node.id))
  const removed = previous.filter((node) => !nextIds.has(node.id))

  if (added.length === 0 && removed.length === 0) {
    const changed = next.filter((node) => previousById.get(node.id) !== node)
    if (changed.length === 0) return null
    if (changed.length === 1) {
      return { type: 'update', nodeId: changed[0].id, node: changed[0] }
    }
    return { type: 'reload', data: next }
  }

  if (added.length === 1 && removed.length === 0) {
    const othersUntouched = next.every(
      (node) => node.id === added[0].id || previousById.get(node.id) === node
    )
    if (othersUntouched) {
      return {
        type: 'add',
        node: added[0],
        index: next.findIndex((node) => node.id === added[0].id)
      }
    }
    return { type: 'reload', data: next }
  }

  if (removed.length === 1 && added.length === 0) {
    const othersUntouched = next.every((node) => previousById.get(node.id) === node)
    if (othersUntouched) {
      return { type: 'remove', nodeId: removed[0].id }
    }
    return { type: 'reload', data: next }
  }

  return { type: 'reload', data: next }
}

// ─── DataWorker Class ────────────────────────────────────────────────────────

export class DataWorker implements DataWorkerAPI {
  protected store: NodeStore | null = null
  protected storage: NodeStorageAdapter | null = null
  private subscriptions = new Map<string, ActiveWorkerSubscription>()
  private status: SyncStatus = 'disconnected'
  private statusHandlers = new Set<(status: SyncStatus) => void>()
  private storeUnsubscribe: (() => void) | null = null
  private storeBatchUnsubscribe: (() => void) | null = null
  private pendingStoreChanges: NodeChangeEvent[] = []
  private storeChangeFlushQueued = false

  // Y.Doc pool - the "source of truth" for all documents
  private docPool = new Map<string, PoolEntry>()
  // Client ID counter for Y.Doc instances
  private nextClientId = Math.floor(Math.random() * 2147483647)

  async initialize(config: WorkerConfig): Promise<void> {
    this.storage = await this.createStorageAdapter(config)

    const signingKey = new Uint8Array(config.signingKey)
    this.store = new NodeStore({
      storage: this.storage,
      authorDID: config.authorDID as DID,
      signingKey,
      // Signing already runs off the main thread here, but WebCrypto keeps
      // signature bursts (imports, transactions) from blocking the worker's
      // own event loop — queries and deltas stay responsive. Byte-identical
      // to the synchronous path; null when the runtime lacks SubtleCrypto.
      changeSigner: createWebCryptoChangeSigner(signingKey) ?? undefined
    })
    await this.store.initialize()

    // Set up store change listener for subscriptions
    this.storeUnsubscribe = this.store.subscribe((event) => {
      this.enqueueStoreChange(event)
    })
    this.storeBatchUnsubscribe = this.store.subscribeToBatchChanges((event) => {
      void this.handleStoreBatchChange(event)
    })

    this.setStatus('connected')
  }

  /**
   * Create the worker's storage adapter.
   *
   * With a forwarded `storagePort`, persistence goes through the existing
   * SQLite worker via PortSQLiteAdapter (worker-to-worker, no main-thread
   * hop). Without one, storage is in-memory.
   */
  protected async createStorageAdapter(config: WorkerConfig): Promise<NodeStorageAdapter> {
    if (config.storagePort) {
      const portAdapter = new PortSQLiteAdapter(config.storagePort)
      await portAdapter.open()
      const storage = new SQLiteNodeStorageAdapter(portAdapter)
      await storage.open()
      return storage
    }

    return new MemoryNodeStorageAdapter()
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

    const descriptor = createQueryDescriptor(schemaId as SchemaIRI, options)
    const existing = this.subscriptions.get(queryId)
    const loaded = await this.loadQueryState(descriptor, existing?.lastResult ?? null)

    this.subscriptions.set(queryId, {
      schemaId: schemaId as SchemaIRI,
      descriptor,
      options,
      lastResult: loaded.visible,
      workingSet: loaded.workingSet,
      onDelta: proxy(onDelta)
    })

    return loaded.visible
  }

  async unsubscribe(queryId: string): Promise<void> {
    this.subscriptions.delete(queryId)
  }

  async reloadQuery(queryId: string): Promise<NodeState[]> {
    const sub = this.subscriptions.get(queryId)
    if (!sub) {
      return []
    }

    const loaded = await this.loadQueryState(sub.descriptor, sub.lastResult, sub.workingSet)
    sub.lastResult = loaded.visible
    sub.workingSet = loaded.workingSet
    return loaded.visible
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

  async bulkWrite(input: NodeBatchWriteInput): Promise<NodeBatchWriteResult> {
    if (!this.store) {
      throw new Error('DataWorker not initialized')
    }

    return this.store.batchWrite(input)
  }

  async transaction(operations: TransactionOperation[]): Promise<BridgeTransactionResult> {
    if (!this.store) {
      throw new Error('DataWorker not initialized')
    }

    const tx = await this.store.transaction(operations)
    // Strip the signed change list: it is not needed on the main thread and
    // would otherwise be structured-cloned on every transaction.
    return { batchId: tx.batchId, results: tx.results, tempIds: tx.tempIds }
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
    if (this.storeBatchUnsubscribe) {
      this.storeBatchUnsubscribe()
      this.storeBatchUnsubscribe = null
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

  /**
   * Execute a subscription's query against storage. Bounded descriptors
   * overfetch a small buffer so later node changes can be applied in
   * memory, and re-queries graft previous node references back in wherever
   * the snapshots are equivalent (so reference-based delta math and
   * downstream identity caches keep working).
   */
  private async loadQueryState(
    descriptor: QueryDescriptor,
    previousNodes: NodeState[] | null,
    previousWorkingSet?: BoundedQueryWorkingSet | null
  ): Promise<{ visible: NodeState[]; workingSet: BoundedQueryWorkingSet | null }> {
    if (!this.store) {
      return { visible: [], workingSet: null }
    }

    const useBoundedWorkingSet = queryDescriptorSupportsBoundedDelta(descriptor)
    const result = await this.store.query(
      useBoundedWorkingSet ? createBoundedWorkingSetDescriptor(descriptor) : descriptor
    )
    const merged = reuseEquivalentNodeReferences(result.nodes, [
      ...(previousWorkingSet?.nodes ?? []),
      ...(previousNodes ?? [])
    ])
    const visible = useBoundedWorkingSet ? merged.slice(0, descriptor.limit) : merged

    return {
      visible,
      workingSet: useBoundedWorkingSet ? createBoundedWorkingSet(descriptor, merged) : null
    }
  }

  private async reloadSubscription(sub: ActiveWorkerSubscription): Promise<void> {
    const loaded = await this.loadQueryState(sub.descriptor, sub.lastResult, sub.workingSet)
    sub.lastResult = loaded.visible
    sub.workingSet = loaded.workingSet
    sub.onDelta({ type: 'reload', data: loaded.visible })
  }

  private enqueueStoreChange(event: NodeChangeEvent): void {
    this.pendingStoreChanges.push(event)

    if (this.storeChangeFlushQueued) {
      return
    }

    this.storeChangeFlushQueued = true
    queueMicrotask(() => {
      void this.flushStoreChanges()
    })
  }

  private async flushStoreChanges(): Promise<void> {
    const events = this.pendingStoreChanges
    this.pendingStoreChanges = []
    this.storeChangeFlushQueued = false

    if (events.length === 0) {
      return
    }

    await this.handleStoreChangeSet(events)
  }

  private isBulkStoreChangeSet(events: readonly NodeChangeEvent[]): boolean {
    return (
      events.length > BULK_STORE_CHANGE_RELOAD_THRESHOLD ||
      events.some((event) => (event.change.batchSize ?? 1) > BULK_STORE_CHANGE_RELOAD_THRESHOLD)
    )
  }

  private async handleStoreChangeSet(events: readonly NodeChangeEvent[]): Promise<void> {
    const eventsBySchema = groupNodeChangeEventsBySchema(events)

    for (const [schemaId, schemaEvents] of eventsBySchema) {
      const shouldReload = this.isBulkStoreChangeSet(schemaEvents)
      const changes = schemaEvents.map((event) => ({
        nodeId: event.change.payload.nodeId,
        nextNode: event.node ?? null
      }))

      for (const sub of this.subscriptions.values()) {
        if (sub.schemaId !== schemaId) continue

        if (shouldReload) {
          await this.reloadSubscription(sub)
          continue
        }

        await this.applyChangesToSubscription(sub, changes)
      }
    }
  }

  /**
   * Batch notifications carry node ids only. Small batches hydrate the
   * touched nodes once and flow through the same delta path as regular
   * change events; only genuinely bulk batches re-query each subscription.
   */
  private async handleStoreBatchChange(event: NodeBatchChangeEvent): Promise<void> {
    if (event.nodeIds.length > BULK_STORE_CHANGE_RELOAD_THRESHOLD) {
      await this.reloadSubscriptionsForSchemas(event.schemaIds)
      return
    }

    try {
      await this.applyStoreBatchChangeDeltas(event)
    } catch (err) {
      console.error('[DataWorker] Failed to apply batch change deltas:', err)
      await this.reloadSubscriptionsForSchemas(event.schemaIds)
    }
  }

  private async reloadSubscriptionsForSchemas(schemaIds: readonly SchemaIRI[]): Promise<void> {
    for (const schemaId of schemaIds) {
      for (const sub of this.subscriptions.values()) {
        if (sub.schemaId !== schemaId) continue

        await this.reloadSubscription(sub)
      }
    }
  }

  private async applyStoreBatchChangeDeltas(event: NodeBatchChangeEvent): Promise<void> {
    if (!this.store) return

    const nodes = await Promise.all(event.nodeIds.map((nodeId) => this.store!.get(nodeId)))
    const changes = event.nodeIds.map((nodeId, index) => ({
      nodeId,
      nextNode: nodes[index]
    }))

    for (const schemaId of event.schemaIds) {
      for (const sub of this.subscriptions.values()) {
        if (sub.schemaId !== schemaId) continue

        await this.applyChangesToSubscription(sub, changes)
      }
    }
  }

  /**
   * Apply a list of node changes to one subscription, falling back to a
   * storage re-query only when a delta is ambiguous. Emits at most one
   * wire delta per change.
   */
  protected async applyChangesToSubscription(
    sub: ActiveWorkerSubscription,
    changes: ReadonlyArray<{ nodeId: string; nextNode: NodeState | null }>,
    options?: { onAmbiguous?: 'reload' | 'skip' }
  ): Promise<void> {
    for (const change of changes) {
      const applied = this.applyChangeToSubscriptionState(sub, change.nodeId, change.nextNode)

      if (applied.kind === 'reload') {
        if (options?.onAmbiguous !== 'skip') {
          await this.reloadSubscription(sub)
        }
        return
      }

      if (applied.kind === 'noop') {
        continue
      }

      const delta = computeQueryDelta(sub.lastResult, applied.data)
      sub.lastResult = applied.data
      sub.workingSet = applied.workingSet

      if (delta) {
        sub.onDelta(delta)
      }
    }
  }

  private applyChangeToSubscriptionState(
    sub: ActiveWorkerSubscription,
    nodeId: string,
    nextNode: NodeState | null
  ):
    | { kind: 'reload' }
    | { kind: 'noop' }
    | { kind: 'ok'; data: NodeState[]; workingSet: BoundedQueryWorkingSet | null } {
    if (sub.workingSet && queryDescriptorSupportsBoundedDelta(sub.descriptor)) {
      const delta = applyNodeChangeToBoundedQueryResult({
        descriptor: sub.descriptor,
        workingSet: sub.workingSet,
        nodeId,
        nextNode
      })

      if (delta.kind === 'reload') return { kind: 'reload' }
      if (delta.kind === 'noop') return { kind: 'noop' }
      return { kind: 'ok', data: delta.data, workingSet: delta.workingSet }
    }

    const delta = applyNodeChangeToQueryResult({
      descriptor: sub.descriptor,
      currentData: sub.lastResult,
      nodeId,
      nextNode
    })

    if (delta.kind === 'reload') return { kind: 'reload' }
    if (delta.kind === 'noop') return { kind: 'noop' }
    return { kind: 'ok', data: delta.data, workingSet: null }
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

export type { ActiveWorkerSubscription }
