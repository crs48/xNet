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

import type { DID, ContentId } from '@xnet/core'
import type { Change, LamportTimestamp } from '@xnet/sync'
import type { SchemaIRI, Node } from '../schema/node'

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
}

// ============================================================================
// Storage Adapter
// ============================================================================

/**
 * Storage adapter interface for NodeStore.
 *
 * Implementations can use IndexedDB, SQLite, or memory.
 * The adapter stores Changes and materialized NodeState.
 */
export interface NodeStorageAdapter {
  // Change log operations
  appendChange(change: NodeChange): Promise<void>
  getChanges(nodeId: NodeId): Promise<NodeChange[]>
  getAllChanges(): Promise<NodeChange[]>
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
 * Options for creating a NodeStore.
 */
export interface NodeStoreOptions {
  /** Storage adapter */
  storage: NodeStorageAdapter
  /** Author's DID */
  authorDID: DID
  /** Ed25519 signing key */
  signingKey: Uint8Array
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
