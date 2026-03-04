/**
 * @xnetjs/sqlite - Adapter interface tests
 *
 * These tests verify the SQLiteAdapter interface using the MemorySQLiteAdapter.
 */

import type { SQLiteAdapter } from './adapter'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createMemorySQLiteAdapter } from './adapters/memory'
import {
  buildInsert,
  buildUpdate,
  buildSelect,
  buildBatchInsert,
  escapeLike
} from './query-builder'
import { SCHEMA_VERSION } from './schema'

describe('SQLiteAdapter Interface', () => {
  let db: SQLiteAdapter

  beforeEach(async () => {
    db = await createMemorySQLiteAdapter()
  })

  afterEach(async () => {
    if (db.isOpen()) {
      await db.close()
    }
  })

  describe('Lifecycle', () => {
    it('opens and closes database', async () => {
      expect(db.isOpen()).toBe(true)
      await db.close()
      expect(db.isOpen()).toBe(false)
    })

    it('applies schema on creation', async () => {
      const version = await db.getSchemaVersion()
      expect(version).toBe(SCHEMA_VERSION)
    })

    it('creates all required tables', async () => {
      const tables = await db.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      )
      const tableNames = tables.map((t) => t.name)

      expect(tableNames).toContain('nodes')
      expect(tableNames).toContain('node_properties')
      expect(tableNames).toContain('changes')
      expect(tableNames).toContain('yjs_state')
      expect(tableNames).toContain('yjs_updates')
      expect(tableNames).toContain('yjs_snapshots')
      expect(tableNames).toContain('blobs')
      expect(tableNames).toContain('documents')
      expect(tableNames).toContain('updates')
      expect(tableNames).toContain('snapshots')
      expect(tableNames).toContain('sync_state')
      expect(tableNames).toContain('_schema_version')
    })

    it('throws when accessing closed database', async () => {
      await db.close()
      await expect(db.query('SELECT 1')).rejects.toThrow('Database not open')
    })
  })

  describe('Query Execution', () => {
    it('runs INSERT and SELECT', async () => {
      await db.run(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
        ['node-1', 'xnet://Page/1.0', Date.now(), Date.now(), 'did:key:test']
      )

      const rows = await db.query<{ id: string; schema_id: string }>(
        'SELECT id, schema_id FROM nodes WHERE id = ?',
        ['node-1']
      )

      expect(rows).toHaveLength(1)
      expect(rows[0].id).toBe('node-1')
      expect(rows[0].schema_id).toBe('xnet://Page/1.0')
    })

    it('queryOne returns null for no match', async () => {
      const row = await db.queryOne('SELECT * FROM nodes WHERE id = ?', ['nonexistent'])
      expect(row).toBeNull()
    })

    it('queryOne returns single row', async () => {
      await db.run(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
        ['node-1', 'xnet://Page/1.0', Date.now(), Date.now(), 'did:key:test']
      )

      const row = await db.queryOne<{ id: string }>('SELECT id FROM nodes WHERE id = ?', ['node-1'])
      expect(row?.id).toBe('node-1')
    })

    it('run returns changes count', async () => {
      await db.run(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
        ['node-1', 'xnet://Page/1.0', Date.now(), Date.now(), 'did:key:test']
      )

      const result = await db.run('UPDATE nodes SET schema_id = ? WHERE id = ?', [
        'xnet://Database/1.0',
        'node-1'
      ])

      expect(result.changes).toBe(1)
    })

    it('returns lastInsertRowid for autoincrement', async () => {
      // First create the parent node (required by foreign key)
      await db.run(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
        ['node-1', 'xnet://Page/1.0', Date.now(), Date.now(), 'did:key:test']
      )

      // Now insert into the child table with autoincrement
      const result = await db.run(
        'INSERT INTO yjs_updates (node_id, update_data, timestamp) VALUES (?, ?, ?)',
        ['node-1', new Uint8Array([1, 2, 3]), Date.now()]
      )

      expect(result.lastInsertRowid).toBeGreaterThan(0n)
    })

    it('handles binary data (Uint8Array)', async () => {
      const binaryData = new Uint8Array([1, 2, 3, 4, 5])

      await db.run('INSERT INTO blobs (cid, data, size, created_at) VALUES (?, ?, ?, ?)', [
        'cid-1',
        binaryData,
        binaryData.byteLength,
        Date.now()
      ])

      const row = await db.queryOne<{ data: Uint8Array }>('SELECT data FROM blobs WHERE cid = ?', [
        'cid-1'
      ])

      expect(row?.data).toBeDefined()
      // sql.js returns data as Uint8Array
      expect(Array.from(row!.data)).toEqual([1, 2, 3, 4, 5])
    })

    it('handles null values', async () => {
      await db.run(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at) VALUES (?, ?, ?, ?, ?, ?)',
        ['node-1', 'xnet://Page/1.0', Date.now(), Date.now(), 'did:key:test', null]
      )

      const row = await db.queryOne<{ deleted_at: number | null }>(
        'SELECT deleted_at FROM nodes WHERE id = ?',
        ['node-1']
      )
      expect(row?.deleted_at).toBeNull()
    })
  })

  describe('Transactions', () => {
    it('commits successful transaction', async () => {
      await db.transaction(async () => {
        await db.run(
          'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
          ['node-1', 'xnet://Page/1.0', Date.now(), Date.now(), 'did:key:test']
        )
        await db.run(
          'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
          ['node-2', 'xnet://Page/1.0', Date.now(), Date.now(), 'did:key:test']
        )
      })

      const count = await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM nodes')
      expect(count?.c).toBe(2)
    })

    it('rolls back failed transaction', async () => {
      try {
        await db.transaction(async () => {
          await db.run(
            'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
            ['node-1', 'xnet://Page/1.0', Date.now(), Date.now(), 'did:key:test']
          )
          throw new Error('Intentional failure')
        })
      } catch {
        // Expected
      }

      const count = await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM nodes')
      expect(count?.c).toBe(0)
    })

    it('throws on nested transaction', async () => {
      await db.beginTransaction()

      await expect(db.beginTransaction()).rejects.toThrow('Transaction already in progress')

      await db.rollback()
    })

    it('commit without transaction throws', async () => {
      await expect(db.commit()).rejects.toThrow('No transaction in progress')
    })
  })

  describe('Prepared Statements', () => {
    it('executes prepared statement multiple times', async () => {
      const stmt = await db.prepare(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)'
      )

      const now = Date.now()

      await stmt.run(['node-1', 'xnet://Page/1.0', now, now, 'did:key:test'])
      await stmt.run(['node-2', 'xnet://Page/1.0', now, now, 'did:key:test'])
      await stmt.run(['node-3', 'xnet://Page/1.0', now, now, 'did:key:test'])

      await stmt.finalize()

      const count = await db.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM nodes')
      expect(count?.c).toBe(3)
    })

    it('prepared query returns results', async () => {
      // Insert test data
      await db.run(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
        ['node-1', 'xnet://Page/1.0', Date.now(), Date.now(), 'did:key:test']
      )

      const stmt = await db.prepare('SELECT id FROM nodes WHERE schema_id = ?')
      const results = await stmt.query<{ id: string }>(['xnet://Page/1.0'])

      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('node-1')

      await stmt.finalize()
    })
  })

  describe('Schema Management', () => {
    it('returns current schema version', async () => {
      const version = await db.getSchemaVersion()
      expect(version).toBe(SCHEMA_VERSION)
    })

    it('does not re-apply same schema version', async () => {
      // Try to apply the same version again
      const applied = await db.applySchema(SCHEMA_VERSION, 'SELECT 1')
      expect(applied).toBe(false)
    })

    it('tracks schema version history', async () => {
      const versions = await db.query<{ version: number; applied_at: number }>(
        'SELECT version, applied_at FROM _schema_version'
      )

      expect(versions).toHaveLength(1)
      expect(versions[0].version).toBe(SCHEMA_VERSION)
      expect(versions[0].applied_at).toBeGreaterThan(0)
    })
  })

  // Note: FTS5 tests are skipped for MemorySQLiteAdapter because sql.js
  // doesn't include the FTS5 extension. FTS5 is tested in integration tests
  // with better-sqlite3 and @sqlite.org/sqlite-wasm which include FTS5.
  describe.skip('Full-Text Search (requires FTS5)', () => {
    it('FTS table exists', async () => {
      // Insert into FTS
      await db.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-1',
        'Test Page',
        'This is the content of the test page.'
      ])

      // Search
      const results = await db.query<{ node_id: string }>(
        "SELECT node_id FROM nodes_fts WHERE nodes_fts MATCH 'content'"
      )

      expect(results).toHaveLength(1)
      expect(results[0].node_id).toBe('node-1')
    })

    it('FTS supports phrase search', async () => {
      await db.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-1',
        'Meeting Notes',
        'Discussion about project timeline and deliverables'
      ])
      await db.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-2',
        'Project Overview',
        'Overview of the project goals and milestones'
      ])

      // Phrase search
      const results = await db.query<{ node_id: string }>(
        `SELECT node_id FROM nodes_fts WHERE nodes_fts MATCH '"project timeline"'`
      )

      expect(results).toHaveLength(1)
      expect(results[0].node_id).toBe('node-1')
    })

    it('FTS supports title search', async () => {
      await db.run('INSERT INTO nodes_fts (node_id, title, content) VALUES (?, ?, ?)', [
        'node-1',
        'Meeting Notes',
        'Random content here'
      ])

      const results = await db.query<{ node_id: string }>(
        "SELECT node_id FROM nodes_fts WHERE title MATCH 'meeting'"
      )

      expect(results).toHaveLength(1)
    })
  })

  describe('Utilities', () => {
    it('getDatabaseSize returns 0 for in-memory', async () => {
      const size = await db.getDatabaseSize()
      expect(size).toBe(0)
    })

    it('vacuum runs without error', async () => {
      await expect(db.vacuum()).resolves.toBeUndefined()
    })

    it('checkpoint returns 0 for in-memory', async () => {
      const checkpointed = await db.checkpoint()
      expect(checkpointed).toBe(0)
    })
  })

  describe('Cascade Deletes', () => {
    const now = Date.now()
    const nodeId = 'node-cascade-test'

    beforeEach(async () => {
      // Create a node with related data in all child tables
      await db.run(
        'INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?)',
        [nodeId, 'xnet://Page/1.0', now, now, 'did:key:test']
      )
    })

    it('cascades delete to node_properties', async () => {
      // Insert property
      await db.run(
        'INSERT INTO node_properties (node_id, property_key, value, lamport_time, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [nodeId, 'title', new Uint8Array([34, 84, 101, 115, 116, 34]), 1, 'did:key:test', now]
      )

      // Verify property exists
      const beforeCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM node_properties WHERE node_id = ?',
        [nodeId]
      )
      expect(beforeCount?.c).toBe(1)

      // Delete node
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId])

      // Property should be gone
      const afterCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM node_properties WHERE node_id = ?',
        [nodeId]
      )
      expect(afterCount?.c).toBe(0)
    })

    it('cascades delete to changes', async () => {
      // Insert change
      await db.run(
        'INSERT INTO changes (hash, node_id, payload, lamport_time, lamport_peer, wall_time, author, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'hash-1',
          nodeId,
          new Uint8Array([1, 2, 3]),
          1,
          'peer-1',
          now,
          'did:key:test',
          new Uint8Array([4, 5, 6])
        ]
      )

      // Verify change exists
      const beforeCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM changes WHERE node_id = ?',
        [nodeId]
      )
      expect(beforeCount?.c).toBe(1)

      // Delete node
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId])

      // Change should be gone
      const afterCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM changes WHERE node_id = ?',
        [nodeId]
      )
      expect(afterCount?.c).toBe(0)
    })

    it('cascades delete to yjs_state', async () => {
      // Insert yjs state
      await db.run('INSERT INTO yjs_state (node_id, state, updated_at) VALUES (?, ?, ?)', [
        nodeId,
        new Uint8Array([1, 2, 3]),
        now
      ])

      // Verify state exists
      const beforeCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM yjs_state WHERE node_id = ?',
        [nodeId]
      )
      expect(beforeCount?.c).toBe(1)

      // Delete node
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId])

      // State should be gone
      const afterCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM yjs_state WHERE node_id = ?',
        [nodeId]
      )
      expect(afterCount?.c).toBe(0)
    })

    it('cascades delete to yjs_updates', async () => {
      // Insert yjs update
      await db.run('INSERT INTO yjs_updates (node_id, update_data, timestamp) VALUES (?, ?, ?)', [
        nodeId,
        new Uint8Array([1, 2, 3]),
        now
      ])

      // Verify update exists
      const beforeCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM yjs_updates WHERE node_id = ?',
        [nodeId]
      )
      expect(beforeCount?.c).toBe(1)

      // Delete node
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId])

      // Update should be gone
      const afterCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM yjs_updates WHERE node_id = ?',
        [nodeId]
      )
      expect(afterCount?.c).toBe(0)
    })

    it('cascades delete to yjs_snapshots', async () => {
      // Insert yjs snapshot
      await db.run(
        'INSERT INTO yjs_snapshots (node_id, timestamp, snapshot, doc_state, byte_size) VALUES (?, ?, ?, ?, ?)',
        [nodeId, now, new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]), 6]
      )

      // Verify snapshot exists
      const beforeCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM yjs_snapshots WHERE node_id = ?',
        [nodeId]
      )
      expect(beforeCount?.c).toBe(1)

      // Delete node
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId])

      // Snapshot should be gone
      const afterCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM yjs_snapshots WHERE node_id = ?',
        [nodeId]
      )
      expect(afterCount?.c).toBe(0)
    })

    it('cascades delete to all child tables at once', async () => {
      // Insert data into all child tables
      await db.run(
        'INSERT INTO node_properties (node_id, property_key, value, lamport_time, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [nodeId, 'title', new Uint8Array([34, 84, 101, 115, 116, 34]), 1, 'did:key:test', now]
      )
      await db.run(
        'INSERT INTO changes (hash, node_id, payload, lamport_time, lamport_peer, wall_time, author, signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          'hash-1',
          nodeId,
          new Uint8Array([1, 2, 3]),
          1,
          'peer-1',
          now,
          'did:key:test',
          new Uint8Array([4, 5, 6])
        ]
      )
      await db.run('INSERT INTO yjs_state (node_id, state, updated_at) VALUES (?, ?, ?)', [
        nodeId,
        new Uint8Array([1, 2, 3]),
        now
      ])
      await db.run('INSERT INTO yjs_updates (node_id, update_data, timestamp) VALUES (?, ?, ?)', [
        nodeId,
        new Uint8Array([1, 2, 3]),
        now
      ])
      await db.run(
        'INSERT INTO yjs_snapshots (node_id, timestamp, snapshot, doc_state, byte_size) VALUES (?, ?, ?, ?, ?)',
        [nodeId, now, new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]), 6]
      )

      // Delete node
      await db.run('DELETE FROM nodes WHERE id = ?', [nodeId])

      // All child data should be gone
      const propCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM node_properties WHERE node_id = ?',
        [nodeId]
      )
      const changeCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM changes WHERE node_id = ?',
        [nodeId]
      )
      const stateCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM yjs_state WHERE node_id = ?',
        [nodeId]
      )
      const updateCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM yjs_updates WHERE node_id = ?',
        [nodeId]
      )
      const snapshotCount = await db.queryOne<{ c: number }>(
        'SELECT COUNT(*) as c FROM yjs_snapshots WHERE node_id = ?',
        [nodeId]
      )

      expect(propCount?.c).toBe(0)
      expect(changeCount?.c).toBe(0)
      expect(stateCount?.c).toBe(0)
      expect(updateCount?.c).toBe(0)
      expect(snapshotCount?.c).toBe(0)
    })
  })
})

