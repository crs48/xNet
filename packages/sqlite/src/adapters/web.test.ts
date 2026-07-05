/**
 * @xnetjs/sqlite - WebSQLiteAdapter tests (exploration 0263)
 *
 * Runs the real @sqlite.org/sqlite-wasm build under Node. There is no OPFS in
 * this environment, so `open()` takes the documented in-memory fallback — the
 * exact same query/run/transaction code paths the browser worker executes,
 * including the prepared-statement cache this suite exists to cover.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SCHEMA_VERSION } from '../schema'
import { WebSQLiteAdapter, createWebSQLiteAdapter } from './web'

describe('WebSQLiteAdapter (node / in-memory fallback)', () => {
  let db: WebSQLiteAdapter

  beforeEach(async () => {
    // The OPFS→memory fallback logs loudly by design; keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    db = new WebSQLiteAdapter()
    await db.open({ path: '/test.db' })
    await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, blob BLOB)')
  })

  afterEach(async () => {
    if (db.isOpen()) {
      await db.close()
    }
    vi.restoreAllMocks()
  })

  it('falls back to in-memory storage under Node', () => {
    expect(db.getStorageMode()).toBe('memory')
  })

  it('runs repeated statements through the cache with correct results', async () => {
    const insert = 'INSERT INTO t (name) VALUES (?)'
    for (let i = 0; i < 5; i++) {
      const result = await db.run(insert, [`row-${i}`])
      expect(result.changes).toBe(1)
      expect(result.lastInsertRowid).toBe(BigInt(i + 1))
    }

    const select = 'SELECT id, name FROM t WHERE name = ?'
    for (let i = 0; i < 5; i++) {
      const rows = await db.query<{ id: number; name: string }>(select, [`row-${i}`])
      expect(rows).toEqual([{ id: i + 1, name: `row-${i}` }])
    }
  })

  it('does not leak bindings between executions of the same statement', async () => {
    await db.run('INSERT INTO t (name) VALUES (?)', ['only'])
    const select = 'SELECT name FROM t WHERE name = ?'
    expect(await db.query(select, ['only'])).toHaveLength(1)
    // Same cached statement, no params: stale bindings would find 'only' again.
    expect(await db.query(select)).toHaveLength(0)
  })

  it('executes every statement of multi-statement run() SQL (cache bypass)', async () => {
    await db.run("INSERT INTO t (name) VALUES ('a'); INSERT INTO t (name) VALUES ('b')")
    const rows = await db.query<{ name: string }>('SELECT name FROM t ORDER BY name')
    expect(rows.map((r) => r.name)).toEqual(['a', 'b'])
  })

  it('queryOne returns first row or null', async () => {
    expect(await db.queryOne('SELECT id FROM t')).toBeNull()
    await db.run('INSERT INTO t (name) VALUES (?)', ['x'])
    expect(await db.queryOne<{ name: string }>('SELECT name FROM t')).toEqual({ name: 'x' })
  })

  it('round-trips typed values through the prepared path', async () => {
    const blob = new Uint8Array([1, 2, 3])
    await db.run('INSERT INTO t (name, blob) VALUES (?, ?)', [null, blob])
    const row = await db.queryOne<{ name: string | null; blob: Uint8Array }>(
      'SELECT name, blob FROM t'
    )
    expect(row?.name).toBeNull()
    expect(Array.from(row?.blob ?? [])).toEqual([1, 2, 3])
  })

  it('invalidates cached statements when exec() changes the schema', async () => {
    const select = 'SELECT * FROM t'
    await db.query(select) // populate the cache against the old shape
    await db.exec('DROP TABLE t; CREATE TABLE t (renamed TEXT)')
    await db.run('INSERT INTO t (renamed) VALUES (?)', ['fresh'])
    const rows = await db.query<{ renamed: string }>(select)
    expect(rows).toEqual([{ renamed: 'fresh' }])
  })

  it('supports transactions with rollback through the cached path', async () => {
    await expect(
      db.transaction(async () => {
        await db.run('INSERT INTO t (name) VALUES (?)', ['doomed'])
        throw new Error('abort')
      })
    ).rejects.toThrow('abort')
    expect(await db.query('SELECT * FROM t')).toHaveLength(0)

    await db.transaction(async () => {
      await db.run('INSERT INTO t (name) VALUES (?)', ['kept'])
    })
    expect(await db.query('SELECT * FROM t')).toHaveLength(1)
  })

  it('close() finalizes cached statements and reopening works', async () => {
    await db.query('SELECT * FROM t')
    await db.close()
    expect(db.isOpen()).toBe(false)
    await db.open({ path: '/test.db' })
    expect(db.isOpen()).toBe(true)
  })
})

describe('createWebSQLiteAdapter (schema factory)', () => {
  it('applies the shared schema and supports applyNodeBatch', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = await createWebSQLiteAdapter({ path: '/factory.db' })
    try {
      expect(await db.getSchemaVersion()).toBe(SCHEMA_VERSION)

      const result = await db.applyNodeBatch({
        nodes: [
          {
            id: 'node-1',
            schemaId: 'xnet://Test/1.0',
            createdAt: 1,
            updatedAt: 1,
            createdBy: 'did:test',
            deletedAt: null,
            propertyKeys: ['title']
          }
        ],
        properties: [
          {
            nodeId: 'node-1',
            propertyKey: 'title',
            value: JSON.stringify('hello'),
            lamportTime: 1,
            updatedBy: 'did:test',
            updatedAt: 1
          }
        ],
        scalarIndexRows: [],
        ftsNodeIds: [],
        ftsRows: [],
        changes: [],
        affectedSchemaIds: ['xnet://Test/1.0'],
        lastLamportTime: 1,
        indexMode: 'full'
      })

      expect(result.nodeRowsWritten).toBe(1)
      expect(result.propertyRowsWritten).toBe(1)

      const node = await db.queryOne<{ id: string }>('SELECT id FROM nodes WHERE id = ?', [
        'node-1'
      ])
      expect(node?.id).toBe('node-1')
    } finally {
      await db.close()
      vi.restoreAllMocks()
    }
  })
})
