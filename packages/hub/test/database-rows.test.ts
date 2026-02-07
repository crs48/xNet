/**
 * @xnet/hub - Database row storage and query tests.
 */

import type { HubStorage, DatabaseRowRecord } from '../src/storage/interface'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemoryStorage } from '../src/storage/memory'
import { createSQLiteStorage } from '../src/storage/sqlite'

const createTestRow = (
  id: string,
  databaseId: string,
  sortKey: string,
  data: Record<string, unknown> = {}
): DatabaseRowRecord => ({
  id,
  databaseId,
  sortKey,
  data,
  searchable: Object.values(data)
    .filter((v) => typeof v === 'string')
    .join(' '),
  createdAt: Date.now(),
  createdBy: 'did:key:test',
  updatedAt: Date.now()
})

describe('Database Row Storage', () => {
  describe('SQLite Storage', () => {
    let storage: HubStorage
    let tmpDir: string

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'hub-test-'))
      storage = createSQLiteStorage(tmpDir)
    })

    afterEach(async () => {
      await storage.close()
      rmSync(tmpDir, { recursive: true, force: true })
    })

    it('should insert and retrieve a row', async () => {
      const row = createTestRow('row-1', 'db-1', 'a0', { title: 'Test Row', status: 'active' })
      await storage.insertDatabaseRow(row)

      const retrieved = await storage.getDatabaseRow('row-1')
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe('row-1')
      expect(retrieved!.databaseId).toBe('db-1')
      expect(retrieved!.data.title).toBe('Test Row')
      expect(retrieved!.data.status).toBe('active')
    })

    it('should update a row', async () => {
      const row = createTestRow('row-1', 'db-1', 'a0', { title: 'Original' })
      await storage.insertDatabaseRow(row)

      await storage.updateDatabaseRow('row-1', {
        data: { title: 'Updated' },
        updatedAt: Date.now()
      })

      const retrieved = await storage.getDatabaseRow('row-1')
      expect(retrieved!.data.title).toBe('Updated')
    })

    it('should delete a row', async () => {
      const row = createTestRow('row-1', 'db-1', 'a0', { title: 'Test' })
      await storage.insertDatabaseRow(row)

      await storage.deleteDatabaseRow('row-1')

      const retrieved = await storage.getDatabaseRow('row-1')
      expect(retrieved).toBeNull()
    })

    it('should count rows in a database', async () => {
      await storage.insertDatabaseRow(createTestRow('row-1', 'db-1', 'a0', {}))
      await storage.insertDatabaseRow(createTestRow('row-2', 'db-1', 'a1', {}))
      await storage.insertDatabaseRow(createTestRow('row-3', 'db-2', 'a0', {}))

      const count1 = await storage.getDatabaseRowCount('db-1')
      const count2 = await storage.getDatabaseRowCount('db-2')

      expect(count1).toBe(2)
      expect(count2).toBe(1)
    })

    it('should batch insert rows', async () => {
      const rows = [
        createTestRow('row-1', 'db-1', 'a0', { title: 'Row 1' }),
        createTestRow('row-2', 'db-1', 'a1', { title: 'Row 2' }),
        createTestRow('row-3', 'db-1', 'a2', { title: 'Row 3' })
      ]

      await storage.batchInsertDatabaseRows(rows)

      const count = await storage.getDatabaseRowCount('db-1')
      expect(count).toBe(3)
    })

    describe('queryDatabaseRows', () => {
      beforeEach(async () => {
        // Seed test data
        const rows = [
          createTestRow('row-1', 'db-1', 'a0', { title: 'Alpha', status: 'active', priority: 1 }),
          createTestRow('row-2', 'db-1', 'a1', { title: 'Beta', status: 'inactive', priority: 2 }),
          createTestRow('row-3', 'db-1', 'a2', { title: 'Gamma', status: 'active', priority: 3 }),
          createTestRow('row-4', 'db-1', 'a3', { title: 'Delta', status: 'active', priority: 1 }),
          createTestRow('row-5', 'db-1', 'a4', {
            title: 'Epsilon',
            status: 'inactive',
            priority: 2
          })
        ]
        await storage.batchInsertDatabaseRows(rows)
      })

      it('should return all rows for a database', async () => {
        const result = await storage.queryDatabaseRows({ databaseId: 'db-1' })

        expect(result.rows).toHaveLength(5)
        expect(result.total).toBe(5)
        expect(result.hasMore).toBe(false)
      })

      it('should paginate results', async () => {
        const page1 = await storage.queryDatabaseRows({ databaseId: 'db-1', limit: 2 })

        expect(page1.rows).toHaveLength(2)
        expect(page1.hasMore).toBe(true)
        expect(page1.cursor).toBeDefined()

        const page2 = await storage.queryDatabaseRows({
          databaseId: 'db-1',
          limit: 2,
          cursor: page1.cursor
        })

        expect(page2.rows).toHaveLength(2)
        expect(page2.hasMore).toBe(true)

        // Ensure no overlap
        const page1Ids = new Set(page1.rows.map((r) => r.id))
        expect(page2.rows.every((r) => !page1Ids.has(r.id))).toBe(true)
      })

      it('should filter by equals', async () => {
        const result = await storage.queryDatabaseRows({
          databaseId: 'db-1',
          filters: {
            operator: 'and',
            conditions: [{ columnId: 'status', operator: 'equals', value: 'active' }]
          }
        })

        expect(result.rows).toHaveLength(3)
        expect(result.rows.every((r) => r.data.status === 'active')).toBe(true)
      })

      it('should filter by contains', async () => {
        const result = await storage.queryDatabaseRows({
          databaseId: 'db-1',
          filters: {
            operator: 'and',
            conditions: [{ columnId: 'title', operator: 'contains', value: 'a' }]
          }
        })

        expect(result.rows).toHaveLength(4) // Alpha, Beta, Gamma, Delta
      })

      it('should filter by greaterThan', async () => {
        const result = await storage.queryDatabaseRows({
          databaseId: 'db-1',
          filters: {
            operator: 'and',
            conditions: [{ columnId: 'priority', operator: 'greaterThan', value: 1 }]
          }
        })

        expect(result.rows).toHaveLength(3) // priority 2 and 3
      })

      it('should combine filters with AND', async () => {
        const result = await storage.queryDatabaseRows({
          databaseId: 'db-1',
          filters: {
            operator: 'and',
            conditions: [
              { columnId: 'status', operator: 'equals', value: 'active' },
              { columnId: 'priority', operator: 'equals', value: 1 }
            ]
          }
        })

        expect(result.rows).toHaveLength(2) // Alpha and Delta
      })

      it('should combine filters with OR', async () => {
        const result = await storage.queryDatabaseRows({
          databaseId: 'db-1',
          filters: {
            operator: 'or',
            conditions: [
              { columnId: 'title', operator: 'equals', value: 'Alpha' },
              { columnId: 'title', operator: 'equals', value: 'Beta' }
            ]
          }
        })

        expect(result.rows).toHaveLength(2)
      })

      it('should sort by column ascending', async () => {
        const result = await storage.queryDatabaseRows({
          databaseId: 'db-1',
          sorts: [{ columnId: 'title', direction: 'asc' }]
        })

        const titles = result.rows.map((r) => r.data.title)
        expect(titles).toEqual(['Alpha', 'Beta', 'Delta', 'Epsilon', 'Gamma'])
      })

      it('should sort by column descending', async () => {
        const result = await storage.queryDatabaseRows({
          databaseId: 'db-1',
          sorts: [{ columnId: 'priority', direction: 'desc' }]
        })

        const priorities = result.rows.map((r) => r.data.priority)
        expect(priorities[0]).toBe(3)
      })

      it('should support full-text search', async () => {
        // Update searchable text
        await storage.updateDatabaseRow('row-1', {
          searchable: 'Alpha is the first letter',
          updatedAt: Date.now()
        })

        const result = await storage.queryDatabaseRows({
          databaseId: 'db-1',
          search: 'first'
        })

        expect(result.rows.some((r) => r.id === 'row-1')).toBe(true)
      })
    })
  })

  describe('Memory Storage', () => {
    let storage: HubStorage

    beforeEach(() => {
      storage = createMemoryStorage()
    })

    afterEach(async () => {
      await storage.close()
    })

    it('should insert and retrieve a row', async () => {
      const row = createTestRow('row-1', 'db-1', 'a0', { title: 'Test Row' })
      await storage.insertDatabaseRow(row)

      const retrieved = await storage.getDatabaseRow('row-1')
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe('row-1')
      expect(retrieved!.data.title).toBe('Test Row')
    })

    it('should query with filters', async () => {
      await storage.insertDatabaseRow(createTestRow('row-1', 'db-1', 'a0', { status: 'active' }))
      await storage.insertDatabaseRow(createTestRow('row-2', 'db-1', 'a1', { status: 'inactive' }))

      const result = await storage.queryDatabaseRows({
        databaseId: 'db-1',
        filters: {
          operator: 'and',
          conditions: [{ columnId: 'status', operator: 'equals', value: 'active' }]
        }
      })

      expect(result.rows).toHaveLength(1)
      expect(result.rows[0].id).toBe('row-1')
    })

    it('should paginate results', async () => {
      for (let i = 0; i < 10; i++) {
        await storage.insertDatabaseRow(createTestRow(`row-${i}`, 'db-1', `a${i}`, { index: i }))
      }

      const page1 = await storage.queryDatabaseRows({ databaseId: 'db-1', limit: 3 })
      expect(page1.rows).toHaveLength(3)
      expect(page1.hasMore).toBe(true)

      const page2 = await storage.queryDatabaseRows({
        databaseId: 'db-1',
        limit: 3,
        cursor: page1.cursor
      })
      expect(page2.rows).toHaveLength(3)

      // No overlap
      const page1Ids = new Set(page1.rows.map((r) => r.id))
      expect(page2.rows.every((r) => !page1Ids.has(r.id))).toBe(true)
    })
  })
})
