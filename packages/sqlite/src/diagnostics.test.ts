/**
 * Tests for getIndexInfo's per-adapter, schema_version-keyed cache (0253) and
 * its round-trip budget (2026-07-05 debug-convoy capture).
 *
 * `collectCompiledQueryDiagnostics` called `getIndexInfo` on every cold query.
 * Two regressions live here:
 *
 * 1. 0253: each call re-ran `sqlite_master` + one `PRAGMA index_info` per index
 *    — ~870 serial worker round-trips flooding the boot log. Fixed by the
 *    schema_version-keyed cache (#351).
 * 2. 2026-07-05: the #351 cache only populated AFTER a build finished, so
 *    concurrent boot queries all missed it and each enqueued its own full
 *    build on the single serial worker — hundreds of identical `index_info`
 *    round-trips convoying real query results by 18-20s. Fixed by sharing the
 *    in-flight probe+build across concurrent callers AND collapsing the build
 *    itself into ONE batched `pragma_index_info` join.
 *
 * The round-trip counters below are the regression guard: a cold diagnostic
 * run must cost 2 worker round-trips (version probe + batched fetch), a warm
 * one 1 (probe only), and N concurrent cold calls must still cost 2 total.
 */
import type { SQLiteAdapter } from './adapter'
import { describe, it, expect } from 'vitest'
import { createMemorySQLiteAdapter } from './adapters/memory'
import { getIndexInfo } from './diagnostics'

/** Minimal adapter stub: getIndexInfo only ever calls `query`/`queryOne`. */
function makeStub(
  initialVersion: number,
  options: { supportsBatchedPragma?: boolean } = {}
): {
  db: SQLiteAdapter
  setVersion: (v: number) => void
  counts: {
    total: number
    schemaVersion: number
    batchedIndexInfo: number
    sqliteMaster: number
    indexInfo: number
  }
} {
  const supportsBatchedPragma = options.supportsBatchedPragma ?? true
  let version = initialVersion
  const counts = {
    total: 0,
    schemaVersion: 0,
    batchedIndexInfo: 0,
    sqliteMaster: 0,
    indexInfo: 0
  }

  const db = {
    async queryOne(sql: string): Promise<unknown> {
      counts.total++
      if (sql.includes('schema_version')) {
        counts.schemaVersion++
        return { schema_version: version }
      }
      return null
    },
    async query(sql: string): Promise<unknown[]> {
      counts.total++
      // The batched statement contains BOTH `sqlite_master` and
      // `pragma_index_info(` — match it first.
      if (sql.includes('pragma_index_info(')) {
        if (!supportsBatchedPragma) {
          throw new Error('no such table-valued function: pragma_index_info')
        }
        counts.batchedIndexInfo++
        return [
          {
            index_name: 'idx_nodes_schema',
            table_name: 'nodes',
            index_sql: 'CREATE INDEX idx_nodes_schema ON nodes (schema_id, updated_at)',
            seqno: 0,
            column_name: 'schema_id'
          },
          {
            index_name: 'idx_nodes_schema',
            table_name: 'nodes',
            index_sql: 'CREATE INDEX idx_nodes_schema ON nodes (schema_id, updated_at)',
            seqno: 1,
            column_name: 'updated_at'
          }
        ]
      }
      if (sql.includes('FROM sqlite_master')) {
        counts.sqliteMaster++
        return [
          {
            name: 'idx_nodes_schema',
            tbl_name: 'nodes',
            sql: 'CREATE INDEX idx_nodes_schema ON nodes (schema_id, updated_at)'
          }
        ]
      }
      if (sql.includes('index_info')) {
        counts.indexInfo++
        return [{ name: 'schema_id' }, { name: 'updated_at' }]
      }
      return []
    }
  } as unknown as SQLiteAdapter

  return { db, setVersion: (v: number) => (version = v), counts }
}

