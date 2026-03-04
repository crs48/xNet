/**
 * @xnetjs/sqlite - Electron adapter tests with better-sqlite3
 *
 * These tests use the actual better-sqlite3 library to test:
 * - FTS5 full-text search (not available in sql.js)
 * - Performance benchmarks
 * - WAL mode and checkpointing
 */

import { randomUUID } from 'crypto'
import { unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { SCHEMA_VERSION } from '../schema'
import { ElectronSQLiteAdapter, createElectronSQLiteAdapter } from './electron'

// Test database helper
function getTestDbPath(): string {
  return join(tmpdir(), `xnet-test-${randomUUID()}.db`)
}

function cleanupDb(path: string): void {
  const files = [path, `${path}-wal`, `${path}-shm`]
  for (const file of files) {
    try {
      if (existsSync(file)) unlinkSync(file)
    } catch {
      // Ignore cleanup errors
    }
  }
}

describe('ElectronSQLiteAdapter', () => {
  let adapter: ElectronSQLiteAdapter
  let dbPath: string

  beforeEach(async () => {
    dbPath = getTestDbPath()
    adapter = await createElectronSQLiteAdapter({ path: dbPath })
  })

  afterEach(async () => {
    if (adapter?.isOpen()) {
      await adapter.close()
    }
    cleanupDb(dbPath)
  })

  describe('Lifecycle', () => {
    it('creates database file', () => {
      expect(existsSync(dbPath)).toBe(true)
    })

    it('enables WAL mode', async () => {
      const result = await adapter.queryOne<{ journal_mode: string }>('PRAGMA journal_mode')
      expect(result?.journal_mode).toBe('wal')
    })

    it('enables foreign keys', async () => {
      const result = await adapter.queryOne<{ foreign_keys: number }>('PRAGMA foreign_keys')
      expect(result?.foreign_keys).toBe(1)
    })

    it('applies schema on creation', async () => {
      const version = await adapter.getSchemaVersion()
      expect(version).toBe(SCHEMA_VERSION)
    })

    it('closes cleanly', async () => {
      await adapter.close()
      expect(adapter.isOpen()).toBe(false)
    })
  })

  describe('Query Execution', () => {
    it('inserts and queries rows', async () => {
      const now = Date.now()

      await adapter.run(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
        ['node-1', 'xnet://Page/1.0', now, now, 'did:key:test']
      )

      const rows = await adapter.query<{ id: string; schema_id: string }>(
        'SELECT id, schema_id FROM nodes'
      )

      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe('node-1')
    })

    it('returns run result with changes count', async () => {
      const now = Date.now()

      await adapter.run(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
        ['node-1', 'xnet://Page/1.0', now, now, 'did:key:test']
      )

      const result = await adapter.run('UPDATE nodes SET schema_id = ? WHERE id = ?', [
        'xnet://Database/1.0',
        'node-1'
      ])

      expect(result.changes).toBe(1)
    })

    it('handles binary data (Uint8Array)', async () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5])

      await adapter.run('INSERT INTO blobs (cid, data, size, created_at) VALUES (?, ?, ?, ?)', [
        'cid-1',
        binaryData,
        binaryData.byteLength,
        Date.now()
      ])

      const row = await adapter.queryOne<{ data: Buffer }>('SELECT data FROM blobs WHERE cid = ?', [
        'cid-1'
      ])

      expect(row?.data).toBeDefined()
      expect(new Uint8Array(row!.data)).toEqual(binaryData)
    })
  })

  describe('Transactions', () => {
    it('commits successful transaction', async () => {
      const now = Date.now()

      await adapter.transaction(async () => {
        await adapter.run(
          'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
          ['node-1', 'xnet://Page/1.0', now, now, 'did:key:test']
        )
        await adapter.run(
          'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
          ['node-2', 'xnet://Page/1.0', now, now, 'did:key:test']
        )
      })

      const count = await adapter.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM nodes')
      expect(count?.c).toBe(2)
    })

    it('rolls back on error', async () => {
      const now = Date.now()

      await adapter.run(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
        ['existing', 'xnet://Page/1.0', now, now, 'did:key:test']
      )

      await expect(
        adapter.transaction(async () => {
          await adapter.run(
            'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
            ['node-1', 'xnet://Page/1.0', now, now, 'did:key:test']
          )
          // This will fail (duplicate primary key)
          await adapter.run(
            'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
            ['existing', 'xnet://Page/1.0', now, now, 'did:key:test']
          )
        })
      ).rejects.toThrow()

      // Only 'existing' should be in database
      const count = await adapter.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM nodes')
      expect(count?.c).toBe(1)
    })
  })

  describe('FTS5 Full-Text Search', () => {
    it('creates FTS5 virtual table', async () => {
      const tables = await adapter.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='nodes_fts'"
      )
      expect(tables).toHaveLength(1)
    })

    it('inserts and searches text', async () => {
      await adapter.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-1',
        'Meeting Notes',
        'Discussion about project timeline and deliverables'
      ])
      await adapter.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-2',
        'Shopping List',
        'Milk, eggs, bread, butter'
      ])

      const results = await adapter.query<{ node_id: string }>(
        "SELECT node_id FROM nodes_fts WHERE nodes_fts MATCH 'project timeline'"
      )

      expect(results).toHaveLength(1)
      expect(results[0].node_id).toBe('node-1')
    })

    it('supports porter stemming', async () => {
      await adapter.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-1',
        'Running',
        'The runner runs quickly through the running track'
      ])

      // Should match "run", "running", "runner", "runs" due to porter stemming
      const results = await adapter.query<{ node_id: string }>(
        "SELECT node_id FROM nodes_fts WHERE nodes_fts MATCH 'run'"
      )

      expect(results).toHaveLength(1)
    })

    it('supports phrase queries', async () => {
      await adapter.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-1',
        'Title',
        'The quick brown fox jumps over the lazy dog'
      ])

      const results = await adapter.query<{ node_id: string }>(
        `SELECT node_id FROM nodes_fts WHERE nodes_fts MATCH '"quick brown"'`
      )

      expect(results).toHaveLength(1)
    })

    it('supports title-only search', async () => {
      await adapter.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-1',
        'Important Meeting',
        'Random content here'
      ])
      await adapter.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-2',
        'Random Title',
        'This is an important document'
      ])

      const results = await adapter.query<{ node_id: string }>(
        "SELECT node_id FROM nodes_fts WHERE title MATCH 'important'"
      )

      expect(results).toHaveLength(1)
      expect(results[0].node_id).toBe('node-1')
    })

    it('returns ranked results', async () => {
      await adapter.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-1',
        'Project',
        'This project is about projects and project management'
      ])
      await adapter.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-2',
        'Other',
        'This mentions project once'
      ])

      const results = await adapter.query<{ node_id: string; rank: number }>(
        "SELECT node_id, rank FROM nodes_fts WHERE nodes_fts MATCH 'project' ORDER BY rank"
      )

      expect(results).toHaveLength(2)
      // node-1 should rank higher (more occurrences)
      expect(results[0].node_id).toBe('node-1')
    })
  })
})

