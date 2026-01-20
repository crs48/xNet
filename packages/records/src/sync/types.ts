/**
 * @xnet/records - Event sourcing types for record sync
 *
 * Records use an append-only log of operations with last-writer-wins
 * conflict resolution. This is simpler than Yjs CRDTs but sufficient
 * for tabular data where field-level conflicts are rare.
 */

import type { DID, VectorClock, ContentId } from '@xnet/core'
import type {
  DatabaseId,
  ItemId,
  PropertyId,
  PropertyValue,
  PropertyDefinition,
  View,
  ViewId
} from '../types'

// ============================================================================
// Record Operations (Events)
// ============================================================================

/**
 * Base operation with metadata
 */
export interface BaseOperation {
  /** Unique operation ID */
  id: string

  /** Database this operation applies to */
  databaseId: DatabaseId

  /** Hash of this operation (for verification) */
  hash: ContentId

  /** Hash of parent operation (chain linkage) */
  parentHash: ContentId | null

  /** Who made this change */
  authorDID: DID

  /** Cryptographic signature */
  signature: Uint8Array

  /** When this happened (wall clock, for LWW) */
  timestamp: number

  /** Causal ordering */
  vectorClock: VectorClock
}

/**
 * Create a new item
 */
export interface CreateItemOperation extends BaseOperation {
  type: 'create-item'
  itemId: ItemId
  properties: Record<PropertyId, PropertyValue>
}

/**
 * Update item properties
 * Only includes changed properties (sparse update)
 */
export interface UpdateItemOperation extends BaseOperation {
  type: 'update-item'
  itemId: ItemId
  changes: Record<PropertyId, PropertyValue>
}

/**
 * Delete an item (soft delete - marks as deleted)
 */
export interface DeleteItemOperation extends BaseOperation {
  type: 'delete-item'
  itemId: ItemId
}

/**
 * Restore a deleted item
 */
export interface RestoreItemOperation extends BaseOperation {
  type: 'restore-item'
  itemId: ItemId
}

/**
 * Add a new property to the database schema
 */
export interface AddPropertyOperation extends BaseOperation {
  type: 'add-property'
  property: PropertyDefinition
}

/**
 * Update a property definition
 */
export interface UpdatePropertyOperation extends BaseOperation {
  type: 'update-property'
  propertyId: PropertyId
  changes: Partial<Omit<PropertyDefinition, 'id' | 'type'>>
}

/**
 * Delete a property from the schema
 */
export interface DeletePropertyOperation extends BaseOperation {
  type: 'delete-property'
  propertyId: PropertyId
}

/**
 * Add a new view
 */
export interface AddViewOperation extends BaseOperation {
  type: 'add-view'
  view: View
}

/**
 * Update a view
 */
export interface UpdateViewOperation extends BaseOperation {
  type: 'update-view'
  viewId: ViewId
  changes: Partial<Omit<View, 'id'>>
}

/**
 * Delete a view
 */
export interface DeleteViewOperation extends BaseOperation {
  type: 'delete-view'
  viewId: ViewId
}

/**
 * Update database metadata (name, icon, cover)
 */
export interface UpdateDatabaseOperation extends BaseOperation {
  type: 'update-database'
  changes: {
    name?: string
    icon?: string
    cover?: string
    defaultViewId?: ViewId
  }
}

/**
 * Union of all operation types
 */
export type RecordOperation =
  | CreateItemOperation
  | UpdateItemOperation
  | DeleteItemOperation
  | RestoreItemOperation
  | AddPropertyOperation
  | UpdatePropertyOperation
  | DeletePropertyOperation
  | AddViewOperation
  | UpdateViewOperation
  | DeleteViewOperation
  | UpdateDatabaseOperation

/**
 * Operation types as string literals
 */
export type RecordOperationType = RecordOperation['type']

// ============================================================================
// Materialized State
// ============================================================================

/**
 * Property value with LWW metadata
 */
export interface TimestampedValue {
  value: PropertyValue
  timestamp: number
  authorDID: DID
}

/**
 * Item state with per-property timestamps for LWW resolution
 */
export interface ItemState {
  id: ItemId
  databaseId: DatabaseId

  /** Current property values (after LWW resolution) */
  properties: Record<PropertyId, PropertyValue>

  /** Timestamps for each property (for sync/conflict resolution) */
  propertyTimestamps: Record<PropertyId, TimestampedValue>

  /** Soft delete flag */
  deleted: boolean
  deletedAt?: number
  deletedBy?: DID

  /** Creation metadata */
  created: number
  createdBy: DID

  /** Last update metadata */
  updated: number
  updatedBy: DID
}

/**
 * Database state (schema + metadata)
 */
export interface DatabaseState {
  id: DatabaseId
  name: string
  icon?: string
  cover?: string
  properties: PropertyDefinition[]
  views: View[]
  defaultViewId: ViewId
  created: number
  createdBy: DID
  updated: number
  updatedBy: DID
}

// ============================================================================
// Sync Protocol
// ============================================================================

/**
 * Sync request - ask for operations since a vector clock
 */
export interface SyncRequest {
  type: 'sync-request'
  databaseId: DatabaseId
  sinceVectorClock: VectorClock
  /** Max operations to return (for pagination) */
  limit?: number
}

/**
 * Sync response - operations the requester is missing
 */
export interface SyncResponse {
  type: 'sync-response'
  databaseId: DatabaseId
  operations: RecordOperation[]
  /** True if there are more operations (pagination) */
  hasMore: boolean
  /** Current vector clock of responder */
  vectorClock: VectorClock
}

/**
 * Push a new operation to peers
 */
export interface OperationPush {
  type: 'operation-push'
  operation: RecordOperation
}

/**
 * Acknowledge receipt of an operation
 */
export interface OperationAck {
  type: 'operation-ack'
  operationId: string
  accepted: boolean
  error?: string
}

/**
 * Union of sync message types
 */
export type SyncMessage = SyncRequest | SyncResponse | OperationPush | OperationAck

// ============================================================================
// Conflict Resolution
// ============================================================================

/**
 * Result of attempting to apply an operation
 */
export interface ApplyResult {
  success: boolean
  /** Operations that were superseded (for debugging) */
  superseded?: RecordOperation[]
  /** Error if not successful */
  error?: string
}

/**
 * Conflict detected during sync
 */
export interface Conflict {
  itemId: ItemId
  propertyId: PropertyId
  localValue: TimestampedValue
  remoteValue: TimestampedValue
  /** Which value won (always the later timestamp) */
  resolved: 'local' | 'remote'
}
