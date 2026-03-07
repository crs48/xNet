/**
 * Tests for database row operations.
 */

import type { DID } from '@xnetjs/core'
import { generateSigningKeyPair } from '@xnetjs/crypto'
import { createDID } from '@xnetjs/identity'
import { describe, it, expect, beforeEach } from 'vitest'
import { DatabaseSchema } from '../schema/schemas/database'
import { MemoryNodeStorageAdapter } from '../store/memory-adapter'
import { NodeStore } from '../store/store'
import { cellKey } from './cell-types'
import {
  createRow,
  updateCell,
  updateCells,
  deleteRow,
  getRow,
  queryRows,
  moveRow
} from './row-operations'

// Test fixtures
function createTestStore(): {
  store: NodeStore
  adapter: MemoryNodeStorageAdapter
  did: DID
} {
  const keyPair = generateSigningKeyPair()
  const did = createDID(keyPair.publicKey) as DID
  const adapter = new MemoryNodeStorageAdapter()
  const store = new NodeStore({
    storage: adapter,
    authorDID: did,
    signingKey: keyPair.privateKey
  })
  return { store, adapter, did }
}

async function createTestDatabase(store: NodeStore): Promise<string> {
  const db = await store.create({
    schemaId: DatabaseSchema.schema['@id'],
    properties: {
      title: 'Test Database',
      defaultView: 'table'
    }
  })
  return db.id
}

async function syncChanges(source: NodeStore, target: NodeStore, sinceLamport = 0): Promise<void> {
  const changes =
    sinceLamport === 0 ? await source.getAllChanges() : await source.getChangesSince(sinceLamport)

  for (const change of changes) {
    await target.applyRemoteChange(change)
  }
}

