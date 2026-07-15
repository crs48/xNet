/**
 * NodeStore types - Event-sourced storage for Nodes
 *
 * The NodeStore manages Nodes using Change<T> from @xnetjs/sync.
 * Each Node change is a Change with a NodePayload.
 *
 * Key design decisions:
 * - No operation types (create-item, update-item, etc.) - just Changes
 * - LWW conflict resolution using Lamport timestamps
 * - Changes store sparse updates (only changed properties)
 * - Materialized state computed by replaying Changes
 */

import type { NodeQueryDescriptor, NodeQueryResult, SortDirection, SystemOrderField } from './query'
import type { SchemaLookup } from './tempids'
import type { StoreAuthAPI } from '../auth/store-auth'
import type { LensRegistry } from '../schema/lens'
import type { SchemaIRI } from '../schema/node'
import type { AuthAction, AuthDecision, DID, ContentId, PolicyEvaluator } from '@xnetjs/core'
import type { SQLiteOperationStats } from '@xnetjs/sqlite'
import type { Change, ChangeSigner } from '@xnetjs/sync'

// ============================================================================
// Node ID Types
// ============================================================================

/** Unique identifier for a Node */
export type NodeId = string

/** Identifier for a property within a Node */
export type PropertyKey = string

// ============================================================================
// Change Payloads
// ============================================================================

/**
 * Payload for a Node change.
 *
 * Contains the sparse set of properties that changed.
 * First change for a nodeId implicitly creates the Node.
 * Setting a property to `undefined` deletes it.
 */
export interface NodePayload {
  /** The Node being changed */
  nodeId: NodeId

  /** Schema IRI (required on first change, optional on updates) */
  schemaId?: SchemaIRI

  /** Changed properties (sparse - only what changed) */
  properties: Record<PropertyKey, unknown>

  /** Soft delete flag (optional) */
  deleted?: boolean
}

/** A Change containing a NodePayload */
export type NodeChange = Change<NodePayload>

// ============================================================================
// Materialized State
// ============================================================================

/**
 * Timestamp metadata for a property value (for LWW resolution).
 */
export interface PropertyTimestamp {
  /** The Lamport logical time when this value was set */
  lamport: number
  /** Author DID for LWW tiebreak */
  author: DID
  /** Wall clock time (for display) */
  wallTime: number
  /**
   * Grinding-resistant LWW tiebreak key (exploration 0305;
   * `computeLwwTiebreakKey`). Present only for protocol v4+ writes; absent
   * (legacy) timestamps fall back to the author-DID tiebreak.
   */
  tiebreakKey?: string
}

/**
 * Materialized Node state with LWW metadata.
 *
 * This is computed by replaying all Changes for a nodeId.
 */
export interface NodeState {
  /** Node ID */
  id: NodeId

  /** Schema IRI */
  schemaId: SchemaIRI

  /** Current property values (after LWW resolution) */
  properties: Record<PropertyKey, unknown>

  /** LWW timestamps per property (for conflict resolution) */
  timestamps: Record<PropertyKey, PropertyTimestamp>

  /** Soft delete flag */
  deleted: boolean

  /** When deleted (if deleted) */
  deletedAt?: PropertyTimestamp

  /** Creation metadata */
  createdAt: number
  createdBy: DID

  /** Last update metadata */
  updatedAt: number
  updatedBy: DID

  /**
   * Serialized CRDT document content (for nodes with document type).
   * For Yjs: Uint8Array from Y.encodeStateAsUpdate()
   * Use Y.applyUpdate(ydoc, documentContent) to hydrate.
   */
  documentContent?: Uint8Array

  // ─── Version Compatibility Fields ─────────────────────────────────────────

  /**
   * Unknown properties from future schema versions.
   * Preserved on read and passed through on write for forward compatibility.
   * These properties exist in the change log but aren't known to the current schema.
   */
  _unknown?: Record<PropertyKey, unknown>

  /**
   * The schema version that last wrote to this node.
   * Used to detect when migrations might be needed.
   */
  _schemaVersion?: string
}

// ============================================================================
// Storage Adapter
// ============================================================================

/**
 * Storage adapter interface for NodeStore.
 *
 * Implementations can use SQLite or memory.
 * The adapter stores Changes and materialized NodeState.
 */
