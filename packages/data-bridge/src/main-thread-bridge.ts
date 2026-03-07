/**
 * MainThreadBridge - Direct NodeStore access implementation
 *
 * Phase 0 implementation that wraps NodeStore directly.
 * Provides the DataBridge interface while keeping current behavior.
 *
 * This is the fallback implementation used when:
 * - Web Workers are not available
 * - During Phase 0 transition period
 * - For testing/development
 */

import type {
  DataBridge,
  QueryDescriptor,
  QuerySubscription,
  QueryOptions,
  SyncStatus,
  AcquiredDoc
} from './types'
import type {
  NodeStore,
  NodeState,
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  NodeChangeEvent,
  ListNodesOptions,
  SchemaIRI
} from '@xnetjs/data'
import type { Awareness } from 'y-protocols/awareness'
import type { Doc as YDoc } from 'yjs'
import { QueryCache } from './query-cache'
import {
  applyNodeChangeToQueryResult,
  applyQueryDescriptor,
  createQueryDescriptor,
  serializeQueryDescriptor
} from './query-descriptor'

// ─── SyncManager Interface ───────────────────────────────────────────────────

/**
 * Minimal SyncManager interface for Y.Doc acquisition.
 * This avoids a direct dependency on @xnetjs/react's full SyncManager type.
 */
export interface SyncManagerLike {
  acquire(nodeId: string): Promise<YDoc>
  release(nodeId: string): void
  getAwareness(nodeId: string): Awareness | null
}

// ─── MainThreadBridge Class ──────────────────────────────────────────────────

/**
 * DataBridge implementation that accesses NodeStore directly on the main thread.
 *
 * This is the Phase 0 implementation that maintains current behavior while
 * providing the DataBridge abstraction. Later phases will move operations
 * off the main thread via Web Workers or IPC.
 */
export class MainThreadBridge implements DataBridge {
  private store: NodeStore
  private cache: QueryCache
  private statusListeners = new Set<(status: SyncStatus) => void>()
  private storeUnsubscribe: (() => void) | null = null
  private _syncManager: SyncManagerLike | null = null

  constructor(store: NodeStore) {
    this.store = store
    this.cache = new QueryCache()

    // Subscribe to store changes for cache invalidation
    this.storeUnsubscribe = this.store.subscribe((event) => {
      this.handleStoreChange(event)
    })
  }

  /**
   * Set the SyncManager for Y.Doc acquisition.
   * This is called by XNetProvider after the SyncManager is created.
   */
  setSyncManager(syncManager: SyncManagerLike | null): void {
    this._syncManager = syncManager
  }

  // ─── Queries ────────────────────────────────────────────

  query<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    options?: QueryOptions<P>
  ): QuerySubscription<P> {
    const descriptor = createQueryDescriptor(schema._schemaId, options)
    const queryId = serializeQueryDescriptor(descriptor)

    // Initialize cache entry if not exists
    this.cache.initEntry(queryId, descriptor)

    // Start loading data if not cached
    if (this.cache.get(queryId) === null) {
      void this.loadQuery(queryId, descriptor)
    }

    return {
      getSnapshot: () => this.cache.get(queryId),
      subscribe: (callback) => this.cache.subscribe(queryId, callback)
    }
  }

  async reloadQuery(descriptor: QueryDescriptor): Promise<void> {
    await this.loadQuery(serializeQueryDescriptor(descriptor), descriptor)
  }

  /**
   * Load query data from the store and update cache.
   */
  private async loadQuery(queryId: string, descriptor: QueryDescriptor): Promise<void> {
    try {
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

      this.cache.set(queryId, applyQueryDescriptor(nodes, descriptor), descriptor)
    } catch (err) {
      console.error('[MainThreadBridge] Failed to load query:', err)
      // Set empty array on error so we don't keep retrying
      this.cache.set(queryId, [], descriptor)
    }
  }

  /**
   * Handle store changes and invalidate affected caches.
   */
  private handleStoreChange(event: NodeChangeEvent): void {
    const { node, change } = event
    // Get schemaId from node (if available) or from the change payload
    const schemaId: SchemaIRI | undefined = node?.schemaId ?? change.payload.schemaId

    if (!schemaId) return

    for (const entry of this.cache.getEntriesForSchema(schemaId)) {
      if (entry.data === null) {
        void this.loadQuery(entry.queryId, entry.descriptor)
        continue
      }

      const delta = applyNodeChangeToQueryResult({
        descriptor: entry.descriptor,
        currentData: entry.data,
        nodeId: change.payload.nodeId,
        nextNode: node
      })

      if (delta.kind === 'reload') {
        void this.loadQuery(entry.queryId, entry.descriptor)
        continue
      }

      if (delta.kind === 'set') {
        this.cache.set(entry.queryId, delta.data)
      }
    }
  }

  // ─── Mutations ──────────────────────────────────────────

  async create<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    data: InferCreateProps<P>,
    id?: string
  ): Promise<NodeState> {
    return this.store.create({
      id,
      schemaId: schema._schemaId,
      properties: data as Record<string, unknown>
    })
  }

  async update(nodeId: string, changes: Record<string, unknown>): Promise<NodeState> {
    return this.store.update(nodeId, { properties: changes })
  }

  async delete(nodeId: string): Promise<void> {
    await this.store.delete(nodeId)
  }

  async restore(nodeId: string): Promise<NodeState> {
    return this.store.restore(nodeId)
  }

  // ─── Documents ─────────────────────────────────────────

  /**
   * Acquire a Y.Doc for editing.
   * Delegates to SyncManager if available, otherwise throws.
   *
   * @throws Error if SyncManager is not set
   */
  async acquireDoc(nodeId: string): Promise<AcquiredDoc> {
    if (!this._syncManager) {
      throw new Error(
        'MainThreadBridge.acquireDoc requires SyncManager. ' +
          'Call setSyncManager() first or use useNode with SyncManager context.'
      )
    }

    const doc = await this._syncManager.acquire(nodeId)
    const awareness = this._syncManager.getAwareness(nodeId)

    if (!awareness) {
      throw new Error(`Failed to get awareness for node ${nodeId}`)
    }

    return { doc, awareness }
  }

  /**
   * Release a Y.Doc when no longer editing.
   */
  releaseDoc(nodeId: string): void {
    if (this._syncManager) {
      this._syncManager.release(nodeId)
    }
  }

  // ─── Lifecycle ──────────────────────────────────────────

  destroy(): void {
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe()
      this.storeUnsubscribe = null
    }
    this.cache.clear()
    this.statusListeners.clear()
  }

  // ─── Status ─────────────────────────────────────────────

  get status(): SyncStatus {
    // MainThreadBridge is always "connected" since it's local
    return 'connected'
  }

  on(event: 'status', handler: (status: SyncStatus) => void): () => void {
    if (event === 'status') {
      this.statusListeners.add(handler)
      return () => {
        this.statusListeners.delete(handler)
      }
    }
    return () => {}
  }

  // ─── Direct Store Access (Phase 0 compatibility) ────────

  get nodeStore(): NodeStore {
    return this.store
  }

  subscribeToChanges(listener: (event: NodeChangeEvent) => void): () => void {
    return this.store.subscribe(listener)
  }

  async get(nodeId: string): Promise<NodeState | null> {
    return this.store.get(nodeId)
  }

  async list(options?: ListNodesOptions): Promise<NodeState[]> {
    return this.store.list(options)
  }
}

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Create a MainThreadBridge from a NodeStore.
 */
export function createMainThreadBridge(store: NodeStore): MainThreadBridge {
  return new MainThreadBridge(store)
}
