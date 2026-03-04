/**
 * @xnetjs/hub - DatabaseQueryService tests.
 */

import type { HubStorage, DatabaseRowRecord } from '../src/storage/interface'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseQueryService } from '../src/services/database-query'
import { createSQLiteStorage } from '../src/storage/sqlite'

// Skip SQLite tests if native bindings are not available (e.g., wrong Node.js version)
let sqliteUnavailable = false
try {
  const tmpDir = mkdtempSync(join(tmpdir(), 'hub-probe-'))
  createSQLiteStorage(tmpDir).close()
  rmSync(tmpDir, { recursive: true, force: true })
} catch {
  sqliteUnavailable = true
}

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

describe.skipIf(sqliteUnavailable)('DatabaseQueryService', () => {
  let storage: HubStorage
  let service: DatabaseQueryService
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hub-test-'))
    storage = createSQLiteStorage(tmpDir)
    service = new DatabaseQueryService(storage)

    // Seed test data
    const rows = [
      createTestRow('row-1', 'db-1', 'a0', { title: 'Alpha', status: 'active' }),
      createTestRow('row-2', 'db-1', 'a1', { title: 'Beta', status: 'inactive' }),
      createTestRow('row-3', 'db-1', 'a2', { title: 'Gamma', status: 'active' })
    ]
    await storage.batchInsertDatabaseRows(rows)
  })

  afterEach(async () => {
    await storage.close()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('query', () => {
    it('should return paginated rows', async () => {
      const response = await service.query({
        type: 'database-query',
        id: 'req-1',
        databaseId: 'db-1',
        limit: 2
      })

      expect(response.type).toBe('database-query-result')
      expect(response.id).toBe('req-1')
      expect(response.rows).toHaveLength(2)
      expect(response.hasMore).toBe(true)
      expect(response.total).toBe(3)
      expect(response.source).toBe('sqlite')
      expect(response.queryTime).toBeGreaterThan(0)
    })

    it('should apply filters', async () => {
      const response = await service.query({
        type: 'database-query',
        id: 'req-1',
        databaseId: 'db-1',
        filters: {
          operator: 'and',
          conditions: [{ columnId: 'status', operator: 'equals', value: 'active' }]
        }
      })

      expect(response.rows).toHaveLength(2)
      expect(response.rows.every((r) => r.cells.status === 'active')).toBe(true)
    })

    it('should serialize rows correctly', async () => {
      const response = await service.query({
        type: 'database-query',
        id: 'req-1',
        databaseId: 'db-1',
        limit: 1
      })

      const row = response.rows[0]
      expect(row).toHaveProperty('id')
      expect(row).toHaveProperty('sortKey')
      expect(row).toHaveProperty('cells')
      expect(row).toHaveProperty('createdAt')
      expect(row).toHaveProperty('createdBy')
    })
  })

  describe('getCount', () => {
    it('should return row count', async () => {
      const response = await service.getCount({
        type: 'database-count',
        id: 'req-1',
        databaseId: 'db-1'
      })

      expect(response.type).toBe('database-count-result')
      expect(response.count).toBe(3)
    })
  })

  describe('insertRow', () => {
    it('should insert a row', async () => {
      const row = createTestRow('row-4', 'db-1', 'a3', { title: 'Delta' })
      const response = await service.insertRow({
        type: 'database-row-insert',
        id: 'req-1',
        row
      })

      expect(response.type).toBe('database-row-ack')
      expect(response.success).toBe(true)

      const count = await storage.getDatabaseRowCount('db-1')
      expect(count).toBe(4)
    })
  })

  describe('updateRow', () => {
    it('should update a row', async () => {
      const response = await service.updateRow({
        type: 'database-row-update',
        id: 'req-1',
        rowId: 'row-1',
        updates: { data: { title: 'Updated Alpha' } }
      })

      expect(response.success).toBe(true)

      const row = await storage.getDatabaseRow('row-1')
      expect(row!.data.title).toBe('Updated Alpha')
    })
  })

  describe('deleteRow', () => {
    it('should delete a row', async () => {
      const response = await service.deleteRow({
        type: 'database-row-delete',
        id: 'req-1',
        rowId: 'row-1'
      })

      expect(response.success).toBe(true)

      const row = await storage.getDatabaseRow('row-1')
      expect(row).toBeNull()
    })
  })

  describe('getRow', () => {
    it('should get a single row', async () => {
      const row = await service.getRow('row-1')

      expect(row).not.toBeNull()
      expect(row!.id).toBe('row-1')
      expect(row!.data.title).toBe('Alpha')
    })

    it('should return null for non-existent row', async () => {
      const row = await service.getRow('non-existent')
      expect(row).toBeNull()
    })
  })

  describe('batchInsert', () => {
    it('should batch insert rows', async () => {
      const rows = [
        createTestRow('row-4', 'db-1', 'a3', { title: 'Delta' }),
        createTestRow('row-5', 'db-1', 'a4', { title: 'Epsilon' })
      ]

      const result = await service.batchInsert(rows)

      expect(result.inserted).toBe(2)
      expect(result.errors).toHaveLength(0)

      const count = await storage.getDatabaseRowCount('db-1')
      expect(count).toBe(5)
    })
  })
})