/**
 * Filters a candidate node set down to the rows the current viewer may read.
 * Only ever removes rows. Used by adapters to authorize a materialized view's
 * id list once, at refresh time (exploration 0226).
 */
export type NodeReadAuthorizer = (nodes: NodeState[]) => Promise<NodeState[]>

/**
 * A reload-stable version of the authorization-relevant control-plane state.
 * `count` and `maxUpdatedAt` over grants and `/sys/authz/` resources change
 * whenever any grant is added, modified, or removed.
 */
export interface AuthorizationStateVersion {
  count: number
  maxUpdatedAt: number
}

export interface NodeStorageAdapter {
  // Lifecycle (optional - for adapters that need initialization)
  /** Open/initialize the storage connection */
  open?(): Promise<void>
  /** Close the storage connection */
  close?(): Promise<void>
  /**
   * Execute a batch of storage operations as one adapter-owned transaction.
   *
   * Storage implementations pass a transaction-scoped adapter to `fn`; writes
   * through that adapter must not start their own nested transaction.
   */
  withTransaction?<T>(fn: (storage: NodeStorageAdapter) => Promise<T>): Promise<T>

  // Change log operations
  appendChange(change: NodeChange): Promise<void>
  getChanges(nodeId: NodeId): Promise<NodeChange[]>
  getAllChanges(): Promise<NodeChange[]>
  /** Get changes with Lamport time greater than `since` */
  getChangesSince(sinceLamport: number): Promise<NodeChange[]>
  getChangeByHash(hash: ContentId): Promise<NodeChange | null>
  /**
   * Whether a change with this hash is already in the log. Cheap existence
   * probe for idempotent redelivery (exploration 0296); callers fall back to
   * `getChangeByHash` when absent.
   */
  hasChange?(hash: ContentId): Promise<boolean>
  getLastChange(nodeId: NodeId): Promise<NodeChange | null>
  /** Return the latest change for each requested node id. Missing nodes are omitted. */
  getLastChangesByNodeId?(nodeIds: readonly NodeId[]): Promise<Map<NodeId, NodeChange>>
  /** Append multiple changes in one storage-owned write when supported. */
  appendChanges?(changes: readonly NodeChange[]): Promise<void>

  // Materialized state operations
  getNode(id: NodeId): Promise<NodeState | null>
  /** Return existing materialized nodes in input order. Missing nodes are omitted. */
  getNodes?(ids: readonly NodeId[]): Promise<NodeState[]>
  /** Return the subset of ids that currently exist in materialized storage. */
  getExistingNodeIds?(ids: readonly NodeId[]): Promise<NodeId[]>
  /** Return all read state needed to plan a node batch in one adapter-owned preflight. */
  getBatchPreflight?(ids: readonly NodeId[]): Promise<NodeBatchPreflightResult>
  setNode(node: NodeState, options?: SetNodeOptions): Promise<void>
  /** Import multiple materialized nodes in one storage-owned write when supported. */
  importNodes?(nodes: readonly NodeState[], options?: ImportNodesOptions): Promise<void>
  /** Apply materialized nodes, signed changes, sync state, and batch indexes in one write. */
  applyNodeBatch?(input: ApplyNodeBatchInput): Promise<ApplyNodeBatchResult>
  /** Rebuild secondary node indexes after an import that deferred index maintenance. */
  rebuildIndexesForSchemas?(
    schemaIds: readonly SchemaIRI[],
    options?: RebuildNodeIndexesOptions
  ): Promise<void>
  /**
   * Refresh query-planner statistics (ANALYZE). Call after a bulk import:
   * SQLite does not auto-maintain stats, so a large insert leaves the planner
   * "out of sync" and reads may pick full scans over indexes (exploration 0184).
   */
  analyze?(): Promise<void>
  /**
   * Incremental planner maintenance (`PRAGMA optimize`) — ANALYZEs only the
   * tables that drifted. Cheap; safe to call at idle and before close.
   */
  optimize?(): Promise<void>
  deleteNode(id: NodeId): Promise<void>
  listNodes(options?: ListNodesOptions): Promise<NodeState[]>
  countNodes(options?: CountNodesOptions): Promise<number>
  queryNodes?(descriptor: NodeQueryDescriptor): Promise<NodeQueryResult>
  /**
   * Inject the read-authorization filter the adapter applies before persisting
   * a materialized view's id list (exploration 0226). `NodeStore` wires this to
   * its `filterReadableNodes` so a materialization is authorized exactly once,
   * at refresh time, and cache hits can be served without per-row re-checks.
   * Pass `undefined` to clear it. Optional: adapters that don't implement it
   * simply never materialize under authorization (the store falls back to the
   * authorize-then-paginate path).
   */
  setNodeReadAuthorizer?(authorizer: NodeReadAuthorizer | undefined): void
  /**
   * A cheap, reload-stable version stamp of the authorization-relevant state
   * (grants + `/sys/authz/` resources). Folded into the materialized view's
   * auth fingerprint so any grant change invalidates cached views across
   * reloads. Optional; when absent the store will not materialize under authz.
   */
  getAuthorizationStateVersion?(): Promise<AuthorizationStateVersion>
  /** Optional runtime operation counters for import diagnostics. */
  getOperationStats?(): Promise<SQLiteOperationStats | null> | SQLiteOperationStats | null
  /** Reset optional runtime operation counters before a focused measurement. */
  resetOperationStats?(): Promise<void> | void