describe('getIndexInfo cache (0253) + round-trip budget (2026-07-05)', () => {
  it('cold build costs exactly 2 worker round-trips: version probe + one batched fetch', async () => {
    const { db, counts } = makeStub(7)

    const first = await getIndexInfo(db)
    expect(first).toHaveLength(1)
    expect(first[0]).toEqual({
      name: 'idx_nodes_schema',
      tableName: 'nodes',
      unique: false,
      columns: ['schema_id', 'updated_at'],
      partial: false
    })
    expect(counts.schemaVersion).toBe(1)
    expect(counts.batchedIndexInfo).toBe(1)
    expect(counts.sqliteMaster).toBe(0)
    expect(counts.indexInfo).toBe(0)
    expect(counts.total).toBe(2)
  })

  it('serves repeat calls off the cache — 1 probe round-trip each, no rebuild', async () => {
    const { db, counts } = makeStub(7)

    await getIndexInfo(db)
    expect(counts.total).toBe(2)

    // Three more calls at the same schema_version: each pays only the cheap
    // version probe (that's the invalidation check); no re-fetch.
    await getIndexInfo(db)
    await getIndexInfo(db)
    await getIndexInfo(db)
    expect(counts.batchedIndexInfo).toBe(1)
    expect(counts.schemaVersion).toBe(4)
    expect(counts.total).toBe(5)
  })

  it('concurrent callers share ONE in-flight probe+build (the 2026-07-05 convoy)', async () => {
    const { db, counts } = makeStub(3)

    // Boot fires dozens of debug-instrumented queries before the first build
    // resolves. Pre-fix, each of these enqueued its own full build on the
    // serial worker; now they must all piggyback on one.
    const results = await Promise.all(Array.from({ length: 25 }, () => getIndexInfo(db)))

    expect(counts.schemaVersion).toBe(1)
    expect(counts.batchedIndexInfo).toBe(1)
    expect(counts.total).toBe(2)
    for (const result of results) {
      expect(result).toBe(results[0]) // the same cached array, not 25 copies
    }
  })

  it('rebuilds when schema_version bumps (a DDL change)', async () => {
    const { db, setVersion, counts } = makeStub(1)

    await getIndexInfo(db)
    expect(counts.batchedIndexInfo).toBe(1)

    setVersion(2) // e.g. a CREATE INDEX ran
    await getIndexInfo(db)
    expect(counts.batchedIndexInfo).toBe(2)
  })

  it('keys the cache per adapter (no cross-adapter leakage)', async () => {
    const a = makeStub(5)
    const b = makeStub(5)
    await getIndexInfo(a.db)
    await getIndexInfo(b.db)
    expect(a.counts.batchedIndexInfo).toBe(1)
    expect(b.counts.batchedIndexInfo).toBe(1)
  })

  it('falls back to per-index PRAGMA index_info when table-valued pragmas are unavailable', async () => {
    const { db, counts } = makeStub(9, { supportsBatchedPragma: false })

    const result = await getIndexInfo(db)
    expect(result).toHaveLength(1)
    expect(result[0].columns).toEqual(['schema_id', 'updated_at'])
    expect(counts.sqliteMaster).toBe(1)
    expect(counts.indexInfo).toBe(1)

    // The fallback result is cached too — no repeat loop on the next call.
    await getIndexInfo(db)
    expect(counts.sqliteMaster).toBe(1)
    expect(counts.indexInfo).toBe(1)
  })

  it('batched fetch works against a real SQLite engine (sql.js)', async () => {
    const db = await createMemorySQLiteAdapter()
    try {
      await db.exec('CREATE TABLE diag_probe (a TEXT, b INTEGER)')
      await db.exec('CREATE UNIQUE INDEX idx_diag_unique ON diag_probe (a)')
      await db.exec('CREATE INDEX idx_diag_multi ON diag_probe (a, b)')
      await db.exec('CREATE INDEX idx_diag_partial ON diag_probe (b) WHERE b IS NOT NULL')

      const indexes = await getIndexInfo(db)
      const byName = new Map(indexes.map((index) => [index.name, index]))

      expect(byName.get('idx_diag_unique')).toMatchObject({
        tableName: 'diag_probe',
        unique: true,
        columns: ['a'],
        partial: false
      })
      expect(byName.get('idx_diag_multi')).toMatchObject({
        unique: false,
        columns: ['a', 'b'], // seqno order preserved by the batched join
        partial: false
      })
      expect(byName.get('idx_diag_partial')).toMatchObject({
        columns: ['b'],
        partial: true
      })

      // DDL bumps schema_version → the cache must rebuild and see the new index.
      await db.exec('CREATE INDEX idx_diag_late ON diag_probe (b)')
      const refreshed = await getIndexInfo(db)
      expect(refreshed.some((index) => index.name === 'idx_diag_late')).toBe(true)
    } finally {
      await db.close()
    }
  })
})
