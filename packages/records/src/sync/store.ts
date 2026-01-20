/**
 * @xnet/records - RecordStore for event-sourced record persistence
 *
 * This store manages:
 * 1. Append-only operation log (record_operations table)
 * 2. Materialized current state (record_items, databases tables)
 * 3. LWW conflict resolution for property values
 */

import { hashHex, sign, verify } from '@xnet/crypto'
import type { DID, VectorClock, ContentId } from '@xnet/core'
import { incrementVectorClock, mergeVectorClocks } from '@xnet/core'
import type {
  DatabaseId,
  ItemId,
  PropertyId,
  PropertyValue,
  PropertyDefinition,
  View,
  ViewId,
  Database
} from '../types'
import type {
  RecordOperation,
  CreateItemOperation,
  UpdateItemOperation,
  DeleteItemOperation,
  ItemState,
  DatabaseState,
  TimestampedValue,
  ApplyResult,
  Conflict
} from './types'
import { generateItemId, generatePropertyId, generateViewId } from '../utils'

// ============================================================================
// SQL Schema
// ============================================================================

/**
 * SQL schema for record storage.
 * Use this to initialize SQLite databases.
 */
export const RECORD_SCHEMA_SQL = `
-- Databases (schema + metadata)
CREATE TABLE IF NOT EXISTS databases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  cover TEXT,
  schema JSON NOT NULL,        -- PropertyDefinition[]
  views JSON NOT NULL,         -- View[]
  default_view_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL
);

-- Record items (materialized current state)
CREATE TABLE IF NOT EXISTS record_items (
  id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL,
  properties JSON NOT NULL,           -- Current property values
  property_timestamps JSON NOT NULL,  -- TimestampedValue per property (for LWW)
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  deleted_by TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL,
  
  FOREIGN KEY (database_id) REFERENCES databases(id)
);

-- Append-only operation log
CREATE TABLE IF NOT EXISTS record_operations (
  id TEXT PRIMARY KEY,
  database_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  operation JSON NOT NULL,
  hash TEXT NOT NULL,
  parent_hash TEXT,
  author_did TEXT NOT NULL,
  signature BLOB NOT NULL,
  timestamp INTEGER NOT NULL,
  vector_clock JSON NOT NULL,
  
  FOREIGN KEY (database_id) REFERENCES databases(id)
);

-- Vector clock state per database (for sync)
CREATE TABLE IF NOT EXISTS sync_state (
  database_id TEXT PRIMARY KEY,
  vector_clock JSON NOT NULL,
  last_operation_hash TEXT,
  
  FOREIGN KEY (database_id) REFERENCES databases(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_items_database ON record_items(database_id);
CREATE INDEX IF NOT EXISTS idx_items_updated ON record_items(updated_at);
CREATE INDEX IF NOT EXISTS idx_items_deleted ON record_items(database_id, deleted);

CREATE INDEX IF NOT EXISTS idx_operations_database ON record_operations(database_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_operations_hash ON record_operations(hash);
CREATE INDEX IF NOT EXISTS idx_operations_parent ON record_operations(parent_hash);
`

// ============================================================================
// RecordStore Interface
// ============================================================================

/**
 * Storage adapter interface for records.
 * Implementations can use SQLite, IndexedDB, or memory.
 */
export interface RecordStorageAdapter {
  // Database operations
  getDatabase(id: DatabaseId): Promise<DatabaseState | null>
  setDatabase(db: DatabaseState): Promise<void>
  listDatabases(): Promise<DatabaseId[]>

  // Item operations
  getItem(id: ItemId): Promise<ItemState | null>
  setItem(item: ItemState): Promise<void>
  deleteItem(id: ItemId): Promise<void>
  listItems(databaseId: DatabaseId, includeDeleted?: boolean): Promise<ItemState[]>

  // Operation log
  appendOperation(op: RecordOperation): Promise<void>
  getOperations(databaseId: DatabaseId, since?: VectorClock): Promise<RecordOperation[]>
  getOperationByHash(hash: ContentId): Promise<RecordOperation | null>

