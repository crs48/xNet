/**
 * @xnetjs/data-bridge - Types and interfaces
 *
 * The DataBridge is the abstraction layer that hides platform-specific
 * implementation details from React hooks. It allows moving storage,
 * sync, and crypto off the main thread while keeping the React API unchanged.
 */

import type {
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  NodeState,
  NodeChangeEvent,
  ListNodesOptions
} from '@xnetjs/data'
import type { Awareness } from 'y-protocols/awareness'
import type { Doc as YDoc } from 'yjs'

// ─── Query Types ─────────────────────────────────────────────────────────────

/**
 * Sort direction for ordering results
 */
export type SortDirection = 'asc' | 'desc'

/**
 * System fields that can be used for ordering
 */
export type SystemOrderField = 'createdAt' | 'updatedAt'

/**
 * Options for querying nodes via the DataBridge.
 * Maps to the filter options used by useQuery.
 */
export interface QueryOptions<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> {
  /** Filter by single node ID (makes this a single-node query) */
  nodeId?: string
  /** Filter conditions (property: value) */
  where?: Partial<InferCreateProps<P>>
  /** Include soft-deleted nodes */
  includeDeleted?: boolean
  /** Sort by property or system field */
  orderBy?: { [K in keyof InferCreateProps<P> | SystemOrderField]?: SortDirection }
  /** Limit results */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/**
 * A subscription to a query result.
 * Compatible with React's useSyncExternalStore pattern.
 *
 * @typeParam P - Property builder type (unused at runtime, for type inference)
 */
export interface QuerySubscription<
  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> {
  /** Get current snapshot (synchronous - reads from cache). Returns null if loading. */
  getSnapshot(): NodeState[] | null

  /** Subscribe to updates (React will call this) */
  subscribe(callback: () => void): () => void
}

// ─── Mutation Types ──────────────────────────────────────────────────────────

/**
 * Result of a create operation
 */
export interface CreateResult {
  node: NodeState
}

/**
 * Result of an update operation
 */
export interface UpdateResult {
  node: NodeState
}

// ─── Document Types ──────────────────────────────────────────────────────────

/**
 * Result of acquiring a Y.Doc for editing.
 * The doc is kept in sync with the data thread via the bridge.
 */
export interface AcquiredDoc {
  /** The Y.Doc instance (on main thread for TipTap binding) */
  doc: YDoc
  /** Awareness instance for presence/cursors */
  awareness: Awareness
}

// ─── Sync Status ─────────────────────────────────────────────────────────────

/**
 * Sync connection status
 */
export type SyncStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

// ─── Configuration ───────────────────────────────────────────────────────────

/**
 * Configuration for initializing a DataBridge
 */
export interface DataBridgeConfig {
  /** Database name for storage */
  dbName?: string
  /** Author's DID for signing changes */
  authorDID: string
  /** Ed25519 signing key */
  signingKey: Uint8Array
  /** Signaling server URL for sync */
  signalingUrl?: string
}

// ─── DataBridge Interface ────────────────────────────────────────────────────

/**
 * The DataBridge interface abstracts data access across different platforms.
 *
 * Implementations:
 * - MainThreadBridge: Direct NodeStore access (Phase 0, fallback)
 * - WorkerBridge: Web Worker via Comlink (Phase 1)
 * - IPCBridge: Electron utility process (Phase 2)
 * - NativeBridge: React Native Turbo Module (Phase 5)
 *
 * All implementations provide the same API, allowing React hooks to work
 * identically across all platforms.
 */
export interface DataBridge {
  // ─── Queries ────────────────────────────────────────────

  /**
   * Create a subscription to a query result.
   * Returns an object compatible with useSyncExternalStore.
   *
   * The subscription loads data asynchronously and updates the cache.
   * getSnapshot() returns null while loading, then the result array.
   */
  query<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    options?: QueryOptions<P>
  ): QuerySubscription<P>

  // ─── Mutations ──────────────────────────────────────────

  /**
   * Create a new node.
   */
  create<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    data: InferCreateProps<P>,
    id?: string
  ): Promise<NodeState>

  /**
   * Update an existing node.
   */
  update(nodeId: string, changes: Record<string, unknown>): Promise<NodeState>

  /**
   * Soft-delete a node.
   */
  delete(nodeId: string): Promise<void>

  /**
   * Restore a soft-deleted node.
   */
  restore(nodeId: string): Promise<NodeState>

  // ─── Documents ──────────────────────────────────────────

  /**
   * Acquire a Y.Doc for editing. Returns the doc with current state.
   * The doc receives updates from the data thread via the bridge.
   *
   * Note: Phase 0 (MainThreadBridge) does not implement this method.
   * It will be implemented in Phase 3 when Y.Doc split architecture is added.
   */
  acquireDoc?(nodeId: string): Promise<AcquiredDoc>

  /**
   * Release a Y.Doc when no longer editing.
   * The data thread continues syncing in the background.
   *
   * Note: Phase 0 (MainThreadBridge) does not implement this method.
   */
  releaseDoc?(nodeId: string): void

  // ─── Lifecycle ──────────────────────────────────────────

  /**
   * Initialize the bridge with configuration.
   * For MainThreadBridge, this is a no-op (already initialized with NodeStore).
   */
  initialize?(config: DataBridgeConfig): Promise<void>

  /**
   * Clean up resources.
   */
  destroy(): void

  // ─── Status ─────────────────────────────────────────────

  /**
   * Current sync status.
   */
  readonly status: SyncStatus

  /**
   * Subscribe to status changes.
   */
  on(event: 'status', handler: (status: SyncStatus) => void): () => void

  // ─── Direct Store Access (Phase 0 only) ─────────────────

  /**
   * Get the underlying NodeStore directly.
   * Only available in MainThreadBridge for backward compatibility.
   * Will be removed in later phases.
   */
  readonly nodeStore?: import('@xnetjs/data').NodeStore

  /**
   * Subscribe to store changes directly.
   * Only available in MainThreadBridge for backward compatibility.
   */
  subscribeToChanges?(listener: (event: NodeChangeEvent) => void): () => void

  /**
   * Get a single node by ID directly.
   * Only available in MainThreadBridge for backward compatibility.
   */
  get?(nodeId: string): Promise<NodeState | null>

  /**
   * List nodes with options directly.
   * Only available in MainThreadBridge for backward compatibility.
   */
  list?(options?: ListNodesOptions): Promise<NodeState[]>
}