describe('Query Helpers', () => {
  describe('buildInsert', () => {
    it('creates correct INSERT SQL', () => {
      const { sql } = buildInsert('nodes', ['id', 'schema_id', 'created_at'])
      expect(sql).toBe('INSERT INTO nodes (id, schema_id, created_at) VALUES (?, ?, ?)')
    })

    it('supports OR REPLACE', () => {
      const { sql } = buildInsert('nodes', ['id', 'value'], { orReplace: true })
      expect(sql).toBe('INSERT OR REPLACE INTO nodes (id, value) VALUES (?, ?)')
    })

    it('supports OR IGNORE', () => {
      const { sql } = buildInsert('nodes', ['id', 'value'], { orIgnore: true })
      expect(sql).toBe('INSERT OR IGNORE INTO nodes (id, value) VALUES (?, ?)')
    })
  })

  describe('buildUpdate', () => {
    it('creates correct UPDATE SQL', () => {
      const sql = buildUpdate('nodes', ['schema_id', 'updated_at'], ['id'])
      expect(sql).toBe('UPDATE nodes SET schema_id = ?, updated_at = ? WHERE id = ?')
    })

    it('supports multiple WHERE columns', () => {
      const sql = buildUpdate('node_properties', ['value'], ['node_id', 'property_key'])
      expect(sql).toBe(
        'UPDATE node_properties SET value = ? WHERE node_id = ? AND property_key = ?'
      )
    })
  })

  describe('buildSelect', () => {
    it('creates basic SELECT', () => {
      const sql = buildSelect('nodes')
      expect(sql).toBe('SELECT * FROM nodes')
    })

    it('supports specific columns', () => {
      const sql = buildSelect('nodes', ['id', 'schema_id'])
      expect(sql).toBe('SELECT id, schema_id FROM nodes')
    })

    it('supports WHERE clause', () => {
      const sql = buildSelect('nodes', ['*'], { where: ['schema_id'] })
      expect(sql).toBe('SELECT * FROM nodes WHERE schema_id = ?')
    })

    it('supports ORDER BY', () => {
      const sql = buildSelect('nodes', ['*'], { orderBy: 'created_at DESC' })
      expect(sql).toBe('SELECT * FROM nodes ORDER BY created_at DESC')
    })

    it('supports LIMIT and OFFSET', () => {
      const sql = buildSelect('nodes', ['*'], { limit: 10, offset: 20 })
      expect(sql).toBe('SELECT * FROM nodes LIMIT 10 OFFSET 20')
    })

    it('supports all options together', () => {
      const sql = buildSelect('nodes', ['id', 'schema_id'], {
        where: ['schema_id'],
        orderBy: 'created_at DESC',
        limit: 10,
        offset: 20
      })

      expect(sql).toBe(
        'SELECT id, schema_id FROM nodes WHERE schema_id = ? ORDER BY created_at DESC LIMIT 10 OFFSET 20'
      )
    })
  })

  describe('buildBatchInsert', () => {
    it('creates correct batch INSERT SQL', () => {
      const sql = buildBatchInsert('nodes', ['id', 'schema_id'], 3)
      expect(sql).toBe('INSERT INTO nodes (id, schema_id) VALUES (?, ?), (?, ?), (?, ?)')
    })
  })

  describe('escapeLike', () => {
    it('escapes % character', () => {
      expect(escapeLike('100%')).toBe('100\\%')
    })

    it('escapes _ character', () => {
      expect(escapeLike('file_name')).toBe('file\\_name')
    })

    it('escapes backslash', () => {
      expect(escapeLike('path\\to\\file')).toBe('path\\\\to\\\\file')
    })

    it('escapes multiple special characters', () => {
      expect(escapeLike('%test_100%')).toBe('\\%test\\_100\\%')
    })
  })
})

describe('MemorySQLiteAdapter Factory', () => {
  it('creates adapter with schema applied', async () => {
    const adapter = await createMemorySQLiteAdapter()
    expect(adapter.isOpen()).toBe(true)

    const version = await adapter.getSchemaVersion()
    expect(version).toBe(SCHEMA_VERSION)

    await adapter.close()
  })
})
