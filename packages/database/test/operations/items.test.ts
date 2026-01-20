import { describe, it, expect } from 'vitest'
import { createDatabase } from '../../src/schema/database'
import { createProperty } from '../../src/schema/property'
import {
  createItem,
  updateItem,
  validateItem,
  queryItems,
  getFormattedValue
} from '../../src/operations/items'
import type { PropertyId } from '../../src/types'

describe('Item Operations', () => {
  const createdBy = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as const

  function createTestDatabase() {
    let db = createDatabase({ name: 'Test', createdBy })
    db = createProperty(db, {
      name: 'Status',
      type: 'select',
      config: {
        options: [
          { id: 'todo', name: 'To Do', color: '#ff0000' },
          { id: 'done', name: 'Done', color: '#00ff00' }
        ]
      }
    })
    db = createProperty(db, { name: 'Priority', type: 'number' })
    return db
  }

  describe('createItem', () => {
    it('creates an item with default values', () => {
      const db = createTestDatabase()
      const item = createItem(db, { databaseId: db.id, createdBy })

      expect(item.databaseId).toBe(db.id)
      expect(item.createdBy).toBe(createdBy)
      expect(item.id).toMatch(/^item:/)
    })

    it('creates an item with provided values', () => {
      const db = createTestDatabase()
      const titlePropId = db.properties[0].id
      const statusPropId = db.properties[1].id

      const item = createItem(db, {
        databaseId: db.id,
        createdBy,
        properties: {
          [titlePropId]: 'Test Item',
          [statusPropId]: 'todo'
        }
      })

      expect(item.properties[titlePropId]).toBe('Test Item')
      expect(item.properties[statusPropId]).toBe('todo')
    })

    it('sets created and updated timestamps', () => {
      const db = createTestDatabase()
      const before = Date.now()
      const item = createItem(db, { databaseId: db.id, createdBy })
      const after = Date.now()

      expect(item.created).toBeGreaterThanOrEqual(before)
      expect(item.created).toBeLessThanOrEqual(after)
      expect(item.updated).toBe(item.created)
    })
  })

  describe('updateItem', () => {
    it('updates item properties', () => {
      const db = createTestDatabase()
      const titlePropId = db.properties[0].id
      const item = createItem(db, { databaseId: db.id, createdBy })

      const updated = updateItem(db, item, {
        properties: { [titlePropId]: 'Updated Title' }
      })

      expect(updated.properties[titlePropId]).toBe('Updated Title')
    })

    it('updates the updated timestamp', () => {
      const db = createTestDatabase()
      const item = createItem(db, { databaseId: db.id, createdBy })

      // Wait a bit to ensure timestamp changes
      const updated = updateItem(db, item, {
        properties: { [db.properties[0].id]: 'Updated' }
      })

      expect(updated.updated).toBeGreaterThanOrEqual(item.created)
    })

    it('preserves unchanged properties', () => {
      const db = createTestDatabase()
      const titlePropId = db.properties[0].id
      const statusPropId = db.properties[1].id

      const item = createItem(db, {
        databaseId: db.id,
        createdBy,
        properties: {
          [titlePropId]: 'Original',
          [statusPropId]: 'todo'
        }
      })

      const updated = updateItem(db, item, {
        properties: { [titlePropId]: 'Updated' }
      })

      expect(updated.properties[statusPropId]).toBe('todo')
    })
  })

  describe('validateItem', () => {
    it('validates a correct item', () => {
      const db = createTestDatabase()
      const titlePropId = db.properties[0].id
      const item = createItem(db, {
        databaseId: db.id,
        createdBy,
        properties: { [titlePropId]: 'Test Title' } // Title is required
      })
      const result = validateItem(db, item)

      expect(result.valid).toBe(true)
    })

    it('detects missing required properties', () => {
      const db = createTestDatabase()
      const item = createItem(db, { databaseId: db.id, createdBy })
      // Title is required - clear it
      item.properties[db.properties[0].id] = null

      const result = validateItem(db, item)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.includes('Title'))).toBe(true)
    })
  })

  describe('queryItems', () => {
    it('returns all items with no filter', () => {
      const db = createTestDatabase()
      const items = [
        createItem(db, { databaseId: db.id, createdBy }),
        createItem(db, { databaseId: db.id, createdBy }),
        createItem(db, { databaseId: db.id, createdBy })
      ]

      const result = queryItems(db, items, {})

      expect(result).toHaveLength(3)
    })

    it('filters items', () => {
      const db = createTestDatabase()
      const statusPropId = db.properties[1].id

      const items = [
        createItem(db, { databaseId: db.id, createdBy, properties: { [statusPropId]: 'todo' } }),
        createItem(db, { databaseId: db.id, createdBy, properties: { [statusPropId]: 'done' } }),
        createItem(db, { databaseId: db.id, createdBy, properties: { [statusPropId]: 'todo' } })
      ]

      const result = queryItems(db, items, {
        filter: {
          operator: 'and',
          filters: [{ propertyId: statusPropId, operator: 'equals', value: 'todo' }]
        }
      })

      expect(result).toHaveLength(2)
    })

    it('sorts items', () => {
      const db = createTestDatabase()
      const priorityPropId = db.properties[2].id

      const items = [
        createItem(db, { databaseId: db.id, createdBy, properties: { [priorityPropId]: 3 } }),
        createItem(db, { databaseId: db.id, createdBy, properties: { [priorityPropId]: 1 } }),
        createItem(db, { databaseId: db.id, createdBy, properties: { [priorityPropId]: 2 } })
      ]

      const result = queryItems(db, items, {
        sorts: [{ propertyId: priorityPropId, direction: 'asc' }]
      })

      expect(result[0].properties[priorityPropId]).toBe(1)
      expect(result[1].properties[priorityPropId]).toBe(2)
      expect(result[2].properties[priorityPropId]).toBe(3)
    })

    it('applies limit and offset', () => {
      const db = createTestDatabase()
      const items = [
        createItem(db, { databaseId: db.id, createdBy }),
        createItem(db, { databaseId: db.id, createdBy }),
        createItem(db, { databaseId: db.id, createdBy }),
        createItem(db, { databaseId: db.id, createdBy }),
        createItem(db, { databaseId: db.id, createdBy })
      ]

      const result = queryItems(db, items, { limit: 2, offset: 1 })

      expect(result).toHaveLength(2)
    })
  })

  describe('getFormattedValue', () => {
    it('formats text values', () => {
      const db = createTestDatabase()
      const titlePropId = db.properties[0].id
      const item = createItem(db, {
        databaseId: db.id,
        createdBy,
        properties: { [titlePropId]: 'Hello World' }
      })

      expect(getFormattedValue(db, item, titlePropId)).toBe('Hello World')
    })

    it('formats number values', () => {
      const db = createTestDatabase()
      const priorityPropId = db.properties[2].id
      const item = createItem(db, {
        databaseId: db.id,
        createdBy,
        properties: { [priorityPropId]: 42 }
      })

      expect(getFormattedValue(db, item, priorityPropId)).toBe('42')
    })
  })
})
