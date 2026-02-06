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
  SyncStatus,
  AcquiredDoc
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
import { Awareness } from 'y-protocols/awareness'
import * as Y from 'yjs'
import { QueryCache } from './query-cache'

// ─── Mirror Doc Entry ────────────────────────────────────────────────────────

/**
 * Tracks a mirror Y.Doc on the main thread and its connection to the worker's source doc.
 */
interface MirrorDocEntry {
  /** The Y.Doc on the main thread (TipTap binds to this) */
  doc: Y.Doc
  /** Awareness instance for cursor presence */
  awareness: Awareness
  /** Whether we're currently applying a remote update (to avoid loops) */
  applyingRemote: boolean
  /** Cleanup function for the update listener */
  cleanup: () => void
}

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

  // Mirror Y.Docs on the main thread (for TipTap binding)
  private mirrorDocs = new Map<string, MirrorDocEntry>()

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

  // ─── Documents ────────────────────────────────────────────────────────────────

  /**
   * Acquire a Y.Doc for editing.
   *
   * Implements the split Y.Doc pattern:
   * 1. Worker maintains "source of truth" Y.Doc (handles persistence & network sync)
   * 2. Main thread gets a mirror Y.Doc for TipTap binding
   * 3. Updates flow bidirectionally:
   *    - Local edits → worker (for persistence & broadcast)
   *    - Remote edits → main thread (for rendering)
   */
  async acquireDoc(nodeId: string): Promise<AcquiredDoc> {
    if (!this.initialized) {
      throw new Error('WorkerBridge not initialized')
    }

    // Check if we already have a mirror for this doc
    const existing = this.mirrorDocs.get(nodeId)
    if (existing) {
      return {
        doc: existing.doc,
        awareness: existing.awareness
      }
    }

    // Create the mirror Y.Doc on the main thread
    const mirrorDoc = new Y.Doc({ guid: nodeId, gc: false })
    const awareness = new Awareness(mirrorDoc)

    // Track whether we're applying a remote update to avoid loops
    let applyingRemote = false

    // Acquire doc from worker - this gives us the initial state
    // and sets up the worker to forward remote updates to us
    const acquired = await this.remote.acquireDoc(
      nodeId,
      proxy((update: Uint8Array, _origin: string) => {
        // Remote update from worker - apply to our mirror doc
        applyingRemote = true
        try {
          Y.applyUpdate(mirrorDoc, update, 'remote')
        } finally {
          applyingRemote = false
        }
      })
    )

    // Apply initial state from worker to our mirror doc
    if (acquired.state.length > 0) {
      Y.applyUpdate(mirrorDoc, acquired.state, 'initial')
    }

    // Listen for local updates and forward to worker
    const updateHandler = (update: Uint8Array, origin: unknown) => {
      // Don't forward updates that came from the worker (would cause loop)
      if (applyingRemote || origin === 'remote' || origin === 'initial') {
        return
      }

      // Forward local edit to worker
      // The worker will persist it and broadcast to network
      this.remote.applyLocalUpdate(nodeId, update)
    }
    mirrorDoc.on('update', updateHandler)

    // Store the entry
    const entry: MirrorDocEntry = {
      doc: mirrorDoc,
      awareness,
      applyingRemote: false,
      cleanup: () => {
        mirrorDoc.off('update', updateHandler)
        awareness.destroy()
      }
    }
    this.mirrorDocs.set(nodeId, entry)

    return {
      doc: mirrorDoc,
      awareness
    }
  }

  /**
   * Release a Y.Doc when no longer editing.
   * The worker continues syncing in the background.
   */
  releaseDoc(nodeId: string): void {
    const entry = this.mirrorDocs.get(nodeId)
    if (!entry) return

    // Clean up the mirror doc
    entry.cleanup()
    entry.doc.destroy()

    // Remove from our map
    this.mirrorDocs.delete(nodeId)

    // Tell the worker to release (it may keep in pool for background sync)
    this.remote.releaseDoc(nodeId)
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  destroy(): void {
    // Clean up all mirror docs
    for (const entry of this.mirrorDocs.values()) {
      entry.cleanup()
      entry.doc.destroy()
    }
    this.mirrorDocs.clear()

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
