/**
 * DataWorker - Web Worker for off-main-thread data operations
 *
 * This worker runs NodeStore, IndexedDB, and query operations off the main thread.
 * It exposes an API via Comlink that WorkerBridge uses from the main thread.
 *
 * Key responsibilities:
 * - Initialize and manage NodeStore with IndexedDB storage
 * - Handle query subscriptions and notify on changes
 * - Execute CRUD operations
 * - (Future) Manage sync engine, Y.Doc pool, crypto
 */

import type {
  WorkerConfig,
  SerializedQueryOptions,
  QueryDelta,
  WorkerSubscription,
  DataWorkerAPI
} from './worker-types'
import type { SyncStatus } from '../types'
import type { DID } from '@xnet/core'
import {
  NodeStore,
  IndexedDBNodeStorageAdapter,
  type NodeState,
  type NodeChangeEvent,
  type SchemaIRI
} from '@xnet/data'
import { expose, proxy } from 'comlink'
import { QueryCache } from '../query-cache'

// ─── DataWorker Class ────────────────────────────────────────────────────────

class DataWorker implements DataWorkerAPI {
  private store: NodeStore | null = null
  private storage: IndexedDBNodeStorageAdapter | null = null
  private subscriptions = new Map<
    string,
    WorkerSubscription & { onDelta: (delta: QueryDelta) => void }
  >()
  private cache = new QueryCache()
  private status: SyncStatus = 'disconnected'
  private statusHandlers = new Set<(status: SyncStatus) => void>()
  private storeUnsubscribe: (() => void) | null = null

  async initialize(config: WorkerConfig): Promise<void> {
    // Create IndexedDB storage adapter
    this.storage = new IndexedDBNodeStorageAdapter({ dbName: config.dbName })
    await this.storage.open()

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
    const nodes = await this.loadQuery(schemaId as SchemaIRI, options)

    // Store subscription with proxied callback
    this.subscriptions.set(queryId, {
      schemaId: schemaId as SchemaIRI,
      options,
      lastResult: nodes,
      onDelta: proxy(onDelta)
    })

    return nodes
  }

  async unsubscribe(queryId: string): Promise<void> {
    this.subscriptions.delete(queryId)
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

    // Close storage
    if (this.storage) {
      await this.storage.close()
      this.storage = null
    }

    // Clear state
    this.store = null
    this.subscriptions.clear()
    this.cache.clear()
    this.statusHandlers.clear()

    this.setStatus('disconnected')
  }

  // ─── Private Methods ─────────────────────────────────────────────────────────

  private async loadQuery(
    schemaId: SchemaIRI,
    options: SerializedQueryOptions
  ): Promise<NodeState[]> {
    if (!this.store) return []

    let nodes: NodeState[]

    if (options.nodeId) {
      // Single node query
      const node = await this.store.get(options.nodeId)
      nodes = node && node.schemaId === schemaId && !node.deleted ? [node] : []
    } else {
      // List query
      nodes = await this.store.list({
        schemaId,
        includeDeleted: options.includeDeleted,
        limit: options.limit,
        offset: options.offset
      })
    }

    // Apply filtering
    nodes = this.cache.filterNodes(nodes, options)

    // Apply sorting
    nodes = this.cache.sortNodes(nodes, options)

    return nodes
  }

  private handleStoreChange(event: NodeChangeEvent): void {
    const { node, change } = event
    const schemaId: SchemaIRI | undefined = node?.schemaId ?? change.payload.schemaId

    if (!schemaId) return

    // Find subscriptions that match this schema
    for (const [queryId, sub] of this.subscriptions) {
      if (sub.schemaId !== schemaId) continue

      // Compute delta
      const delta = this.computeDelta(event, sub)
      if (delta) {
        // Update lastResult
        this.applyDeltaToSubscription(queryId, delta)
        // Notify main thread
        sub.onDelta(delta)
      }
    }
  }

  private computeDelta(event: NodeChangeEvent, sub: WorkerSubscription): QueryDelta | null {
    const { node, change } = event

    // Check if node passes the subscription's filter
    const passesFilter = node ? this.nodeMatchesFilter(node, sub.options) : false

    // Find existing node in lastResult
    const existingIndex = sub.lastResult.findIndex((n) => n.id === change.payload.nodeId)

    // Determine delta type
    if (existingIndex >= 0) {
      // Node was in previous result
      if (!node || node.deleted || !passesFilter) {
        // Node was removed or no longer matches
        return { type: 'remove', nodeId: change.payload.nodeId }
      } else {
        // Node was updated
        return { type: 'update', nodeId: node.id, node }
      }
    } else {
      // Node was not in previous result
      if (node && !node.deleted && passesFilter) {
        // Node should be added
        return { type: 'add', node, index: sub.lastResult.length }
      }
    }

    return null
  }

  private nodeMatchesFilter(node: NodeState, options: SerializedQueryOptions): boolean {
    // Check deleted
    if (node.deleted && !options.includeDeleted) {
      return false
    }

    // Check where clause
    if (options.where) {
      for (const [key, value] of Object.entries(options.where)) {
        if (node.properties[key] !== value) {
          return false
        }
      }
    }

    return true
  }

  private applyDeltaToSubscription(queryId: string, delta: QueryDelta): void {
    const sub = this.subscriptions.get(queryId)
    if (!sub) return

    switch (delta.type) {
      case 'add':
        sub.lastResult = [...sub.lastResult, delta.node]
        break
      case 'remove':
        sub.lastResult = sub.lastResult.filter((n) => n.id !== delta.nodeId)
        break
      case 'update':
        sub.lastResult = sub.lastResult.map((n) => (n.id === delta.nodeId ? delta.node : n))
        break
    }
  }

  private setStatus(status: SyncStatus): void {
    this.status = status
    for (const handler of this.statusHandlers) {
      handler(status)
    }
  }
}

// ─── Expose Worker API ───────────────────────────────────────────────────────

expose(new DataWorker())
