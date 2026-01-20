import { describe, it, expect } from 'vitest'
import {
  createDatabase,
  updateDatabase,
  cloneDatabase,
  validateDatabase
} from '../../src/schema/database'

describe('Database Schema Operations', () => {
  const createdBy = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as const

  describe('createDatabase', () => {
    it('creates a database with default title property', () => {
      const db = createDatabase({
        name: 'Test Database',
        createdBy
      })

      expect(db.name).toBe('Test Database')
      expect(db.properties).toHaveLength(1)
      expect(db.properties[0].name).toBe('Title')
      expect(db.properties[0].type).toBe('text')
      expect(db.properties[0].required).toBe(true)
    })

    it('creates a default table view', () => {
      const db = createDatabase({
        name: 'Test Database',
        createdBy
      })

      expect(db.views).toHaveLength(1)
      expect(db.views[0].type).toBe('table')
      expect(db.views[0].name).toBe('Table')
      expect(db.defaultViewId).toBe(db.views[0].id)
    })

    it('creates database with custom properties', () => {
      const db = createDatabase({
        name: 'Test Database',
        createdBy,
        properties: [
          { name: 'Status', type: 'select', config: {}, required: false, hidden: false },
          { name: 'Priority', type: 'number', config: {}, required: false, hidden: false }
        ]
      })

      expect(db.properties).toHaveLength(3)
      expect(db.properties[1].name).toBe('Status')
      expect(db.properties[2].name).toBe('Priority')
    })

    it('sets icon and cover', () => {
      const db = createDatabase({
        name: 'Test Database',
        createdBy,
        icon: '📊',
        cover: 'https://example.com/cover.jpg'
      })

      expect(db.icon).toBe('📊')
      expect(db.cover).toBe('https://example.com/cover.jpg')
    })

    it('sets created and updated timestamps', () => {
      const before = Date.now()
      const db = createDatabase({
        name: 'Test Database',
        createdBy
      })
      const after = Date.now()

      expect(db.created).toBeGreaterThanOrEqual(before)
      expect(db.created).toBeLessThanOrEqual(after)
      expect(db.updated).toBe(db.created)
    })
  })

  describe('updateDatabase', () => {
    it('updates database name', () => {
      const db = createDatabase({ name: 'Original', createdBy })
      const updated = updateDatabase(db, { name: 'Updated' })

      expect(updated.name).toBe('Updated')
      expect(updated.updated).toBeGreaterThanOrEqual(db.created)
    })

    it('updates icon', () => {
      const db = createDatabase({ name: 'Test', createdBy })
      const updated = updateDatabase(db, { icon: '🎉' })

      expect(updated.icon).toBe('🎉')
    })

    it('removes icon when set to null', () => {
      const db = createDatabase({ name: 'Test', createdBy, icon: '📊' })
      const updated = updateDatabase(db, { icon: null })

      expect(updated.icon).toBeUndefined()
    })

    it('preserves unchanged fields', () => {
      const db = createDatabase({ name: 'Test', createdBy, icon: '📊' })
      const updated = updateDatabase(db, { name: 'Updated' })

      expect(updated.icon).toBe('📊')
      expect(updated.properties).toEqual(db.properties)
    })
  })

  describe('cloneDatabase', () => {
    it('creates a new database with different ID', () => {
      const original = createDatabase({ name: 'Original', createdBy })
      const clone = cloneDatabase(original, 'Clone', createdBy)

      expect(clone.id).not.toBe(original.id)
      expect(clone.name).toBe('Clone')
    })

    it('creates new IDs for properties', () => {
      const original = createDatabase({ name: 'Original', createdBy })
      const clone = cloneDatabase(original, 'Clone', createdBy)

      expect(clone.properties[0].id).not.toBe(original.properties[0].id)
    })

    it('creates new IDs for views', () => {
      const original = createDatabase({ name: 'Original', createdBy })
      const clone = cloneDatabase(original, 'Clone', createdBy)

      expect(clone.views[0].id).not.toBe(original.views[0].id)
    })

    it('preserves property references in views', () => {
      const original = createDatabase({ name: 'Original', createdBy })
      const clone = cloneDatabase(original, 'Clone', createdBy)

      // The cloned view should reference the cloned property
      expect(clone.views[0].visibleProperties[0]).toBe(clone.properties[0].id)
    })
  })

  describe('validateDatabase', () => {
    it('validates a correct database', () => {
      const db = createDatabase({ name: 'Test', createdBy })
      const result = validateDatabase(db)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('detects missing name', () => {
      const db = createDatabase({ name: 'Test', createdBy })
      db.name = ''
      const result = validateDatabase(db)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Database name is required')
    })

    it('detects invalid default view', () => {
      const db = createDatabase({ name: 'Test', createdBy })
      db.defaultViewId = 'view:invalid' as any
      const result = validateDatabase(db)

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Default view ID does not match any view')
    })
  })
})
