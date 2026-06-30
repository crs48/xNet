/**
 * Tests for getIndexInfo's per-adapter, schema_version-keyed cache (0253).
 *
 * `collectCompiledQueryDiagnostics` called `getIndexInfo` on every cold query,
 * each call re-running `sqlite_master` + one `PRAGMA index_info` per index —
 * ~870 serial worker round-trips in the 0253 capture, which flooded the boot log
 * and obscured the real stall. The index set is stable between DDL changes, so
 * the cache must serve repeated calls off one build and only rebuild when
 * `PRAGMA schema_version` bumps.
 */
import type { SQLiteAdapter } from './adapter'
import { describe, it, expect } from 'vitest'
import { getIndexInfo } from './diagnostics'

/** Minimal adapter stub: getIndexInfo only ever calls `query`/`queryOne`. */
function makeStub(initialVersion: number): {
  db: SQLiteAdapter
  setVersion: (v: number) => void
  counts: { schemaVersion: number; sqliteMaster: number; indexInfo: number }
} {
  let version = initialVersion
  const counts = { schemaVersion: 0, sqliteMaster: 0, indexInfo: 0 }

  const db = {
    async queryOne(sql: string): Promise<unknown> {
      if (sql.includes('schema_version')) {
        counts.schemaVersion++
        return { schema_version: version }
      }
      return null
    },
    async query(sql: string): Promise<unknown[]> {
      if (sql.includes('FROM sqlite_master')) {
        counts.sqliteMaster++
        return [
          { name: 'idx_nodes_schema', tbl_name: 'nodes', sql: 'CREATE INDEX idx_nodes_schema ...' }
        ]
      }
      if (sql.includes('index_info')) {
        counts.indexInfo++
        return [{ name: 'schema_id' }]
      }
      return []
    }
  } as unknown as SQLiteAdapter

  return { db, setVersion: (v: number) => (version = v), counts }
}

describe('getIndexInfo cache (0253)', () => {
  it('builds once, then serves repeat calls without re-reading sqlite_master', async () => {
    const { db, counts } = makeStub(7)

    const first = await getIndexInfo(db)
    expect(first).toHaveLength(1)
    expect(first[0].columns).toEqual(['schema_id'])
    expect(counts.sqliteMaster).toBe(1)
    expect(counts.indexInfo).toBe(1)

    // Three more calls at the same schema_version: each pays only the cheap
    // version probe; sqlite_master + index_info are NOT re-run.
    await getIndexInfo(db)
    await getIndexInfo(db)
    await getIndexInfo(db)
    expect(counts.sqliteMaster).toBe(1)
    expect(counts.indexInfo).toBe(1)
    // The version probe still runs every call (that's the invalidation check).
    expect(counts.schemaVersion).toBe(4)
  })

  it('rebuilds when schema_version bumps (a DDL change)', async () => {
    const { db, setVersion, counts } = makeStub(1)

    await getIndexInfo(db)
    expect(counts.sqliteMaster).toBe(1)

    setVersion(2) // e.g. a CREATE INDEX ran
    await getIndexInfo(db)
    expect(counts.sqliteMaster).toBe(2)
  })

  it('keys the cache per adapter (no cross-adapter leakage)', async () => {
    const a = makeStub(5)
    const b = makeStub(5)
    await getIndexInfo(a.db)
    await getIndexInfo(b.db)
    expect(a.counts.sqliteMaster).toBe(1)
    expect(b.counts.sqliteMaster).toBe(1)
  })
})
