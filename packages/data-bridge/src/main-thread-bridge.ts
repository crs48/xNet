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

import type { DataBridge, QuerySubscription, QueryOptions, SyncStatus } from './types'
import type {
  NodeStore,
  NodeState,
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  NodeChangeEvent,
  ListNodesOptions,
  SchemaIRI
} from '@xnet/data'
import { QueryCache } from './query-cache'

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

  constructor(store: NodeStore) {
    this.store = store
    this.cache = new QueryCache()

    // Subscribe to store changes for cache invalidation
    this.storeUnsubscribe = this.store.subscribe((event) => {
      this.handleStoreChange(event)
    })
  }

  // ─── Queries ────────────────────────────────────────────

  query<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    options?: QueryOptions<P>
  ): QuerySubscription<P> {
    const schemaId = schema._schemaId
    const queryId = this.cache.computeQueryId(schemaId, options)

    // Initialize cache entry if not exists
    this.cache.initEntry(queryId, schemaId, options ?? {})

    // Start loading data if not cached
    if (!this.cache.has(queryId) || this.cache.get(queryId) === null) {
      this.loadQuery(queryId, schemaId, options)
    }

    return {
      getSnapshot: () => this.cache.get(queryId),
      subscribe: (callback) => this.cache.subscribe(queryId, callback)
    }
  }

  /**
   * Load query data from the store and update cache.
   */
  private async loadQuery<P extends Record<string, PropertyBuilder>>(
    queryId: string,
    schemaId: SchemaIRI,
    options?: QueryOptions<P>
  ): Promise<void> {
    try {
      let nodes: NodeState[]

      if (options?.nodeId) {
        // Single node query
        const node = await this.store.get(options.nodeId)
        nodes = node && node.schemaId === schemaId && !node.deleted ? [node] : []
      } else {
        // List query
        nodes = await this.store.list({
          schemaId,
          includeDeleted: options?.includeDeleted,
          limit: options?.limit,
          offset: options?.offset
        })
      }

      // Apply filtering and sorting
      nodes = this.cache.filterNodes(nodes, options)
      nodes = this.cache.sortNodes(nodes, options)

      // Note: pagination is already applied in store.list()

      this.cache.set(queryId, nodes, schemaId, options ?? {})
    } catch (err) {
      console.error('[MainThreadBridge] Failed to load query:', err)
      // Set empty array on error so we don't keep retrying
      this.cache.set(queryId, [], schemaId, options ?? {})
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

    // Get all queries for this schema
    const affectedQueries = this.cache.getQueriesForSchema(schemaId)

    // Reload each affected query
    for (const queryId of affectedQueries) {
      const options = this.cache.getOptions(queryId)
      this.loadQuery(queryId, schemaId, options)
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
