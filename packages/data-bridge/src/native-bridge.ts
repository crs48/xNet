/**
 * NativeBridge - DataBridge implementation for React Native/Expo
 *
 * Phase 5 implementation that provides the DataBridge interface for React Native.
 *
 * Architecture:
 * - Uses expo-sqlite for storage (runs on native thread)
 * - Uses NodeStore on JS thread (can be moved to JSI in future)
 * - Provides same API as MainThreadBridge/WorkerBridge
 *
 * Future enhancements:
 * - Turbo Module for heavy operations (crypto, queries)
 * - JSI bindings for direct native access
 * - Native WebSocket for sync
 */

import type {
  DataBridge,
  QueryDescriptor,
  QuerySubscription,
  QueryOptions,
  SyncStatus,
  AcquiredDoc,
  DataBridgeConfig
} from './types'
import type {
  NodeStore,
  NodeState,
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  NodeChangeEvent,
  ListNodesOptions
} from '@xnetjs/data'
import { QueryCache } from './query-cache'
import {
  applyNodeChangeToQueryResult,
  applyQueryDescriptor,
  createQueryDescriptor,
  serializeQueryDescriptor
} from './query-descriptor'

// ─── Native Storage Interface ─────────────────────────────────────────────────

/**
 * Interface for native storage adapters (expo-sqlite, etc.)
 * This allows the NativeBridge to work with different storage backends.
 */
export interface NativeStorageAdapter {
  /** Open the database */
  open(): Promise<void>
  /** Close the database */
  close(): Promise<void>
  /** Get a document by ID */
  getDocument(id: string): Promise<{ content: Uint8Array } | null>
  /** Set a document */
  setDocument(id: string, content: Uint8Array): Promise<void>
  /** Delete a document */
  deleteDocument(id: string): Promise<void>
  /** List all document IDs */
  listDocuments(): Promise<string[]>
}

// ─── NativeBridge Configuration ───────────────────────────────────────────────

export interface NativeBridgeConfig {
  /** The NodeStore instance to use */
  store: NodeStore
  /** Optional native storage adapter for Y.Doc persistence */
  storageAdapter?: NativeStorageAdapter
  /** Signaling server URL for sync (optional, default: no sync) */
  signalingUrl?: string
}

// ─── NativeBridge Class ───────────────────────────────────────────────────────

/**
 * DataBridge implementation for React Native/Expo.
 *
 * This implementation runs on the JS thread but is designed to work with
 * React Native's architecture. Storage operations use expo-sqlite which
 * runs on a native thread.
 *
 * For now, this is similar to MainThreadBridge but structured for RN.
 * Future versions will add Turbo Module integration for off-thread operations.
 */
export class NativeBridge implements DataBridge {
  private store: NodeStore
  private cache: QueryCache
  private statusListeners = new Set<(status: SyncStatus) => void>()
  private storeUnsubscribe: (() => void) | null = null
  private storageAdapter?: NativeStorageAdapter
  private _status: SyncStatus = 'disconnected'
  private destroyed = false

  constructor(config: NativeBridgeConfig) {
    this.store = config.store
    this.storageAdapter = config.storageAdapter
    this.cache = new QueryCache()

    // Subscribe to store changes for cache invalidation
    this.storeUnsubscribe = this.store.subscribe((event) => {
      this.handleStoreChange(event)
    })

    // Mark as connected since we're local-only for now
    this._status = 'connected'
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
    if (this.destroyed) return

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

      if (!this.destroyed) {
        this.cache.set(queryId, applyQueryDescriptor(nodes, descriptor), descriptor)
      }
    } catch (err) {
      console.error('[NativeBridge] Failed to load query:', err)
      if (!this.destroyed) {
        // Set empty array on error so we don't keep retrying
        this.cache.set(queryId, [], descriptor)
      }
    }
  }

  /**
   * Handle store changes and invalidate affected caches.
   */
  private handleStoreChange(event: NodeChangeEvent): void {
    if (this.destroyed) return

    const { node, change } = event
    const schemaId = node?.schemaId ?? change.payload.schemaId

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
    if (this.destroyed) {
      throw new Error('NativeBridge has been destroyed')
    }
    return this.store.create({
      id,
      schemaId: schema._schemaId,
      properties: data as Record<string, unknown>
    })
  }

  async update(nodeId: string, changes: Record<string, unknown>): Promise<NodeState> {
    if (this.destroyed) {
      throw new Error('NativeBridge has been destroyed')
    }
    return this.store.update(nodeId, { properties: changes })
  }

  async delete(nodeId: string): Promise<void> {
    if (this.destroyed) {
      throw new Error('NativeBridge has been destroyed')
    }
    await this.store.delete(nodeId)
  }

  async restore(nodeId: string): Promise<NodeState> {
    if (this.destroyed) {
      throw new Error('NativeBridge has been destroyed')
    }
    return this.store.restore(nodeId)
  }

  // ─── Documents ─────────────────────────────────────────

  /**
   * Acquire a Y.Doc for editing.
   *
   * Note: Y.Doc management in React Native is limited compared to web.
   * For now, this throws an error. Future versions will support Y.Doc
   * via native WebSocket sync or JSI bindings.
   */
  async acquireDoc(_nodeId: string): Promise<AcquiredDoc> {
    // TODO: Implement Y.Doc support for React Native
    // Options:
    // 1. Use y-websocket with native WebSocket
    // 2. Implement Turbo Module for Y.Doc sync
    // 3. Use expo-updates for offline sync
    throw new Error(
      'Y.Doc editing is not yet supported in NativeBridge. ' +
        'Use a WebView-based editor or wait for Turbo Module support.'
    )
  }

  /**
   * Release a Y.Doc when no longer editing.
   */
  releaseDoc(_nodeId: string): void {
    // No-op for now since acquireDoc isn't implemented
  }

  // ─── Lifecycle ──────────────────────────────────────────

  /**
   * Initialize the bridge.
   * Opens storage adapter if provided.
   */
  async initialize(_config: DataBridgeConfig): Promise<void> {
    if (this.storageAdapter) {
      await this.storageAdapter.open()
    }
  }

  destroy(): void {
    this.destroyed = true

    if (this.storeUnsubscribe) {
      this.storeUnsubscribe()
      this.storeUnsubscribe = null
    }

    if (this.storageAdapter) {
      this.storageAdapter.close().catch((err) => {
        console.error('[NativeBridge] Failed to close storage:', err)
      })
    }

    this.cache.clear()
    this.statusListeners.clear()
    this._status = 'disconnected'
  }

  // ─── Status ─────────────────────────────────────────────

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

  private setStatus(status: SyncStatus): void {
    if (this._status !== status) {
      this._status = status
      for (const listener of this.statusListeners) {
        listener(status)
      }
    }
  }

  // ─── Direct Store Access (compatibility) ────────────────

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

// ─── Factory Function ─────────────────────────────────────────────────────────

/**
 * Create a NativeBridge from a NodeStore.
 */
export function createNativeBridge(config: NativeBridgeConfig): NativeBridge {
  return new NativeBridge(config)
}

// ─── Platform Detection ───────────────────────────────────────────────────────

/**
 * Check if we're running in a React Native environment.
 */
export function isReactNative(): boolean {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative'
}

/**
 * Check if we're running in Expo.
 */
export function isExpo(): boolean {
  // @ts-expect-error - Expo global
  return typeof global !== 'undefined' && global.expo !== undefined
}