  // Sync state
  getVectorClock(databaseId: DatabaseId): Promise<VectorClock>
  setVectorClock(databaseId: DatabaseId, clock: VectorClock): Promise<void>
  getLastOperationHash(databaseId: DatabaseId): Promise<ContentId | null>
}

// ============================================================================
// RecordStore Implementation
// ============================================================================

/**
 * Options for creating operations
 */
export interface OperationOptions {
  authorDID: DID
  signingKey: Uint8Array
}

/**
 * RecordStore manages event-sourced records with LWW conflict resolution.
 */
export class RecordStore {
  private storage: RecordStorageAdapter
  private authorDID: DID
  private signingKey: Uint8Array
  private conflicts: Conflict[] = []

  constructor(storage: RecordStorageAdapter, options: OperationOptions) {
    this.storage = storage
    this.authorDID = options.authorDID
    this.signingKey = options.signingKey
  }

  // ==========================================================================
  // Database Operations
  // ==========================================================================

  /**
   * Create a new database
   */
  async createDatabase(
    name: string,
    properties: PropertyDefinition[] = []
  ): Promise<DatabaseState> {
    const id = `db:${crypto.randomUUID()}` as DatabaseId
    const now = Date.now()

    // Create default title property if none provided
    if (properties.length === 0) {
      properties.push({
        id: generatePropertyId(),
        name: 'Title',
        type: 'text',
        config: {},
        required: true,
        hidden: false
      })
    }

    // Create default table view
    const defaultView: View = {
      id: generateViewId(),
      name: 'All Items',
      type: 'table',
      config: {
        type: 'table',
        wrapCells: false,
        showRowNumbers: false,
        frozenColumns: 0
      },
      visibleProperties: properties.map((p) => p.id),
      propertyWidths: {},
      sorts: []
    }

    const db: DatabaseState = {
      id,
      name,
      properties,
      views: [defaultView],
      defaultViewId: defaultView.id,
      created: now,
      createdBy: this.authorDID,
      updated: now,
      updatedBy: this.authorDID
    }

    await this.storage.setDatabase(db)

    // Initialize vector clock
    await this.storage.setVectorClock(id, {})

    return db
  }

  /**
   * Get a database by ID
   */
  async getDatabase(id: DatabaseId): Promise<DatabaseState | null> {
    return this.storage.getDatabase(id)
  }

  // ==========================================================================
  // Item Operations
  // ==========================================================================

  /**
   * Create a new item in a database
   */
  async createItem(
    databaseId: DatabaseId,
    properties: Record<PropertyId, PropertyValue>
  ): Promise<ItemState> {
    const id = generateItemId()
    const now = Date.now()

    // Create operation
    const op = await this.createOperation<CreateItemOperation>(databaseId, {
      type: 'create-item',
      itemId: id,
      properties
    })

    // Apply operation
    await this.applyOperation(op)

    return (await this.storage.getItem(id))!
  }

  /**
   * Update item properties
   */
  async updateItem(itemId: ItemId, changes: Record<PropertyId, PropertyValue>): Promise<ItemState> {
    const item = await this.storage.getItem(itemId)
    if (!item) throw new Error(`Item not found: ${itemId}`)

    const op = await this.createOperation<UpdateItemOperation>(item.databaseId, {
      type: 'update-item',
      itemId,
      changes
    })

    await this.applyOperation(op)

    return (await this.storage.getItem(itemId))!
  }

  /**
   * Delete an item (soft delete)
   */
  async deleteItem(itemId: ItemId): Promise<void> {
    const item = await this.storage.getItem(itemId)
    if (!item) throw new Error(`Item not found: ${itemId}`)

    const op = await this.createOperation<DeleteItemOperation>(item.databaseId, {
      type: 'delete-item',
      itemId
    })

    await this.applyOperation(op)
  }

  /**
   * Get an item by ID
   */
  async getItem(id: ItemId): Promise<ItemState | null> {
    return this.storage.getItem(id)
  }