  // Sync state
  getLastLamportTime(): Promise<number>
  setLastLamportTime(time: number): Promise<void>

  /**
   * Per-room sync high-water mark (Lamport time) — the cursor a hub-sync
   * provider has confirmed the hub durably stores. Persisting this stops the
   * client replaying its entire change log on every reload (exploration 0206).
   * Optional: adapters that don't implement it degrade to replay-from-0.
   */
  getSyncCursor?(room: string): Promise<number>
  setSyncCursor?(room: string, lamport: number): Promise<void>

  /**
   * Generic app-state key/value, stored in an FK-free table. Used for blobs
   * that are *not* node documents (e.g. the sync registry's tracked-node set):
   * writing those through {@link setDocumentContent} hits `yjs_state`'s
   * `node_id → nodes(id)` foreign key and fails with SQLITE_CONSTRAINT_FOREIGNKEY
   * (exploration 0227). Optional: callers fall back to document content when an
   * adapter doesn't implement it.
   */
  getAppState?(key: string): Promise<string | null>
  setAppState?(key: string, value: string): Promise<void>

  // Document content operations (for nodes with CRDT document)
  getDocumentContent(nodeId: NodeId): Promise<Uint8Array | null>
  setDocumentContent(nodeId: NodeId, content: Uint8Array): Promise<void>

  /**
   * Pin registry (exploration 0329): keys pinned here are exempt from history
   * pruning and Yjs snapshot eviction. A key is either a change hash or a
   * `yjs:<nodeId>@<timestamp>` snapshot ref; owners (checkpoints, drafts)
   * release all their pins in one call when they are deleted. Blobs are NOT
   * pinned — referenced blobs past retention are an explicit blob horizon.
   * Optional: without it, pruning behaves as before (nothing is protected).
   */
  pins?: PinRegistry
}

/**
 * Checked-out draft overlay (exploration 0329): while set on a NodeStore,
 * reads of an original member id return its clone's content (under the
 * original id — MV id lists and grid ordering never see clone ids), writes
 * to members redirect to their clones, and the first write to a not-yet-
 * forked member triggers `onMissingMember` (lazy copy-on-write, wired to
 * `forkNodeIntoDraft`). Only ids in `members` are overlay-managed — all
 * other reads/writes pass through untouched, so bookkeeping writes (the
 * draft node itself, profiles, unrelated content) never fork.
 */
export interface CheckedOutDraftOverlay {
  /** The Draft node that owns this checkout. */
  draftId: NodeId
  /** The draft's declared scope: ids eligible for overlay + lazy COW. */
  members: readonly NodeId[]
  /** originalId -> cloneId for members already forked. */
  clones: Record<NodeId, NodeId>
  /**
   * Lazy copy-on-write: fork `originalId` into the draft and return the
   * clone id (or null to decline — the write then targets the original).
   */
  onMissingMember?: (originalId: NodeId) => Promise<NodeId | null>
}

/** One pinned key: a change hash or a `yjs:`-prefixed snapshot ref. */
export interface PinEntry {
  key: string
  ownerId: string
  reason: string
}