describe('Row Operations', () => {
  let store: NodeStore
  let databaseId: string

  beforeEach(async () => {
    const setup = createTestStore()
    store = setup.store
    await store.initialize()
    databaseId = await createTestDatabase(store)
  })

  describe('createRow', () => {
    it('should create a row with cell values', async () => {
      const rowId = await createRow(store, {
        databaseId,
        cells: {
          name: 'John Doe',
          age: 30,
          active: true
        }
      })

      const row = await store.get(rowId)
      expect(row).not.toBeNull()
      expect(row!.properties.database).toBe(databaseId)
      expect(row!.properties[cellKey('name')]).toBe('John Doe')
      expect(row!.properties[cellKey('age')]).toBe(30)
      expect(row!.properties[cellKey('active')]).toBe(true)
    })

    it('should create a row without cell values', async () => {
      const rowId = await createRow(store, { databaseId })

      const row = await store.get(rowId)
      expect(row).not.toBeNull()
      expect(row!.properties.database).toBe(databaseId)
      expect(row!.properties.sortKey).toBeDefined()
    })

    it('should increment database row count', async () => {
      await createRow(store, { databaseId })
      await createRow(store, { databaseId })

      const db = await store.get(databaseId)
      expect(db!.properties.rowCount).toBe(2)
    })

    it('should generate unique sort keys', async () => {
      const rowId1 = await createRow(store, { databaseId })
      const rowId2 = await createRow(store, { databaseId })

      const row1 = await store.get(rowId1)
      const row2 = await store.get(rowId2)

      expect(row1!.properties.sortKey).not.toBe(row2!.properties.sortKey)
    })
  })

  describe('updateCell', () => {
    it('should update a single cell value', async () => {
      const rowId = await createRow(store, {
        databaseId,
        cells: { name: 'John Doe' }
      })

      await updateCell(store, rowId, 'name', 'Jane Doe')

      const row = await store.get(rowId)
      expect(row!.properties[cellKey('name')]).toBe('Jane Doe')
    })

    it('should add a new cell value', async () => {
      const rowId = await createRow(store, { databaseId })

      await updateCell(store, rowId, 'status', 'active')

      const row = await store.get(rowId)
      expect(row!.properties[cellKey('status')]).toBe('active')
    })

    it('should set cell to null', async () => {
      const rowId = await createRow(store, {
        databaseId,
        cells: { name: 'John Doe' }
      })

      await updateCell(store, rowId, 'name', null)

      const row = await store.get(rowId)
      expect(row!.properties[cellKey('name')]).toBe(null)
    })
  })

  describe('updateCells', () => {
    it('should update multiple cell values', async () => {
      const rowId = await createRow(store, {
        databaseId,
        cells: { name: 'John', status: 'pending' }
      })

      await updateCells(store, rowId, {
        name: 'Jane',
        status: 'active',
        priority: 'high'
      })

      const row = await store.get(rowId)
      expect(row!.properties[cellKey('name')]).toBe('Jane')
      expect(row!.properties[cellKey('status')]).toBe('active')
      expect(row!.properties[cellKey('priority')]).toBe('high')
    })
  })

  describe('deleteRow', () => {
    it('should soft delete a row', async () => {
      const rowId = await createRow(store, { databaseId })

      await deleteRow(store, rowId)

      const row = await store.get(rowId)
      expect(row!.deleted).toBe(true)
    })

    it('should decrement database row count', async () => {
      const rowId = await createRow(store, { databaseId })
      await createRow(store, { databaseId })

      const dbBefore = await store.get(databaseId)
      expect(dbBefore!.properties.rowCount).toBe(2)

      await deleteRow(store, rowId)

      const dbAfter = await store.get(databaseId)
      expect(dbAfter!.properties.rowCount).toBe(1)
    })

    it('should handle deleting non-existent row', async () => {
      // Should not throw
      await deleteRow(store, 'non-existent-id')
    })
  })

  describe('getRow', () => {
    it('should return row with extracted cells', async () => {
      const rowId = await createRow(store, {
        databaseId,
        cells: {
          name: 'John Doe',
          age: 30
        }
      })

      const row = await getRow(store, rowId)

      expect(row).not.toBeNull()
      expect(row!.cells.name).toBe('John Doe')
      expect(row!.cells.age).toBe(30)
    })

    it('should return null for non-existent row', async () => {
      const row = await getRow(store, 'non-existent-id')
      expect(row).toBeNull()
    })
  })

  describe('queryRows', () => {
    it('should return rows for a database', async () => {
      await createRow(store, { databaseId, cells: { name: 'A' } })
      await createRow(store, { databaseId, cells: { name: 'B' } })
      await createRow(store, { databaseId, cells: { name: 'C' } })

      const { rows, hasMore } = await queryRows(store, databaseId)

      expect(rows).toHaveLength(3)
      expect(hasMore).toBe(false)
    })

    it('should not return rows from other databases', async () => {
      const otherDbId = await createTestDatabase(store)

      await createRow(store, { databaseId, cells: { name: 'A' } })
      await createRow(store, { databaseId: otherDbId, cells: { name: 'B' } })

      const { rows } = await queryRows(store, databaseId)

      expect(rows).toHaveLength(1)
      expect(rows[0].cells.name).toBe('A')
    })

    it('should paginate with limit', async () => {
      for (let i = 0; i < 10; i++) {
        await createRow(store, { databaseId, cells: { num: i } })
      }

      const page1 = await queryRows(store, databaseId, { limit: 3 })
      expect(page1.rows).toHaveLength(3)
      expect(page1.hasMore).toBe(true)
      expect(page1.cursor).toBeDefined()

      const page2 = await queryRows(store, databaseId, {
        limit: 3,
        cursor: page1.cursor
      })
      expect(page2.rows).toHaveLength(3)
      expect(page2.hasMore).toBe(true)
    })

    it('should sort by sortKey ascending by default', async () => {
      // Create rows with small delays to ensure different timestamps
      await createRow(store, { databaseId, cells: { name: 'First' } })
      await new Promise((r) => setTimeout(r, 10))
      await createRow(store, { databaseId, cells: { name: 'Second' } })
      await new Promise((r) => setTimeout(r, 10))
      await createRow(store, { databaseId, cells: { name: 'Third' } })

      const { rows } = await queryRows(store, databaseId)

      expect(rows[0].cells.name).toBe('First')
      expect(rows[1].cells.name).toBe('Second')
      expect(rows[2].cells.name).toBe('Third')
    })

    it('should sort descending when specified', async () => {
      await createRow(store, { databaseId, cells: { name: 'First' } })
      await new Promise((r) => setTimeout(r, 10))
      await createRow(store, { databaseId, cells: { name: 'Second' } })
      await new Promise((r) => setTimeout(r, 10))
      await createRow(store, { databaseId, cells: { name: 'Third' } })

      const { rows } = await queryRows(store, databaseId, {
        sortDirection: 'desc'
      })

      expect(rows[0].cells.name).toBe('Third')
      expect(rows[1].cells.name).toBe('Second')
      expect(rows[2].cells.name).toBe('First')
    })

    it('should not return deleted rows', async () => {
      const rowId = await createRow(store, { databaseId, cells: { name: 'A' } })
      await createRow(store, { databaseId, cells: { name: 'B' } })

      await deleteRow(store, rowId)

      const { rows } = await queryRows(store, databaseId)
      expect(rows).toHaveLength(1)
      expect(rows[0].cells.name).toBe('B')
    })
  })

  describe('moveRow', () => {
    it('should update row sortKey', async () => {
      const rowId = await createRow(store, { databaseId })
      const originalRow = await store.get(rowId)
      const originalSortKey = originalRow!.properties.sortKey

      await moveRow(store, rowId, { after: 'zzzzz' })

      const movedRow = await store.get(rowId)
      expect(movedRow!.properties.sortKey).not.toBe(originalSortKey)
    })

    it('should move a row before the provided sibling sort key', async () => {
      const rowA = await createRow(store, { databaseId, cells: { name: 'A' } })
      const rowB = await createRow(store, { databaseId, cells: { name: 'B' } })
      const rowC = await createRow(store, { databaseId, cells: { name: 'C' } })

      const target = await store.get(rowA)
      await moveRow(store, rowB, { before: target?.properties.sortKey as string })

      const { rows } = await queryRows(store, databaseId)
      expect(rows.map((row) => row.id)).toEqual([rowB, rowA, rowC])
    })
  })
})