  /**
   * List items in a database
   */
  async listItems(databaseId: DatabaseId, includeDeleted = false): Promise<ItemState[]> {
    return this.storage.listItems(databaseId, includeDeleted)
  }

  // ==========================================================================
  // Operation Creation & Application
  // ==========================================================================

  /**
   * Create a signed operation
   */
  private async createOperation<T extends RecordOperation>(
    databaseId: DatabaseId,
    partialOp: Omit<T, keyof import('./types').BaseOperation>
  ): Promise<T> {
    const now = Date.now()
    const id = crypto.randomUUID()

    // Get current vector clock and increment
    const currentClock = await this.storage.getVectorClock(databaseId)
    const vectorClock = incrementVectorClock(currentClock, this.authorDID)

    // Get parent hash
    const parentHash = await this.storage.getLastOperationHash(databaseId)

    // Create operation object (without hash/signature yet)
    const opWithoutSig = {
      ...partialOp,
      id,
      databaseId,
      authorDID: this.authorDID,
      timestamp: now,
      vectorClock,
      parentHash
    }

    // Hash the operation
    const hashInput = JSON.stringify(opWithoutSig)
    const hash = `cid:blake3:${hashHex(new TextEncoder().encode(hashInput))}` as ContentId

    // Sign the hash
    const signature = sign(new TextEncoder().encode(hash), this.signingKey)

    return {
      ...opWithoutSig,
      hash,
      signature
    } as T
  }

  /**
   * Apply an operation (local or from sync)
   */
  async applyOperation(op: RecordOperation): Promise<ApplyResult> {
    // Append to log first (event sourcing)
    await this.storage.appendOperation(op)

    // Update vector clock
    const currentClock = await this.storage.getVectorClock(op.databaseId)
    const newClock = mergeVectorClocks(currentClock, op.vectorClock)
    await this.storage.setVectorClock(op.databaseId, newClock)

    // Apply to materialized state
    switch (op.type) {
      case 'create-item':
        return this.applyCreateItem(op)
      case 'update-item':
        return this.applyUpdateItem(op)
      case 'delete-item':
        return this.applyDeleteItem(op)
      case 'restore-item':
        return this.applyRestoreItem(op)
      case 'add-property':
      case 'update-property':
      case 'delete-property':
      case 'add-view':
      case 'update-view':
      case 'delete-view':
      case 'update-database':
        return this.applySchemaOperation(op)
      default:
        return { success: false, error: `Unknown operation type: ${(op as any).type}` }
    }
  }

  private async applyCreateItem(op: CreateItemOperation): Promise<ApplyResult> {
    const now = op.timestamp

    // Build property timestamps for LWW
    const propertyTimestamps: Record<PropertyId, TimestampedValue> = {}
    for (const [propId, value] of Object.entries(op.properties)) {
      propertyTimestamps[propId as PropertyId] = {
        value,
        timestamp: now,
        authorDID: op.authorDID
      }
    }

    const item: ItemState = {
      id: op.itemId,
      databaseId: op.databaseId,
      properties: op.properties,
      propertyTimestamps,
      deleted: false,
      created: now,
      createdBy: op.authorDID,
      updated: now,
      updatedBy: op.authorDID
    }

    await this.storage.setItem(item)
    return { success: true }
  }

  private async applyUpdateItem(op: UpdateItemOperation): Promise<ApplyResult> {
    const item = await this.storage.getItem(op.itemId)
    if (!item) {
      return { success: false, error: `Item not found: ${op.itemId}` }
    }

    const conflicts: Conflict[] = []

    // Apply each property change with LWW
    for (const [propId, newValue] of Object.entries(op.changes)) {
      const pid = propId as PropertyId
      const existing = item.propertyTimestamps[pid]

      if (existing && existing.timestamp > op.timestamp) {
        // Existing value is newer - this update loses
        conflicts.push({
          itemId: op.itemId,
          propertyId: pid,
          localValue: existing,
          remoteValue: { value: newValue, timestamp: op.timestamp, authorDID: op.authorDID },
          resolved: 'local'
        })
      } else {
        // New value wins
        item.properties[pid] = newValue
        item.propertyTimestamps[pid] = {
          value: newValue,
          timestamp: op.timestamp,
          authorDID: op.authorDID
        }

        if (existing) {
          conflicts.push({
            itemId: op.itemId,
            propertyId: pid,
            localValue: existing,
            remoteValue: item.propertyTimestamps[pid],
            resolved: 'remote'
          })
        }
      }
    }

    item.updated = Math.max(item.updated, op.timestamp)
    item.updatedBy = op.authorDID

    await this.storage.setItem(item)

    // Track conflicts for debugging/UI
    this.conflicts.push(...conflicts.filter((c) => c.resolved === 'remote'))

    return { success: true }
  }

