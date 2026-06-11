/**
 * @xnetjs/data-bridge - Types and interfaces
 *
 * The DataBridge is the abstraction layer that hides platform-specific
 * implementation details from React hooks. It allows moving storage,
 * sync, and crypto off the main thread while keeping the React API unchanged.
 */

import type { RemoteNodeQueryClient } from './remote-query-protocol'
import type {
  DefinedSchema,
  PropertyBuilder,
  InferCreateProps,
  NodeState,
  NodeChangeEvent,
  ListNodesOptions,
  NodeQueryPlanMetadata,
  NodeQueryPageCountMode,
  NodeBatchWriteInput,
  NodeBatchWriteResult,
  TransactionOperation
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

export type QuerySpatialPoint = {
  x: number
  y: number
}

export type QuerySpatialRect = QuerySpatialPoint & {
  width: number
  height: number
}

export type QuerySpatialPointFields = {
  x: string
  y: string
}

export type QuerySpatialRectFields = QuerySpatialPointFields & {
  width?: string
  height?: string
}

export type QuerySpatialWindow = {
  kind: 'window'
  rect: QuerySpatialRect
  fields: QuerySpatialRectFields
  overscan?: number
}

export type QuerySpatialRadius = {
  kind: 'radius'
  center: QuerySpatialPoint
  radius: number
  fields: QuerySpatialPointFields
}

export type QuerySpatialFilter = QuerySpatialWindow | QuerySpatialRadius

export type QuerySearchField = 'title' | 'content'

export type QuerySearchFilter = {
  text: string
  fields?: QuerySearchField[]
}

export type QueryMaterializedViewOptions = {
  viewId: string
  maxAgeMs?: number
  forceRefresh?: boolean
}

export type QueryPageCountMode = NodeQueryPageCountMode

export type QueryExecutionMode = 'local' | 'local-then-remote' | 'remote' | 'live' | 'stream'

export type QuerySourcePreference = 'auto' | 'local' | 'hub' | 'federated'

export type QueryPageOptions = {
  first: number
  after?: string
  count?: NodeQueryPageCountMode
}

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
  /** Recommended forward-compatible pagination shape. `first` lowers to `limit`. */
  page?: QueryPageOptions
  /** Spatial filtering for viewport windows, canvases, or geo-style proximity queries */
  spatial?: QuerySpatialFilter
  /** Tokenized full-text search over searchable node fields */
  search?: string | QuerySearchFilter
  /** Stable database view cache key for JIT materialized result sets */
  materializedView?: string | QueryMaterializedViewOptions
  /** Future execution mode hint. Local execution remains the only active runtime today. */
  mode?: QueryExecutionMode
  /** Future source preference hint for hub or federated reads. */
  source?: QuerySourcePreference
}

/**
 * Canonical descriptor for a live query.
 * Shared across hooks and bridge implementations.
 */
export interface QueryDescriptor {
  /** Schema IRI for the query */
  schemaId: import('@xnetjs/data').SchemaIRI
  /** Optional single-node query */
  nodeId?: string
  /** Normalized property filters */
  where?: Record<string, unknown>
  /** Whether soft-deleted nodes are included */
  includeDeleted: boolean
  /** Normalized ordering rules */
  orderBy?: Record<string, SortDirection>
  /** Limit applied after filtering and sorting */
  limit?: number
  /** Offset applied after filtering and sorting */
  offset?: number
  /** Cursor applied after filtering and sorting */
  after?: string
  /** Count strategy requested by the page options */
  count?: NodeQueryPageCountMode
  /** Optional spatial filter metadata used by canvas-style queries */
  spatial?: QuerySpatialFilter
  /** Optional full-text filter metadata */
  search?: QuerySearchFilter
  /** Optional stable view cache key for storage-backed materialization */
  materializedView?: QueryMaterializedViewOptions
  /** Execution mode hint for routing local, remote, live, or streamed reads */
  mode?: QueryExecutionMode
  /** Preferred read source for future hub/federated execution */
  source?: QuerySourcePreference
}

export type QuerySource = 'local' | 'memory' | 'hub' | 'federated' | 'hybrid'

export type NodeQueryRouterThresholds = {
  /** Local row counts below this value stay local for `source: "auto"` reads. */
  localRowThreshold: number
  /** Local row counts at or above this value prefer a hub refresh for `source: "auto"` reads. */
  hybridRowThreshold: number
  /** Full-text descriptors request remote completion when a remote client exists. */
  searchToRemote: boolean
  /** Spatial descriptors request remote completion when a remote client exists. */
  spatialToRemote: boolean
}

export type QueryRoutingMetadata = {
  source: QuerySource
  reason: string
  localRowCount?: number
  thresholds: Pick<NodeQueryRouterThresholds, 'localRowThreshold' | 'hybridRowThreshold'>
}

