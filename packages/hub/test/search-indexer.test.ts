/**
 * @xnet/hub - Search indexer tests.
 */

import type { HubStorage, DatabaseRowRecord } from '../src/storage/interface'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  generateSearchableText,
  generateSearchableTextFromCells,
  isSearchableColumn,
  getSearchableTypes,
  type ColumnDefinition,
  type DatabaseRow
} from '../src/services/search-indexer'
import { createSQLiteStorage } from '../src/storage/sqlite'

describe('Search Indexer', () => {
  describe('generateSearchableText', () => {
    it('extracts text from text columns', () => {
      const columns: ColumnDefinition[] = [
        { id: 'title', name: 'Title', type: 'text' },
        { id: 'description', name: 'Description', type: 'text' }
      ]

      const row: DatabaseRow = {
        id: 'row-1',
        sortKey: 'a0',
        cells: { title: 'Hello World', description: 'This is a test' },
        createdAt: Date.now(),
        createdBy: 'did:key:test'
      }

      const text = generateSearchableText(row, columns)
      expect(text).toBe('Hello World This is a test')
    })

    it('extracts text from url, email, phone columns', () => {
      const columns: ColumnDefinition[] = [
        { id: 'website', name: 'Website', type: 'url' },
        { id: 'email', name: 'Email', type: 'email' },
        { id: 'phone', name: 'Phone', type: 'phone' }
      ]

      const row: DatabaseRow = {
        id: 'row-1',
        sortKey: 'a0',
        cells: {
          website: 'https://example.com',
          email: 'test@example.com',
          phone: '+1-555-1234'
        },
        createdAt: Date.now(),
        createdBy: 'did:key:test'
      }

      const text = generateSearchableText(row, columns)
      expect(text).toContain('https://example.com')
      expect(text).toContain('test@example.com')
      expect(text).toContain('+1-555-1234')
    })

    it('extracts option names from select columns', () => {
      const columns: ColumnDefinition[] = [
        {
          id: 'status',
          name: 'Status',
          type: 'select',
          config: {
            options: [
              { id: 'opt-1', name: 'Active' },
              { id: 'opt-2', name: 'Inactive' }
            ]
          }
        }
      ]

      const row: DatabaseRow = {
        id: 'row-1',
        sortKey: 'a0',
        cells: { status: 'opt-1' },
        createdAt: Date.now(),
        createdBy: 'did:key:test'
      }

      const text = generateSearchableText(row, columns)
      expect(text).toBe('Active')
    })

    it('extracts option names from multiSelect columns', () => {
      const columns: ColumnDefinition[] = [
        {
          id: 'tags',
          name: 'Tags',
          type: 'multiSelect',
          config: {
            options: [
              { id: 'tag-1', name: 'Important' },
              { id: 'tag-2', name: 'Urgent' },
              { id: 'tag-3', name: 'Review' }
            ]
          }
        }
      ]

      const row: DatabaseRow = {
        id: 'row-1',
        sortKey: 'a0',
        cells: { tags: ['tag-1', 'tag-3'] },
        createdAt: Date.now(),
        createdBy: 'did:key:test'
      }

      const text = generateSearchableText(row, columns)
      expect(text).toBe('Important Review')
    })

    it('strips HTML from richText columns', () => {
      const columns: ColumnDefinition[] = [{ id: 'content', name: 'Content', type: 'richText' }]

      const row: DatabaseRow = {
        id: 'row-1',
        sortKey: 'a0',
        cells: { content: '<p>Hello <strong>World</strong></p>' },
        createdAt: Date.now(),
        createdBy: 'did:key:test'
      }

      const text = generateSearchableText(row, columns)
      expect(text).toBe('Hello World')
    })

    it('ignores non-searchable columns', () => {
      const columns: ColumnDefinition[] = [
        { id: 'title', name: 'Title', type: 'text' },
        { id: 'count', name: 'Count', type: 'number' },
        { id: 'done', name: 'Done', type: 'checkbox' },
        { id: 'date', name: 'Date', type: 'date' }
      ]

      const row: DatabaseRow = {
        id: 'row-1',
        sortKey: 'a0',
        cells: { title: 'Test', count: 42, done: true, date: '2024-01-01' },
        createdAt: Date.now(),
        createdBy: 'did:key:test'
      }

      const text = generateSearchableText(row, columns)
      expect(text).toBe('Test')
    })

    it('handles null and undefined values', () => {
      const columns: ColumnDefinition[] = [
        { id: 'title', name: 'Title', type: 'text' },
        { id: 'description', name: 'Description', type: 'text' }
      ]

      const row: DatabaseRow = {
        id: 'row-1',
        sortKey: 'a0',
        cells: { title: 'Test', description: null },
        createdAt: Date.now(),
        createdBy: 'did:key:test'
      }

      const text = generateSearchableText(row, columns)
      expect(text).toBe('Test')
    })
  })

  describe('generateSearchableTextFromCells', () => {
    it('extracts all string values', () => {
      const cells = {
        title: 'Hello',
        description: 'World',
        count: 42
      }

      const text = generateSearchableTextFromCells(cells)
      expect(text).toContain('Hello')
      expect(text).toContain('World')
      expect(text).not.toContain('42')
    })

    it('handles arrays of strings', () => {
      const cells = {
        tags: ['one', 'two', 'three']
      }

      const text = generateSearchableTextFromCells(cells)
      expect(text).toBe('one two three')
    })
  })

  describe('isSearchableColumn', () => {
    it('returns true for searchable types', () => {
      expect(isSearchableColumn('text')).toBe(true)
      expect(isSearchableColumn('richText')).toBe(true)
      expect(isSearchableColumn('url')).toBe(true)
      expect(isSearchableColumn('email')).toBe(true)
      expect(isSearchableColumn('phone')).toBe(true)
      expect(isSearchableColumn('select')).toBe(true)
      expect(isSearchableColumn('multiSelect')).toBe(true)
    })

    it('returns false for non-searchable types', () => {
      expect(isSearchableColumn('number')).toBe(false)
      expect(isSearchableColumn('checkbox')).toBe(false)
      expect(isSearchableColumn('date')).toBe(false)
      expect(isSearchableColumn('relation')).toBe(false)
      expect(isSearchableColumn('formula')).toBe(false)
    })
  })

  describe('getSearchableTypes', () => {
    it('returns all searchable types', () => {
      const types = getSearchableTypes()
      expect(types).toContain('text')
      expect(types).toContain('richText')
      expect(types).toContain('select')
      expect(types.length).toBe(7)
    })
  })
})

