/**
 * WorkerBridge - Main thread bridge to DataWorker
 *
 * This bridge runs on the main thread and communicates with the DataWorker
 * running in a Web Worker via Comlink. It provides the same DataBridge
 * interface as MainThreadBridge but offloads all heavy operations.
 *
 * Key features:
 * - Type-safe RPC via Comlink
 * - Query caching with delta updates
 * - useSyncExternalStore-compatible subscriptions
 */

import type {
  DataBridge,
  DataBridgeConfig,
  QuerySubscription,
  QueryOptions,
  SyncStatus
} from './types'
import type { DataWorkerAPI, QueryDelta, SerializedQueryOptions } from './worker/worker-types'
import type {
  NodeState,
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  SchemaIRI
} from '@xnet/data'
import { wrap, proxy, type Remote } from 'comlink'
import { QueryCache } from './query-cache'

// ─── WorkerBridge Class ──────────────────────────────────────────────────────

/**
 * DataBridge implementation that communicates with a Web Worker.
 *
 * All heavy operations (storage, queries, crypto) run in the worker,
 * keeping the main thread free for UI rendering.
 */
export class WorkerBridge implements DataBridge {
  private worker: Worker
  private remote: Remote<DataWorkerAPI>
  private cache = new QueryCache()
  private subscriptions = new Map<string, Set<() => void>>()
  private queryCounter = 0
  private statusListeners = new Set<(status: SyncStatus) => void>()
  private _status: SyncStatus = 'connecting'
  private initialized = false

  constructor(workerUrl: string | URL) {
    this.worker = new Worker(workerUrl, { type: 'module' })
    this.remote = wrap<DataWorkerAPI>(this.worker)
  }

  /**
   * Initialize the bridge and underlying worker.
   */
  async initialize(config: DataBridgeConfig): Promise<void> {
    await this.remote.initialize({
      dbName: config.dbName ?? 'xnet',
      authorDID: config.authorDID,
      signingKey: Array.from(config.signingKey)
    })

    // Subscribe to status changes from worker
    this.remote.onStatusChange(
      proxy((status: SyncStatus) => {
        this._status = status
        for (const handler of this.statusListeners) {
          handler(status)
        }
      })
    )

    this.initialized = true
    this._status = 'connected'
  }

  // ─── Queries ─────────────────────────────────────────────────────────────────

  query<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    options?: QueryOptions<P>
  ): QuerySubscription<P> {
    const schemaId = schema._schemaId
    const queryId = `q${this.queryCounter++}`
    const serializedOptions = this.serializeOptions(options)

    // Initialize cache entry
    this.cache.initEntry(queryId, schemaId, serializedOptions)

    // Start subscription in worker (async)
    if (this.initialized) {
      this.startWorkerSubscription(queryId, schemaId, serializedOptions)
    }

    return {
      getSnapshot: () => this.cache.get(queryId),
      subscribe: (callback) => {
        // Add to local subscribers
        const subs = this.subscriptions.get(queryId) ?? new Set()
        subs.add(callback)
        this.subscriptions.set(queryId, subs)

        // Also subscribe to cache
        const unsubCache = this.cache.subscribe(queryId, callback)

        return () => {
          subs.delete(callback)
          unsubCache()
          if (subs.size === 0) {
            this.subscriptions.delete(queryId)
            // Unsubscribe from worker
            this.remote.unsubscribe(queryId).catch(console.error)
          }
        }
      }
    }
  }

  private async startWorkerSubscription(
    queryId: string,
    schemaId: SchemaIRI,
    options: SerializedQueryOptions
  ): Promise<void> {
    try {
      const initial = await this.remote.subscribe(
        queryId,
        schemaId,
        options,
        proxy((delta: QueryDelta) => {
          this.applyDelta(queryId, delta)
        })
      )

      // Update cache with initial data
      this.cache.set(queryId, initial, schemaId, options)
    } catch (err) {
      console.error('[WorkerBridge] Failed to subscribe:', err)
      // Set empty result on error
      this.cache.set(queryId, [], schemaId, options)
    }
  }

  private applyDelta(queryId: string, delta: QueryDelta): void {
    const current = this.cache.get(queryId) ?? []
    let updated: NodeState[]

    switch (delta.type) {
      case 'add':
        updated = [...current, delta.node]
        break
      case 'remove':
        updated = current.filter((n) => n.id !== delta.nodeId)
        break
      case 'update':
        updated = current.map((n) => (n.id === delta.nodeId ? delta.node : n))
        break
    }

    const schemaId = this.cache.getSchemaId(queryId)
    const options = this.cache.getOptions(queryId)
    if (schemaId && options) {
      // Re-sort after delta
      updated = this.cache.sortNodes(updated, options)
      this.cache.set(queryId, updated, schemaId, options)
    }
  }

  private serializeOptions<P extends Record<string, PropertyBuilder>>(
    options?: QueryOptions<P>
  ): SerializedQueryOptions {
    if (!options) return {}

    return {
      nodeId: options.nodeId,
      where: options.where as Record<string, unknown> | undefined,
      includeDeleted: options.includeDeleted,
      orderBy: options.orderBy as Record<string, 'asc' | 'desc'> | undefined,
      limit: options.limit,
      offset: options.offset
    }
  }

  // ─── Mutations ───────────────────────────────────────────────────────────────

  async create<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    data: InferCreateProps<P>,
    id?: string
  ): Promise<NodeState> {
    if (!this.initialized) {
      throw new Error('WorkerBridge not initialized')
    }

    return this.remote.create(schema._schemaId, data as Record<string, unknown>, id)
  }

  async update(nodeId: string, changes: Record<string, unknown>): Promise<NodeState> {
    if (!this.initialized) {
      throw new Error('WorkerBridge not initialized')
    }

    return this.remote.update(nodeId, changes)
  }

  async delete(nodeId: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('WorkerBridge not initialized')
    }

    await this.remote.delete(nodeId)
  }

  async restore(nodeId: string): Promise<NodeState> {
    if (!this.initialized) {
      throw new Error('WorkerBridge not initialized')
    }

    return this.remote.restore(nodeId)
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  destroy(): void {
    // Clean up worker
    this.remote.destroy().catch(console.error)
    this.worker.terminate()

    // Clear local state
    this.cache.clear()
    this.subscriptions.clear()
    this.statusListeners.clear()
    this.initialized = false
    this._status = 'disconnected'
  }

  // ─── Status ──────────────────────────────────────────────────────────────────

  get status(): SyncStatus {
    return this._status
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
}

// ─── Factory Function ────────────────────────────────────────────────────────

/**
 * Create a WorkerBridge from a worker URL.
 *
 * @param workerUrl - URL to the data worker script
 * @returns A new WorkerBridge instance (must call initialize() before use)
 */
export function createWorkerBridge(workerUrl: string | URL): WorkerBridge {
  return new WorkerBridge(workerUrl)
}