export interface QueryPageInfo {
  totalCount: number | null
  countMode: QueryPageCountMode
  hasMore: boolean
  hasNextPage: boolean
  hasPreviousPage: boolean
  startCursor?: string
  endCursor?: string
  loadedCount: number
}

export interface QueryMaterializedMetadata {
  viewId: string
  cacheHit: boolean
  generatedAt: number
  invalidatedAt?: number
  rowCount: number
}

export type QueryCompletenessMetadata = {
  level: 'complete' | 'partial' | 'unknown'
  reason?:
    | 'auth-filtered'
    | 'federation-partial'
    | 'page-limited'
    | 'remote-unavailable'
    | 'source-timeout'
    | 'verification-failed'
  sourceCount?: number
}

export type QueryStalenessMetadata = {
  level: 'fresh' | 'stale' | 'unknown'
  asOf?: number
  maxAgeMs?: number
}

export type QueryVerificationMetadata = {
  status: 'verified' | 'unverified' | 'failed' | 'mixed'
  verifiedNodeIds?: string[]
  failedNodeIds?: string[]
}

export type QueryStreamProgressPhase =
  | 'connecting'
  | 'snapshot'
  | 'catching-up'
  | 'live'
  | 'reconnecting'
  | 'complete'

export type QueryStreamProgress = {
  phase: QueryStreamProgressPhase
  loaded?: number
  total?: number | null
  message?: string
}

export type QueryStreamResetReason =
  | 'descriptor-changed'
  | 'reconnect'
  | 'server-reset'
  | 'client-reset'

export type QueryStreamStatus = 'idle' | 'loading' | 'ready' | 'error'

export type QueryStreamEventType =
  | 'snapshot'
  | 'insert'
  | 'update'
  | 'delete'
  | 'reset'
  | 'progress'
  | 'error'

export type QueryStreamMetadata = {
  status: QueryStreamStatus
  lastEvent: QueryStreamEventType
  lastEventAt: number
  progress?: QueryStreamProgress | null
  error?: string | null
  resetReason?: QueryStreamResetReason
}

export interface QueryMetadata {
  source: QuerySource
  updatedAt: number
  pageInfo: QueryPageInfo
  plan?: NodeQueryPlanMetadata
  materialized?: QueryMaterializedMetadata
  routing?: QueryRoutingMetadata
  completeness?: QueryCompletenessMetadata
  staleness?: QueryStalenessMetadata
  verification?: QueryVerificationMetadata
  stream?: QueryStreamMetadata
  error?: string
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

  /** Get current query metadata, if the bridge can provide it. */
  getMetadata?(): QueryMetadata | null

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

/**
 * Result of a bridge-level atomic transaction.
 *
 * A structured-clone-safe subset of NodeStore's `TransactionResult`: the
 * signed change list stays on the data thread; callers only need the
 * materialized results and temp ID mapping.
 */
export interface BridgeTransactionResult {
  /** The batch ID shared by all changes */
  batchId: string
  /** Results for each operation (NodeState or null for delete) */
  results: (NodeState | null)[]
  /** Map from temp ID → generated real ID (empty if no temp IDs were used) */
  tempIds: Record<string, string>
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
  /** Optional main-thread remote Node query client for progressive hub/federated reads. */
  remoteNodeQueryClient?: RemoteNodeQueryClient
  /** Optional source:auto routing thresholds for main-thread Node descriptor reads. */
  remoteNodeQueryRouting?: Partial<NodeQueryRouterThresholds>
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

  /**
   * Force a reload for a canonical query descriptor.
   */
  reloadQuery?(descriptor: QueryDescriptor): Promise<void>

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

  /**
   * Execute a storage-owned batch write when the runtime supports it.
   */
  bulkWrite(input: NodeBatchWriteInput): Promise<NodeBatchWriteResult>

  /**
   * Execute multiple operations atomically with temp ID resolution.
   *
   * All operations succeed or fail together. Implemented by every bridge
   * that owns (or proxies to) a transaction-capable NodeStore; consumers
   * should feature-detect rather than reaching for `bridge.nodeStore`.
   */
  transaction?(operations: TransactionOperation[]): Promise<BridgeTransactionResult>

  // ─── Documents ──────────────────────────────────────────

  /**
   * Acquire a Y.Doc for editing. Returns the doc with current state.
   * The doc receives updates from the data thread via the bridge.
   */
  acquireDoc?(nodeId: string): Promise<AcquiredDoc>

  /**
   * Release a Y.Doc when no longer editing.
   * The data thread continues syncing in the background.
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
   *
   * @deprecated Reach for bridge-level APIs (`transaction`, `bulkWrite`,
   * `get`, `subscribeToChanges`) instead — worker-backed bridges have no
   * main-thread store, so this is `undefined` there. Long-lived services
   * (SyncManager, search indexing, devtools) should use the provider-owned
   * store from XNetProvider context, not the bridge.
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