/** Pin registry capability on a storage adapter (exploration 0329). */
export interface PinRegistry {
  /** Add pins (idempotent per (key, ownerId)). */
  addPins(pins: readonly PinEntry[]): Promise<void>
  /** Release every pin held by an owner (checkpoint/draft deletion). */
  removePinsByOwner(ownerId: string): Promise<void>
  /** Of the given keys, return the subset pinned by any owner. */
  getPinnedKeysAmong(keys: readonly string[]): Promise<Set<string>>
  /** Total number of pins (diagnostics). */
  countPins(): Promise<number>
}

export interface SetNodeOptions {
  /**
   * Whether storage may maintain plaintext property read indexes for this node.
   * Encrypted NodeStore instances pass false and must rely on post-decryption
   * query evaluation instead.
   */
  indexProperties?: boolean
}

export interface ImportNodesOptions extends SetNodeOptions {
  /**
   * Skip secondary scalar/spatial/FTS/materialized maintenance for this write.
   * Callers must rebuild affected schema indexes before relying on indexed
   * queries again.
   */
  deferIndexes?: boolean
  /**
   * Treat the provided NodeState objects as the post-LWW materialized truth
   * when updating secondary indexes. This avoids a per-node readback during
   * import paths that already materialize against current storage state.
   */
  trustMaterializedState?: boolean
}

export type RebuildNodeIndexesOptions = SetNodeOptions

export type NodeBatchIndexMode = 'eager' | 'touched' | 'defer-schema'

export interface NodeBatchPreflightResult {
  /** Existing materialized nodes keyed by node ID. Missing node IDs are omitted. */
  nodesById: Map<NodeId, NodeState>
  /** Latest known change for each requested node ID. Missing node IDs are omitted. */
  lastChangesByNodeId: Map<NodeId, NodeChange>
}

export interface ApplyNodeBatchInput extends SetNodeOptions {
  /** Batch ID shared by all supplied changes. */
  batchId: string
  /** Final materialized state for changed nodes. */
  nodes: readonly NodeState[]
  /** Signed changes to append after materialized nodes exist. */
  changes: readonly NodeChange[]
  /** Last Lamport time after applying the batch. */
  lastLamportTime: number
  /** Schemas affected by the batch, used for index/view invalidation. */
  affectedSchemaIds: readonly SchemaIRI[]
  /**
   * Secondary index strategy for this batch.
   *
   * - `eager`: maintain indexes through the normal per-node write path.
   * - `touched`: skip per-node indexes, then rebuild only touched node indexes.
   * - `defer-schema`: skip indexes so the caller can rebuild affected schemas later.
   */
  indexMode: NodeBatchIndexMode
}

export interface ApplyNodeBatchResult {
  /** Number of materialized node rows written or updated. */
  nodeRowsWritten: number
  /** Number of property rows considered for write. */
  propertyRowsWritten: number
  /** Number of change rows considered for append. */
  changeRowsWritten: number
  /** Number of scalar index rows written. */
  scalarRowsWritten: number
  /** Number of full-text index rows written. */
  ftsRowsWritten: number
}

export type NodeBatchNotificationMode = 'per-node' | 'batch' | 'silent'
export type NodeBatchSyncMode = 'normal' | 'defer'

export interface NodeBatchWritePolicy {
  /** Secondary index strategy for this batch. */
  indexMode: NodeBatchIndexMode
  /** Live notification strategy after the batch is durable. */
  notificationMode: NodeBatchNotificationMode
  /** Advisory sync strategy for runtimes that can coalesce outbound replication. */
  syncMode: NodeBatchSyncMode
}

export interface NodeBatchWriteTimings {
  /** Existing-node and parent-change lookup time. */
  preflightMs: number
  /** In-memory materialization and change signing time. */
  materializeMs: number
  /** Storage apply time, including indexes owned by the adapter. */
  applyMs: number
  /** Listener notification time after the storage commit. */
  notifyMs: number
  /** Full wall time for the batch write call. */
  totalMs: number
}

export interface DeterministicNodeBatchWriteInput {
  kind: 'deterministic-import'
  drafts: readonly DeterministicNodeImportDraft[]
  policy?: Partial<NodeBatchWritePolicy>
}