describe('FTS5 Integration', () => {
  let storage: HubStorage
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hub-fts-test-'))
    storage = createSQLiteStorage(tmpDir)
  })

  afterEach(async () => {
    await storage.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  const createRow = (id: string, databaseId: string, searchable: string): DatabaseRowRecord => ({
    id,
    databaseId,
    sortKey: 'a0',
    data: {},
    searchable,
    createdAt: Date.now(),
    createdBy: 'did:key:test',
    updatedAt: Date.now()
  })

  it('finds rows by text content', async () => {
    await storage.insertDatabaseRow(createRow('row-1', 'db-1', 'Hello World'))
    await storage.insertDatabaseRow(createRow('row-2', 'db-1', 'Goodbye World'))
    await storage.insertDatabaseRow(createRow('row-3', 'db-1', 'Hello Universe'))

    const result = await storage.queryDatabaseRows({
      databaseId: 'db-1',
      search: 'Hello'
    })

    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((r) => r.id).sort()).toEqual(['row-1', 'row-3'])
  })

  it('handles prefix search', async () => {
    await storage.insertDatabaseRow(createRow('row-1', 'db-1', 'Programming in TypeScript'))
    await storage.insertDatabaseRow(createRow('row-2', 'db-1', 'JavaScript basics'))

    const result = await storage.queryDatabaseRows({
      databaseId: 'db-1',
      search: 'Type'
    })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].id).toBe('row-1')
  })

  it('updates index on row update', async () => {
    await storage.insertDatabaseRow(createRow('row-1', 'db-1', 'Original Title'))

    // Should find with original text
    let result = await storage.queryDatabaseRows({
      databaseId: 'db-1',
      search: 'Original'
    })
    expect(result.rows).toHaveLength(1)

    // Update the row
    await storage.updateDatabaseRow('row-1', {
      searchable: 'Updated Title',
      updatedAt: Date.now()
    })

    // Should find with new text
    result = await storage.queryDatabaseRows({
      databaseId: 'db-1',
      search: 'Updated'
    })
    expect(result.rows).toHaveLength(1)

    // Should not find with old text
    result = await storage.queryDatabaseRows({
      databaseId: 'db-1',
      search: 'Original'
    })
    expect(result.rows).toHaveLength(0)
  })

  it('removes from index on delete', async () => {
    await storage.insertDatabaseRow(createRow('row-1', 'db-1', 'Test Row'))

    // Should find before delete
    let result = await storage.queryDatabaseRows({
      databaseId: 'db-1',
      search: 'Test'
    })
    expect(result.rows).toHaveLength(1)

    // Delete the row
    await storage.deleteDatabaseRow('row-1')

    // Should not find after delete
    result = await storage.queryDatabaseRows({
      databaseId: 'db-1',
      search: 'Test'
    })
    expect(result.rows).toHaveLength(0)
  })

  it('combines search with filters', async () => {
    await storage.insertDatabaseRow({
      ...createRow('row-1', 'db-1', 'Important Document'),
      data: { status: 'active' }
    })
    await storage.insertDatabaseRow({
      ...createRow('row-2', 'db-1', 'Important Report'),
      data: { status: 'inactive' }
    })

    const result = await storage.queryDatabaseRows({
      databaseId: 'db-1',
      search: 'Important',
      filters: {
        operator: 'and',
        conditions: [{ columnId: 'status', operator: 'equals', value: 'active' }]
      }
    })

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].id).toBe('row-1')
  })

  it('handles multiple search terms with OR', async () => {
    await storage.insertDatabaseRow(createRow('row-1', 'db-1', 'Apple fruit'))
    await storage.insertDatabaseRow(createRow('row-2', 'db-1', 'Banana fruit'))
    await storage.insertDatabaseRow(createRow('row-3', 'db-1', 'Carrot vegetable'))

    const result = await storage.queryDatabaseRows({
      databaseId: 'db-1',
      search: 'Apple Banana'
    })

    expect(result.rows).toHaveLength(2)
  })
})
