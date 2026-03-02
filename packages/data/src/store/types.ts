/**
 * NodeStore types - Event-sourced storage for Nodes
 *
 * The NodeStore manages Nodes using Change<T> from @xnet/sync.
 * Each Node change is a Change with a NodePayload.
 *
 * Key design decisions:
 * - No operation types (create-item, update-item, etc.) - just Changes
 * - LWW conflict resolution using Lamport timestamps
 * - Changes store sparse updates (only changed properties)
 * - Materialized state computed by replaying Changes
 */

import type { SchemaLookup } from './tempids'
import type { StoreAuthAPI } from '../auth/store-auth'
import type { LensRegistry } from '../schema/lens'
import type { SchemaIRI } from '../schema/node'
import type { AuthAction, AuthDecision, DID, ContentId, PolicyEvaluator } from '@xnet/core'
import type { Change, LamportTimestamp } from '@xnet/sync'

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
  /** The Lamport timestamp when this value was set */
  lamport: LamportTimestamp
  /** Wall clock time (for display) */
  wallTime: number
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
export interface NodeStorageAdapter {
  // Lifecycle (optional - for adapters that need initialization)
  /** Open/initialize the storage connection */
  open?(): Promise<void>
  /** Close the storage connection */
  close?(): Promise<void>

  // Change log operations
  appendChange(change: NodeChange): Promise<void>
  getChanges(nodeId: NodeId): Promise<NodeChange[]>
  getAllChanges(): Promise<NodeChange[]>
  /** Get changes with Lamport time greater than `since` */
  getChangesSince(sinceLamport: number): Promise<NodeChange[]>
  getChangeByHash(hash: ContentId): Promise<NodeChange | null>
  getLastChange(nodeId: NodeId): Promise<NodeChange | null>

  // Materialized state operations
  getNode(id: NodeId): Promise<NodeState | null>
  setNode(node: NodeState): Promise<void>
  deleteNode(id: NodeId): Promise<void>
  listNodes(options?: ListNodesOptions): Promise<NodeState[]>
  countNodes(options?: CountNodesOptions): Promise<number>

  // Sync state
  getLastLamportTime(): Promise<number>
  setLastLamportTime(time: number): Promise<void>

  // Document content operations (for nodes with CRDT document)
  getDocumentContent(nodeId: NodeId): Promise<Uint8Array | null>
  setDocumentContent(nodeId: NodeId, content: Uint8Array): Promise<void>
}

export interface ListNodesOptions {
  /** Filter by schema IRI */
  schemaId?: SchemaIRI
  /** Include soft-deleted nodes */
  includeDeleted?: boolean
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
 */
export interface MergeConflict {
  nodeId: NodeId
  key: PropertyKey
  localValue: unknown
  localTimestamp: PropertyTimestamp
  remoteValue: unknown
  remoteTimestamp: PropertyTimestamp
  resolved: 'local' | 'remote'
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
   * Compatible with @xnet/telemetry TelemetryCollector.
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
  /** The resulting Node state */
  node: NodeState | null
  /** Whether this was a remote change (from sync) */
  isRemote: boolean
}

/**
 * Listener for Node change events.
 */
export type NodeChangeListener = (event: NodeChangeEvent) => void

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
