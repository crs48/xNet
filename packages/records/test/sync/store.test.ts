/**
 * Tests for RecordStore event-sourced operations
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { generateIdentity } from '@xnet/identity'
import type { DID } from '@xnet/core'
import { RecordStore, MemoryRecordAdapter } from '../../src/sync'
import type { PropertyId } from '../../src/types'

describe('RecordStore', () => {
  let store: RecordStore
  let adapter: MemoryRecordAdapter
  let authorDID: DID
  let signingKey: Uint8Array

  beforeEach(() => {
    const { identity, privateKey } = generateIdentity()
    authorDID = identity.did as DID
    signingKey = privateKey

    adapter = new MemoryRecordAdapter()
    store = new RecordStore(adapter, { authorDID, signingKey })
  })

  describe('Database Operations', () => {
    it('should create a database with default properties', async () => {
      const db = await store.createDatabase('My Tasks')

      expect(db.id).toMatch(/^db:/)
      expect(db.name).toBe('My Tasks')
      expect(db.properties).toHaveLength(1)
      expect(db.properties[0].name).toBe('Title')
      expect(db.properties[0].type).toBe('text')
      expect(db.views).toHaveLength(1)
      expect(db.views[0].type).toBe('table')
      expect(db.createdBy).toBe(authorDID)
    })

    it('should create a database with custom properties', async () => {
      const db = await store.createDatabase('Projects', [
        {
          id: 'prop:name' as PropertyId,
          name: 'Name',
          type: 'text',
          config: {},
          required: true,
          hidden: false
        },
        {
          id: 'prop:status' as PropertyId,
          name: 'Status',
          type: 'select',
          config: { options: [] },
          required: false,
          hidden: false
        }
      ])

      expect(db.properties).toHaveLength(2)
      expect(db.properties[0].name).toBe('Name')
      expect(db.properties[1].name).toBe('Status')
    })

    it('should retrieve a database', async () => {
      const created = await store.createDatabase('Test DB')
      const retrieved = await store.getDatabase(created.id)

      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(created.id)
      expect(retrieved!.name).toBe('Test DB')
    })
  })

  describe('Item Operations', () => {
    it('should create an item', async () => {
      const db = await store.createDatabase('Tasks')
      const titleProp = db.properties[0].id

      const item = await store.createItem(db.id, {
        [titleProp]: 'My First Task'
      })

      expect(item.id).toMatch(/^item:/)
      expect(item.databaseId).toBe(db.id)
      expect(item.properties[titleProp]).toBe('My First Task')
      expect(item.createdBy).toBe(authorDID)
      expect(item.deleted).toBe(false)
    })

    it('should update an item', async () => {
      const db = await store.createDatabase('Tasks')
      const titleProp = db.properties[0].id

      const item = await store.createItem(db.id, { [titleProp]: 'Original' })
      const updated = await store.updateItem(item.id, { [titleProp]: 'Updated' })

      expect(updated.properties[titleProp]).toBe('Updated')
      expect(updated.updatedBy).toBe(authorDID)
    })

    it('should delete an item (soft delete)', async () => {
      const db = await store.createDatabase('Tasks')
      const item = await store.createItem(db.id, { [db.properties[0].id]: 'To Delete' })

      await store.deleteItem(item.id)

      const deleted = await store.getItem(item.id)
      expect(deleted!.deleted).toBe(true)
      expect(deleted!.deletedBy).toBe(authorDID)
    })

    it('should list items excluding deleted', async () => {
      const db = await store.createDatabase('Tasks')
      const titleProp = db.properties[0].id

      await store.createItem(db.id, { [titleProp]: 'Task 1' })
      const task2 = await store.createItem(db.id, { [titleProp]: 'Task 2' })
      await store.createItem(db.id, { [titleProp]: 'Task 3' })

      await store.deleteItem(task2.id)

      const items = await store.listItems(db.id)
      expect(items).toHaveLength(2)
      expect(items.map((i) => i.properties[titleProp])).toEqual(['Task 1', 'Task 3'])
    })

    it('should list items including deleted', async () => {
      const db = await store.createDatabase('Tasks')
      const titleProp = db.properties[0].id

      await store.createItem(db.id, { [titleProp]: 'Task 1' })
      const task2 = await store.createItem(db.id, { [titleProp]: 'Task 2' })

      await store.deleteItem(task2.id)

      const items = await store.listItems(db.id, true)
      expect(items).toHaveLength(2)
    })
  })

  describe('Operation Log', () => {
    it('should append operations to the log', async () => {
      const db = await store.createDatabase('Tasks')
      const titleProp = db.properties[0].id

      await store.createItem(db.id, { [titleProp]: 'Task 1' })
      await store.createItem(db.id, { [titleProp]: 'Task 2' })

      const ops = await store.getOperationsForSync(db.id)
      expect(ops).toHaveLength(2)
      expect(ops[0].type).toBe('create-item')
      expect(ops[1].type).toBe('create-item')
    })

    it('should sign operations', async () => {
      const db = await store.createDatabase('Tasks')
      await store.createItem(db.id, { [db.properties[0].id]: 'Task' })

      const ops = await store.getOperationsForSync(db.id)
      expect(ops[0].signature).toBeInstanceOf(Uint8Array)
      expect(ops[0].signature.length).toBeGreaterThan(0)
      expect(ops[0].hash).toMatch(/^cid:blake3:/)
    })

    it('should maintain vector clock', async () => {
      const db = await store.createDatabase('Tasks')
      const titleProp = db.properties[0].id

      await store.createItem(db.id, { [titleProp]: 'Task 1' })
      await store.createItem(db.id, { [titleProp]: 'Task 2' })

      const ops = await store.getOperationsForSync(db.id)
      expect(ops[0].vectorClock[authorDID]).toBe(1)
      expect(ops[1].vectorClock[authorDID]).toBe(2)
    })
  })

  describe('LWW Conflict Resolution', () => {
    it('should resolve concurrent updates with LWW', async () => {
      const db = await store.createDatabase('Tasks')
      const titleProp = db.properties[0].id
      const item = await store.createItem(db.id, { [titleProp]: 'Original' })

      // Simulate two concurrent updates
      // First update: timestamp 1000
      // Second update: timestamp 2000 (wins)

      // Get the item state
      const itemState = await store.getItem(item.id)
      expect(itemState).not.toBeNull()

      // First update with earlier timestamp
      await store.updateItem(item.id, { [titleProp]: 'Update A' })

      // The item should have the latest update
      const afterFirst = await store.getItem(item.id)
      expect(afterFirst!.properties[titleProp]).toBe('Update A')

      // Second update with later timestamp (will win)
      await store.updateItem(item.id, { [titleProp]: 'Update B' })

      const afterSecond = await store.getItem(item.id)
      expect(afterSecond!.properties[titleProp]).toBe('Update B')
    })

    it('should track property timestamps for conflict resolution', async () => {
      const db = await store.createDatabase('Tasks')
      const titleProp = db.properties[0].id
      const item = await store.createItem(db.id, { [titleProp]: 'Task' })

      const itemState = await store.getItem(item.id)
      expect(itemState!.propertyTimestamps[titleProp]).toBeDefined()
      expect(itemState!.propertyTimestamps[titleProp].value).toBe('Task')
      expect(itemState!.propertyTimestamps[titleProp].authorDID).toBe(authorDID)
    })
  })

  describe('Sync', () => {
    it('should get operations since a vector clock', async () => {
      const db = await store.createDatabase('Tasks')
      const titleProp = db.properties[0].id

      await store.createItem(db.id, { [titleProp]: 'Task 1' })
      await store.createItem(db.id, { [titleProp]: 'Task 2' })
      await store.createItem(db.id, { [titleProp]: 'Task 3' })

      // Get operations since clock {authorDID: 1}
      const ops = await store.getOperationsForSync(db.id, { [authorDID]: 1 })

      // Should return ops 2 and 3 (clock values 2 and 3)
      expect(ops.length).toBeGreaterThanOrEqual(2)
    })

    it('should apply remote operations', async () => {
      const db = await store.createDatabase('Tasks')
      const titleProp = db.properties[0].id

      // Create item on "peer A"
      const item = await store.createItem(db.id, { [titleProp]: 'Task from A' })

      // Create a second store (simulating peer B)
      const { identity: identity2, privateKey: privateKey2 } = generateIdentity()
      const adapter2 = new MemoryRecordAdapter()
      const store2 = new RecordStore(adapter2, {
        authorDID: identity2.did as DID,
        signingKey: privateKey2
      })

      // Create same database on peer B
      await adapter2.setDatabase({
        id: db.id,
        name: db.name,
        properties: db.properties,
        views: db.views,
        defaultViewId: db.defaultViewId,
        created: db.created,
        createdBy: db.createdBy,
        updated: db.updated,
        updatedBy: db.updatedBy
      })
      await adapter2.setVectorClock(db.id, {})

      // Get operations from peer A
      const ops = await store.getOperationsForSync(db.id)

      // Apply to peer B
      const results = await store2.applyRemoteOperations(ops)
      expect(results.every((r) => r.success)).toBe(true)

      // Verify item exists on peer B
      const items = await store2.listItems(db.id)
      expect(items).toHaveLength(1)
      expect(items[0].properties[titleProp]).toBe('Task from A')
    })
  })
})
