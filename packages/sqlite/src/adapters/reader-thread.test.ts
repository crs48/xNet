/**
 * Tests for the reader-thread request handler (exploration 0230).
 *
 * The handler is pure and synchronous, so it runs against an in-process
 * `better-sqlite3` connection here — no `worker_threads` spawn required.
 */
import type DatabaseType from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import { handleReaderRequest } from './reader-thread'

function isNativeLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('better_sqlite3.node') ||
    message.includes('incompatible architecture') ||
    message.includes('Cannot find module')
  )
}

let DatabaseCtor: typeof DatabaseType | null = null
try {
  DatabaseCtor = (await import('better-sqlite3')).default
  const probe = new DatabaseCtor(':memory:')
  probe.close()
} catch (err) {
  if (!isNativeLoadError(err)) throw err
  DatabaseCtor = null
}

const describeNative = DatabaseCtor ? describe : describe.skip

describeNative('reader-thread handleReaderRequest (0230)', () => {
  function freshDb(): DatabaseType.Database {
    const db = new DatabaseCtor!(':memory:')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)')
    db.prepare('INSERT INTO t (id, name) VALUES (?, ?)').run(1, 'alice')
    db.prepare('INSERT INTO t (id, name) VALUES (?, ?)').run(2, 'bob')
    return db
  }

  it('answers a ping', () => {
    const db = freshDb()
    const res = handleReaderRequest(db, new Map(), { id: 7, op: 'ping' })
    expect(res).toEqual({ id: 7, ok: true, pong: true })
    db.close()
  })

  it('runs a query and returns rows', () => {
    const db = freshDb()
    const res = handleReaderRequest(db, new Map(), {
      id: 1,
      op: 'query',
      sql: 'SELECT name FROM t ORDER BY id'
    })
    expect(res).toEqual({ id: 1, ok: true, rows: [{ name: 'alice' }, { name: 'bob' }] })
    db.close()
  })

  it('runs queryOne with params and returns a single row', () => {
    const db = freshDb()
    const res = handleReaderRequest(db, new Map(), {
      id: 2,
      op: 'queryOne',
      sql: 'SELECT name FROM t WHERE id = ?',
      params: [2]
    })
    expect(res).toEqual({ id: 2, ok: true, row: { name: 'bob' } })
    db.close()
  })

  it('returns null for queryOne with no match', () => {
    const db = freshDb()
    const res = handleReaderRequest(db, new Map(), {
      id: 3,
      op: 'queryOne',
      sql: 'SELECT name FROM t WHERE id = ?',
      params: [99]
    })
    expect(res).toEqual({ id: 3, ok: true, row: null })
    db.close()
  })

  it('reuses cached prepared statements across calls', () => {
    const db = freshDb()
    const cache = new Map()
    handleReaderRequest(db, cache, { id: 1, op: 'query', sql: 'SELECT * FROM t' })
    handleReaderRequest(db, cache, { id: 2, op: 'query', sql: 'SELECT * FROM t' })
    expect(cache.size).toBe(1)
    db.close()
  })

  it('reports SQL errors as a failed response, not a throw', () => {
    const db = freshDb()
    const res = handleReaderRequest(db, new Map(), {
      id: 4,
      op: 'query',
      sql: 'SELECT * FROM nope'
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/no such table/)
    db.close()
  })

  it('cannot write through a read-only connection', async () => {
    // Prove the reader connection is genuinely read-only.
    const path = `${(await import('os')).tmpdir()}/xnet-reader-${Date.now()}.db`
    const writer = new DatabaseCtor!(path)
    writer.exec('CREATE TABLE t (id INTEGER PRIMARY KEY)')
    writer.close()

    const { openReaderConnection } = await import('./reader-thread')
    const reader = await openReaderConnection(path)
    const res = handleReaderRequest(reader, new Map(), {
      id: 5,
      op: 'query',
      sql: 'INSERT INTO t (id) VALUES (1)'
    })
    expect(res.ok).toBe(false)
    reader.close()
    const { unlinkSync } = await import('fs')
    for (const f of [path, `${path}-wal`, `${path}-shm`]) {
      try {
        unlinkSync(f)
      } catch {
        // ignore
      }
    }
  })
})
