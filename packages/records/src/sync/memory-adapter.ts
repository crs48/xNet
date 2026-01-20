/**
 * @xnet/records - In-memory storage adapter for testing
 */

import type { VectorClock, ContentId } from '@xnet/core'
import { compareVectorClocks } from '@xnet/core'
import type { DatabaseId, ItemId } from '../types'
import type { RecordOperation, ItemState, DatabaseState } from './types'
import type { RecordStorageAdapter } from './store'

/**
 * In-memory implementation of RecordStorageAdapter.
 * Useful for testing and browser environments without IndexedDB.
 */
export class MemoryRecordAdapter implements RecordStorageAdapter {
  private databases = new Map<DatabaseId, DatabaseState>()
  private items = new Map<ItemId, ItemState>()
  private operations = new Map<DatabaseId, RecordOperation[]>()
  private vectorClocks = new Map<DatabaseId, VectorClock>()
  private lastHashes = new Map<DatabaseId, ContentId>()

  // ==========================================================================
  // Database Operations
  // ==========================================================================

  async getDatabase(id: DatabaseId): Promise<DatabaseState | null> {
    return this.databases.get(id) ?? null
  }

  async setDatabase(db: DatabaseState): Promise<void> {
    this.databases.set(db.id, { ...db })
  }

  async listDatabases(): Promise<DatabaseId[]> {
    return Array.from(this.databases.keys())
  }

  // ==========================================================================
  // Item Operations
  // ==========================================================================

  async getItem(id: ItemId): Promise<ItemState | null> {
    return this.items.get(id) ?? null
  }

  async setItem(item: ItemState): Promise<void> {
    this.items.set(item.id, { ...item })
  }

  async deleteItem(id: ItemId): Promise<void> {
    this.items.delete(id)
  }

  async listItems(databaseId: DatabaseId, includeDeleted = false): Promise<ItemState[]> {
    const items: ItemState[] = []
    for (const item of this.items.values()) {
      if (item.databaseId === databaseId) {
        if (includeDeleted || !item.deleted) {
          items.push({ ...item })
        }
      }
    }
    return items
  }

  // ==========================================================================
  // Operation Log
  // ==========================================================================

  async appendOperation(op: RecordOperation): Promise<void> {
    const ops = this.operations.get(op.databaseId) ?? []
    ops.push(op)
    this.operations.set(op.databaseId, ops)
    this.lastHashes.set(op.databaseId, op.hash)
  }

  async getOperations(databaseId: DatabaseId, since?: VectorClock): Promise<RecordOperation[]> {
    const ops = this.operations.get(databaseId) ?? []

    if (!since) {
      return [...ops]
    }

    // Return operations that happened after the given vector clock
    return ops.filter((op) => {
      const cmp = compareVectorClocks(op.vectorClock, since)
      return cmp === 1 || cmp === 0 // op is after or concurrent with since
    })
  }

  async getOperationByHash(hash: ContentId): Promise<RecordOperation | null> {
    for (const ops of this.operations.values()) {
      const op = ops.find((o) => o.hash === hash)
      if (op) return op
    }
    return null
  }

  // ==========================================================================
  // Sync State
  // ==========================================================================

  async getVectorClock(databaseId: DatabaseId): Promise<VectorClock> {
    return this.vectorClocks.get(databaseId) ?? {}
  }

  async setVectorClock(databaseId: DatabaseId, clock: VectorClock): Promise<void> {
    this.vectorClocks.set(databaseId, { ...clock })
  }

  async getLastOperationHash(databaseId: DatabaseId): Promise<ContentId | null> {
    return this.lastHashes.get(databaseId) ?? null
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.databases.clear()
    this.items.clear()
    this.operations.clear()
    this.vectorClocks.clear()
    this.lastHashes.clear()
  }

  /**
   * Get operation count for a database
   */
  getOperationCount(databaseId: DatabaseId): number {
    return this.operations.get(databaseId)?.length ?? 0
  }

  /**
   * Get all operations (for debugging)
   */
  getAllOperations(): RecordOperation[] {
    const all: RecordOperation[] = []
    for (const ops of this.operations.values()) {
      all.push(...ops)
    }
    return all.sort((a, b) => a.timestamp - b.timestamp)
  }
}