describe('ElectronSQLiteAdapter Performance', () => {
  let adapter: ElectronSQLiteAdapter
  let dbPath: string

  beforeAll(async () => {
    dbPath = getTestDbPath()
    adapter = await createElectronSQLiteAdapter({ path: dbPath })
  })

  afterAll(async () => {
    if (adapter?.isOpen()) {
      await adapter.close()
    }
    cleanupDb(dbPath)
  })

  describe('Write Performance', () => {
    it('bulk insert 1000 nodes < 500ms', async () => {
      const now = Date.now()
      const start = performance.now()

      await adapter.transaction(async () => {
        for (let i = 0; i < 1000; i++) {
          await adapter.run(
            'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
            [`perf-node-${i}`, 'xnet://Page/1.0', now, now, 'did:key:test']
          )
        }
      })

      const elapsed = performance.now() - start

      console.log(`Bulk insert 1000 nodes: ${elapsed.toFixed(2)}ms`)
      expect(elapsed).toBeLessThan(500)

      const count = await adapter.queryOne<{ c: number }>(
        "SELECT COUNT(*) as c FROM nodes WHERE id LIKE 'perf-node-%'"
      )
      expect(count?.c).toBe(1000)
    })
  })

  describe('Read Performance', () => {
    it('query 1000 nodes < 50ms', async () => {
      const start = performance.now()
      const rows = await adapter.query("SELECT * FROM nodes WHERE id LIKE 'perf-node-%'")
      const elapsed = performance.now() - start

      console.log(`Query 1000 nodes: ${elapsed.toFixed(2)}ms`)
      expect(elapsed).toBeLessThan(50)
      expect(rows).toHaveLength(1000)
    })

    it('count nodes < 10ms', async () => {
      const start = performance.now()
      const count = await adapter.queryOne<{ c: number }>(
        "SELECT COUNT(*) as c FROM nodes WHERE id LIKE 'perf-node-%'"
      )
      const elapsed = performance.now() - start

      console.log(`Count nodes: ${elapsed.toFixed(2)}ms`)
      expect(elapsed).toBeLessThan(10)
      expect(count?.c).toBe(1000)
    })

    it('get single node by id < 5ms', async () => {
      const start = performance.now()
      const node = await adapter.queryOne('SELECT * FROM nodes WHERE id = ?', ['perf-node-500'])
      const elapsed = performance.now() - start

      console.log(`Get single node: ${elapsed.toFixed(2)}ms`)
      expect(elapsed).toBeLessThan(5)
      expect(node).not.toBeNull()
    })
  })

  describe('FTS Performance', () => {
    beforeAll(async () => {
      // Seed FTS data
      await adapter.transaction(async () => {
        for (let i = 0; i < 1000; i++) {
          await adapter.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
            `fts-node-${i}`,
            `Document ${i}`,
            `This is the content of document ${i} with keywords like project, meeting, and notes. Category ${i % 10}.`
          ])
        }
      })
    })

    it('FTS search < 20ms', async () => {
      const start = performance.now()
      const results = await adapter.query<{ node_id: string }>(
        "SELECT node_id FROM nodes_fts WHERE nodes_fts MATCH 'project meeting' LIMIT 100"
      )
      const elapsed = performance.now() - start

      console.log(`FTS search: ${elapsed.toFixed(2)}ms (${results.length} results)`)
      expect(elapsed).toBeLessThan(20)
      expect(results.length).toBeGreaterThan(0)
    })

    it('FTS phrase search < 20ms', async () => {
      const start = performance.now()
      const results = await adapter.query<{ node_id: string }>(
        `SELECT node_id FROM nodes_fts WHERE nodes_fts MATCH '"content of document"' LIMIT 100`
      )
      const elapsed = performance.now() - start

      console.log(`FTS phrase search: ${elapsed.toFixed(2)}ms (${results.length} results)`)
      expect(elapsed).toBeLessThan(20)
    })
  })
})