  private async applyDeleteItem(op: DeleteItemOperation): Promise<ApplyResult> {
    const item = await this.storage.getItem(op.itemId)
    if (!item) {
      return { success: false, error: `Item not found: ${op.itemId}` }
    }

    item.deleted = true
    item.deletedAt = op.timestamp
    item.deletedBy = op.authorDID

    await this.storage.setItem(item)
    return { success: true }
  }

  private async applyRestoreItem(
    op: RecordOperation & { type: 'restore-item'; itemId: ItemId }
  ): Promise<ApplyResult> {
    const item = await this.storage.getItem(op.itemId)
    if (!item) {
      return { success: false, error: `Item not found: ${op.itemId}` }
    }

    item.deleted = false
    item.deletedAt = undefined
    item.deletedBy = undefined
    item.updated = op.timestamp
    item.updatedBy = op.authorDID

    await this.storage.setItem(item)
    return { success: true }
  }

  private async applySchemaOperation(op: RecordOperation): Promise<ApplyResult> {
    const db = await this.storage.getDatabase(op.databaseId)
    if (!db) {
      return { success: false, error: `Database not found: ${op.databaseId}` }
    }

    switch (op.type) {
      case 'add-property':
        db.properties.push(op.property)
        break
      case 'update-property':
        const propIdx = db.properties.findIndex((p) => p.id === op.propertyId)
        if (propIdx >= 0) {
          db.properties[propIdx] = { ...db.properties[propIdx], ...op.changes }
        }
        break
      case 'delete-property':
        db.properties = db.properties.filter((p) => p.id !== op.propertyId)
        break
      case 'add-view':
        db.views.push(op.view)
        break
      case 'update-view':
        const viewIdx = db.views.findIndex((v) => v.id === op.viewId)
        if (viewIdx >= 0) {
          db.views[viewIdx] = { ...db.views[viewIdx], ...op.changes }
        }
        break
      case 'delete-view':
        db.views = db.views.filter((v) => v.id !== op.viewId)
        break
      case 'update-database':
        Object.assign(db, op.changes)
        break
    }

    db.updated = op.timestamp
    db.updatedBy = op.authorDID

    await this.storage.setDatabase(db)
    return { success: true }
  }

  // ==========================================================================
  // Sync Support
  // ==========================================================================

  /**
   * Get operations for sync (since a vector clock)
   */
  async getOperationsForSync(
    databaseId: DatabaseId,
    since?: VectorClock
  ): Promise<RecordOperation[]> {
    return this.storage.getOperations(databaseId, since)
  }

  /**
   * Apply operations received from sync
   */
  async applyRemoteOperations(operations: RecordOperation[]): Promise<ApplyResult[]> {
    const results: ApplyResult[] = []

    // Sort by vector clock / timestamp for causal ordering
    const sorted = [...operations].sort((a, b) => a.timestamp - b.timestamp)

    for (const op of sorted) {
      const result = await this.applyOperation(op)
      results.push(result)
    }

    return results
  }

  /**
   * Get recent conflicts (for UI/debugging)
   */
  getRecentConflicts(): Conflict[] {
    return this.conflicts.slice(-100)
  }

  /**
   * Clear conflict history
   */
  clearConflicts(): void {
    this.conflicts = []
  }
}
