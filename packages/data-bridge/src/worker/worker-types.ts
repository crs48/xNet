/**
 * Types for worker-main thread communication
 *
 * These types define the contract between the DataWorker running in a
 * Web Worker and the WorkerBridge on the main thread.
 */

import type { QueryDescriptor, SyncStatus } from '../types'
import type { NodeState, SchemaIRI } from '@xnetjs/data'

// ─── Document Types ──────────────────────────────────────────────────────────

/**
 * Result from acquiring a Y.Doc in the worker.
 * The state is sent as a Uint8Array for efficient transfer.
 */
export interface WorkerAcquiredDoc {
  /** The node ID this doc belongs to */
  nodeId: string
  /** Encoded Y.Doc state (Y.encodeStateAsUpdate) */
  state: Uint8Array
  /** Client ID for this connection */
  clientId: number
}

/**
 * Document update message from worker to main thread
 */
export interface DocUpdateMessage {
  type: 'doc-update'
  nodeId: string
  /** Yjs update (Uint8Array) */
  update: Uint8Array
  /** Origin of the update (e.g., 'remote', 'local') */
  origin: string
}

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Configuration passed to the worker on initialization
 */
export interface WorkerConfig {
  /** Database name for IndexedDB */
  dbName: string
  /** Author's DID for signing changes */
  authorDID: string
  /** Ed25519 signing key (serialized as array for transfer) */
  signingKey: number[]
}

// ─── Query Types ─────────────────────────────────────────────────────────────

/**
 * Serialized query options (sent to worker)
 */
export interface SerializedQueryOptions {
  nodeId?: string
  where?: Record<string, unknown>
  includeDeleted?: boolean
  orderBy?: Record<string, 'asc' | 'desc'>
  limit?: number
  offset?: number
}

/**
 * Delta update types for incremental cache updates
 */
export type QueryDelta =
  | { type: 'add'; node: NodeState; index: number }
  | { type: 'remove'; nodeId: string }
  | { type: 'update'; nodeId: string; node: NodeState }
  | { type: 'reload'; data: NodeState[] }

/**
 * Internal subscription tracking in the worker
 */
export interface WorkerSubscription {
  schemaId: SchemaIRI
  descriptor: QueryDescriptor
  options: SerializedQueryOptions
  lastResult: NodeState[]
}

// ─── Worker API ──────────────────────────────────────────────────────────────

/**
 * The API exposed by the DataWorker via Comlink.
 * This is what WorkerBridge calls on the main thread.
 */
export interface DataWorkerAPI {
  /**
   * Initialize the worker with configuration.
   * Must be called before any other method.
   */
  initialize(config: WorkerConfig): Promise<void>

  /**
   * Subscribe to a query. Returns initial results.
   * Delta updates are sent via the callback.
   */
  subscribe(
    queryId: string,
    schemaId: string,
    options: SerializedQueryOptions,
    onDelta: (delta: QueryDelta) => void
  ): Promise<NodeState[]>

  /**
   * Unsubscribe from a query.
   */
  unsubscribe(queryId: string): Promise<void>

  /**
   * Force a targeted reload for an existing subscription.
   */
  reloadQuery(queryId: string): Promise<NodeState[]>

  /**
   * Create a new node.
   */
  create(schemaId: string, data: Record<string, unknown>, id?: string): Promise<NodeState>

  /**
   * Update an existing node.
   */
  update(nodeId: string, changes: Record<string, unknown>): Promise<NodeState>

  /**
   * Delete a node (soft delete).
   */
  delete(nodeId: string): Promise<void>

  /**
   * Restore a deleted node.
   */
  restore(nodeId: string): Promise<NodeState>

  /**
   * Get a single node by ID.
   */
  get(nodeId: string): Promise<NodeState | null>

  // ─── Document Operations ────────────────────────────────────────────────────

  /**
   * Acquire a Y.Doc for editing.
   * Returns the current state which should be applied to the main-thread mirror doc.
   *
   * @param nodeId - The node ID to acquire
   * @param onUpdate - Callback for receiving updates from the worker (remote changes)
   * @returns The initial doc state and client ID
   */
  acquireDoc(
    nodeId: string,
    onUpdate: (update: Uint8Array, origin: string) => void
  ): Promise<WorkerAcquiredDoc>

  /**
   * Release a Y.Doc when no longer editing.
   * The doc stays in the pool for background sync.
   */
  releaseDoc(nodeId: string): void

  /**
   * Apply a local update from the main-thread mirror doc to the worker's source-of-truth doc.
   * The worker will broadcast this to the network.
   *
   * @param nodeId - The node ID
   * @param update - The Yjs update (from Y.encodeStateAsUpdate or update event)
   */
  applyLocalUpdate(nodeId: string, update: Uint8Array): void

  // ─── Status ─────────────────────────────────────────────────────────────────

  /**
   * Get current sync status.
   */
  getStatus(): SyncStatus

  /**
   * Subscribe to status changes.
   */
  onStatusChange(handler: (status: SyncStatus) => void): void

  /**
   * Clean up and close the worker.
   */
  destroy(): Promise<void>
}