describe('Conflict Resolution', () => {
  it('should merge concurrent cell edits to different columns', async () => {
    // Create two stores simulating two devices
    const setup1 = createTestStore()
    const setup2 = createTestStore()
    await setup1.store.initialize()
    await setup2.store.initialize()

    // Create database and row in store 1
    const databaseId = await createTestDatabase(setup1.store)
    const rowId = await createRow(setup1.store, {
      databaseId,
      cells: { name: 'Original', status: 'pending' }
    })

    // Sync to store 2
    const changes1 = await setup1.store.getAllChanges()
    for (const change of changes1) {
      await setup2.store.applyRemoteChange(change)
    }
    const syncPoint = setup1.store.getCurrentLamportTime()

    // Store 1 updates name
    await updateCell(setup1.store, rowId, 'name', 'Alice')

    // Store 2 updates status
    await updateCell(setup2.store, rowId, 'status', 'active')

    // Sync both ways
    const store1Changes = await setup1.store.getChangesSince(syncPoint)
    const store2Changes = await setup2.store.getChangesSince(syncPoint)

    for (const change of store1Changes) {
      await setup2.store.applyRemoteChange(change)
    }
    for (const change of store2Changes) {
      await setup1.store.applyRemoteChange(change)
    }

    // Both should have merged values
    const row1 = await getRow(setup1.store, rowId)
    const row2 = await getRow(setup2.store, rowId)

    expect(row1!.cells.name).toBe('Alice')
    expect(row1!.cells.status).toBe('active')
    expect(row2!.cells.name).toBe('Alice')
    expect(row2!.cells.status).toBe('active')
  })

  it('should use LWW for same-cell conflicts', async () => {
    const setup1 = createTestStore()
    const setup2 = createTestStore()
    await setup1.store.initialize()
    await setup2.store.initialize()

    // Create database and row in store 1
    const databaseId = await createTestDatabase(setup1.store)
    const rowId = await createRow(setup1.store, {
      databaseId,
      cells: { name: 'Original' }
    })

    // Sync to store 2
    const changes1 = await setup1.store.getAllChanges()
    for (const change of changes1) {
      await setup2.store.applyRemoteChange(change)
    }
    const syncPoint = setup1.store.getCurrentLamportTime()

    // Store 1 updates name
    await updateCell(setup1.store, rowId, 'name', 'Alice')

    // Sync store 1's update to store 2 first
    const store1Update = (await setup1.store.getChangesSince(syncPoint))[0]
    await setup2.store.applyRemoteChange(store1Update)

    // Now store 2 updates (will have higher Lamport time)
    const store2SyncPoint = setup2.store.getCurrentLamportTime()
    await updateCell(setup2.store, rowId, 'name', 'Bob')

    // Sync store 2's update back to store 1
    const store2Changes = await setup2.store.getChangesSince(store2SyncPoint)
    for (const change of store2Changes) {
      await setup1.store.applyRemoteChange(change)
    }

    // Both should converge to Bob (higher Lamport time)
    const row1 = await getRow(setup1.store, rowId)
    const row2 = await getRow(setup2.store, rowId)

    expect(row1!.cells.name).toBe('Bob')
    expect(row2!.cells.name).toBe('Bob')
  })

  it('syncs row ordering and row count changes across devices', async () => {
    const setup1 = createTestStore()
    const setup2 = createTestStore()
    await setup1.store.initialize()
    await setup2.store.initialize()

    const databaseId = await createTestDatabase(setup1.store)
    const rowA = await createRow(setup1.store, {
      databaseId,
      cells: { name: 'A' }
    })
    const rowB = await createRow(setup1.store, {
      databaseId,
      cells: { name: 'B' }
    })
    const rowC = await createRow(setup1.store, {
      databaseId,
      cells: { name: 'C' }
    })

    await syncChanges(setup1.store, setup2.store)
    const syncPoint = setup1.store.getCurrentLamportTime()

    const rowABeforeMove = await setup1.store.get(rowA)
    await moveRow(setup1.store, rowC, {
      before: rowABeforeMove?.properties.sortKey as string
    })
    await deleteRow(setup1.store, rowB)

    await syncChanges(setup1.store, setup2.store, syncPoint)

    const rows1 = await queryRows(setup1.store, databaseId)
    const rows2 = await queryRows(setup2.store, databaseId)
    const database1 = await setup1.store.get(databaseId)
    const database2 = await setup2.store.get(databaseId)

    expect(rows1.rows.map((row) => row.id)).toEqual([rowC, rowA])
    expect(rows2.rows.map((row) => row.id)).toEqual([rowC, rowA])
    expect(database1?.properties.rowCount).toBe(2)
    expect(database2?.properties.rowCount).toBe(2)
  })
})