export interface OperationNodeBatchWriteInput {
  kind: 'operations'
  operations: readonly TransactionOperation[]
  policy?: Partial<NodeBatchWritePolicy>
}

export type NodeBatchWriteInput = DeterministicNodeBatchWriteInput | OperationNodeBatchWriteInput

export interface NodeBatchWriteResult {
  /** The batch ID shared by all changes. */
  batchId: string
  /** Number of drafts that created a node at the time they were applied. */
  created: number
  /** Number of drafts that updated a node at the time they were applied. */
  updated: number
  /** Final node IDs touched by the batch. */
  nodeIds: NodeId[]
  /** Schemas whose materialized nodes changed. */
  schemaIds: SchemaIRI[]
  /** Number of signed changes appended by the batch. */
  changeCount: number
  /** Storage-level write counters when the adapter reports them. */
  storage?: ApplyNodeBatchResult
  /** Phase timings for import diagnostics and progress UIs. */
  timings: NodeBatchWriteTimings
}

export interface NodeBatchChangeEvent {
  /** The batch ID shared by all changes. */
  batchId: string
  /** Final node IDs touched by the batch. */
  nodeIds: NodeId[]
  /** Schemas whose materialized nodes changed. */
  schemaIds: SchemaIRI[]
  /** Number of drafts that created a node at the time they were applied. */
  created: number
  /** Number of drafts that updated a node at the time they were applied. */
  updated: number
  /** Number of signed changes appended by the batch. */
  changeCount: number
  /** Whether this was a remote change batch from sync. */
  isRemote: boolean
  /** Storage-level write counters when the adapter reports them. */
  storage?: ApplyNodeBatchResult
  /** Phase timings for import diagnostics and progress UIs. */
  timings: NodeBatchWriteTimings
}

export interface ListNodesOptions {
  /** Filter by schema IRI */
  schemaId?: SchemaIRI
  /** Include soft-deleted nodes */
  includeDeleted?: boolean
  /** Sort by system metadata fields */
  orderBy?: Partial<Record<SystemOrderField, SortDirection>>
  /** Limit results */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

export interface CountNodesOptions {
  /** Filter by schema IRI */
  schemaId?: SchemaIRI
  /** Include soft-deleted nodes */
  includeDeleted?: boolean
}

// ============================================================================
// Conflict Resolution
// ============================================================================

/**
 * Result of LWW conflict resolution for a property.
 */
export interface ConflictResult {
  /** Which value won */
  winner: 'local' | 'remote'
  /** The property key */
  key: PropertyKey
  /** The winning value */
  value: unknown
  /** The winning timestamp */
  timestamp: PropertyTimestamp
}

/**
 * Conflict detected during merge (for debugging/UI).
 *
 * `kind` separates genuine concurrent divergence from routine LWW
 * housekeeping (exploration 0296):
 * - `'conflict'` — a cross-author write lost to a newer local value.
 * - `'lww-resolution'` — a cross-author write replaced a differing local
 *   value (informational lost-update record, not an error condition).
 * Identical stamps (idempotent replays) and same-author causal history are
 * never recorded at all.
 */
export interface MergeConflict {
  nodeId: NodeId
  key: PropertyKey
  localValue: unknown
  localTimestamp: PropertyTimestamp
  remoteValue: unknown
  remoteTimestamp: PropertyTimestamp
  resolved: 'local' | 'remote'
  kind: 'conflict' | 'lww-resolution'
}

// ============================================================================
// Store Options
// ============================================================================

/**
 * Callback to get the known property names for a schema.
 * Used for unknown property preservation during version compatibility.
 * Returns the set of property names defined in the schema,
 * or undefined if the schema is not available (all properties treated as known).
 */
export type PropertyLookup = (schemaId: SchemaIRI) => Set<string> | undefined

/**
 * Options for creating a NodeStore.
 */
export interface NodeStoreOptions {
  /** Storage adapter */
  storage: NodeStorageAdapter
  /** Author's DID */
  authorDID: DID
  /** Ed25519 signing key */
  signingKey: Uint8Array
  /**
   * Optional async change signer (e.g. `createWebCryptoChangeSigner` from
   * @xnetjs/sync, or a worker-backed signer). Signatures must be
   * byte-identical to the synchronous Ed25519 path. When omitted, changes
   * are signed synchronously with `signingKey` on the calling thread.
   */
  changeSigner?: ChangeSigner
  /**
   * Optional schema lookup for temp ID resolution in relation properties.
   * When provided, `transaction()` will resolve `~`-prefixed temp IDs in
   * properties whose schema type is `'relation'`.
   * Without this, temp IDs are only resolved in operation ID fields.
   */
  schemaLookup?: SchemaLookup
  /**
   * Optional property lookup for unknown property preservation.
   * When provided, properties not in the schema are stored in `_unknown`.
   * Without this, all properties are stored as known properties.
   */
  propertyLookup?: PropertyLookup
  /**
   * Optional lens registry for automatic schema migrations.
   * When provided, nodes are automatically migrated to the target schema
   * version on read (getWithMigration). Without this, nodes are returned as-is.
   */
  lensRegistry?: LensRegistry

  /** Optional authorization evaluator used for mutation gating. */
  authEvaluator?: PolicyEvaluator

  /**
   * Optional transparent node content cipher.
   *
   * When provided, NodeStore writes encrypted node payload snapshots via
   * `setDocumentContent()` and decrypts them on read paths.
   */
  nodeContentCipher?: NodeContentCipher

  /**
   * Optional cache for per-node content keys used by `nodeContentCipher`.
   *
   * This avoids expensive key unwraps on repeated reads.
   */
  contentKeyCache?: ContentKeyCache

  /**
   * Optional lookup for properties that can change node recipients.
   * When provided, update paths only trigger recipient recomputation hooks
   * if one of these properties is changed.
   */
  authRelevantPropertyLookup?: (schemaId: SchemaIRI) => Set<string> | undefined

  /**
   * Optional callback triggered when an update touches auth-relevant properties.
   * Integrators can use this to recompute recipients and rotate keys.
   */
  onRecipientsMayNeedRecompute?: (context: {
    nodeId: NodeId
    schemaId: SchemaIRI
    changedProperties: string[]
  }) => Promise<void> | void

  /**
   * Optional callback for rejected unauthorized remote changes.
   * Remote unauthorized changes are rejected silently and never applied.
   */
  onUnauthorizedRemoteChange?: (context: {
    change: NodeChange
    action: AuthAction
    decision: AuthDecision
  }) => void

  /** Optional high-level authorization API attached as `store.auth`. */
  auth?: StoreAuthAPI

  /**
   * Optional telemetry collector for tracking CRUD operations, errors, and performance.
   * When provided, NodeStore will report:
   * - Performance metrics for create/update/delete/list operations
   * - Usage metrics for operation counts
   * - Crash reports for errors
   *
   * Compatible with @xnetjs/telemetry TelemetryCollector.
   */
  telemetry?: {
    reportPerformance(metricName: string, durationMs: number, codeNamespace?: string): void
    reportUsage(metricName: string, value: number): void
    reportCrash(error: Error, context?: { codeNamespace?: string }): void
    reportSecurityEvent(eventName: string, severity: 'low' | 'medium' | 'high' | 'critical'): void
  }
}

/**
 * Cache for per-node content keys used during transparent decrypt/encrypt flows.
 */
export interface ContentKeyCache {
  get(nodeId: NodeId): Uint8Array | undefined
  set(nodeId: NodeId, key: Uint8Array): void
  delete(nodeId: NodeId): void
  clear?(): void
}

/**
 * Pluggable cipher for transparent node payload encryption.
 */
export interface NodeContentCipher {
  encrypt(input: {
    nodeId: NodeId
    schemaId: SchemaIRI
    content: Uint8Array
    cachedContentKey?: Uint8Array
  }): Promise<{ encryptedContent: Uint8Array; contentKey?: Uint8Array }>

  decrypt(input: {
    nodeId: NodeId
    schemaId: SchemaIRI
    encryptedContent: Uint8Array
    cachedContentKey?: Uint8Array
  }): Promise<{ content: Uint8Array; contentKey?: Uint8Array }>
}

/**
 * Options for creating a Node.
 */
export interface CreateNodeOptions {
  /** Optional ID (generated if not provided) */
  id?: NodeId
  /** Schema IRI */
  schemaId: SchemaIRI
  /** Initial property values */
  properties: Record<PropertyKey, unknown>
}

/**
 * Options for updating a Node.
 */
export interface UpdateNodeOptions {
  /** Changed properties (sparse) */
  properties: Record<PropertyKey, unknown>
}

/**
 * A deterministic node import draft.
 *
 * Intended for importers that already know stable node IDs and want one
 * signed change per draft while avoiding per-node storage transactions.
 */
export interface DeterministicNodeImportDraft {
  /** Stable node ID to create or update */
  id: NodeId
  /** Schema IRI used when the node does not already exist */
  schemaId: SchemaIRI
  /** Properties to merge with LWW semantics */
  properties: Record<PropertyKey, unknown>
}

export interface ImportDeterministicNodesOptions {
  /**
   * Secondary index strategy for this import. Defaults to `touched`, which is
   * optimized for bulk imports when storage supports `applyNodeBatch()`.
   */
  indexMode?: NodeBatchIndexMode
  /**
   * Skip secondary index maintenance for this chunk. Call
   * `NodeStore.rebuildIndexesForSchemas()` for the affected schemas before
   * relying on indexed queries.
   *
   * @deprecated Prefer `indexMode: 'defer-schema'`.
   */
  deferIndexes?: boolean
}

export interface ImportDeterministicNodesResult {
  /** The batch ID shared by all imported changes */
  batchId: string
  /** Number of drafts that created a node at the time they were applied */
  created: number
  /** Number of drafts that updated a node at the time they were applied */
  updated: number
  /** Final materialized state for each changed node */
  nodes: NodeState[]
  /** All signed changes created for the import */
  changes: NodeChange[]
  /** Schemas whose materialized nodes changed */
  affectedSchemaIds: SchemaIRI[]
  /** Storage-level write counters when the adapter reports them. */
  storage?: ApplyNodeBatchResult
  /** Phase timings for import diagnostics and progress UIs. */
  timings: NodeBatchWriteTimings
}

// ============================================================================
// Transaction Support
// ============================================================================

/**
 * A single operation within a transaction.
 */
export type TransactionOperation =
  | { type: 'create'; options: CreateNodeOptions }
  | { type: 'update'; nodeId: NodeId; options: UpdateNodeOptions }
  | { type: 'delete'; nodeId: NodeId }
  | { type: 'restore'; nodeId: NodeId }

/**
 * Result of a transaction execution.
 * Returns the affected nodes in the same order as operations.
 */
export interface TransactionResult {
  /** The batch ID shared by all changes */
  batchId: string
  /** Results for each operation (NodeState or null for delete) */
  results: (NodeState | null)[]
  /** All changes created in this transaction */
  changes: NodeChange[]
  /** Map from temp ID → generated real ID (empty if no temp IDs were used) */
  tempIds: Record<string, NodeId>
}

// ============================================================================
// Change Events
// ============================================================================

/**
 * Event emitted when a Node changes.
 */
export interface NodeChangeEvent {
  /** The change that was applied */
  change: NodeChange
  /** The node state before the change was applied */
  previousNode: NodeState | null
  /** The resulting Node state */
  node: NodeState | null
  /** Whether this was a remote change (from sync) */
  isRemote: boolean
}

/**
 * Listener for Node change events.
 */
export type NodeChangeListener = (event: NodeChangeEvent) => void

export type NodeBatchChangeListener = (event: NodeBatchChangeEvent) => void

// ============================================================================
// Migration Support
// ============================================================================

/**
 * Options for getWithMigration.
 */
export interface GetWithMigrationOptions {
  /** Target schema IRI to migrate to (required) */
  targetSchemaId: SchemaIRI
}

/**
 * Information about a migration that was applied.
 */
export interface MigrationInfo {
  /** The original schema IRI of the stored data */
  from: SchemaIRI
  /** The target schema IRI */
  to: SchemaIRI
  /** Whether the migration preserved all data (no data loss) */
  lossless: boolean
  /** Warnings about potential data loss */
  warnings: string[]
}

/**
 * Result of getWithMigration.
 */
export interface MigratedNodeState extends NodeState {
  /**
   * Migration info if the node was migrated from a different schema version.
   * Undefined if no migration was needed.
   */
  _migrationInfo?: MigrationInfo
}
