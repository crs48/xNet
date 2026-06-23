import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { describe, expect, it } from 'vitest'
import { classifyStoreContents, probeStoreContents } from './read-path-probe'

/**
 * Read-path probe (exploration 0212). The verdict matrix is the diagnostic
 * that distinguishes the real causes of "no data until sync": populated
 * projection (read-path/timing) vs change-log-only (materialization bug) vs
 * cursor-only (under-fetch / data loss) vs genuinely cold cache.
 */

type CountValue = number | Error

function fakeAdapter(opts: {
  counts: Record<string, CountValue>
  syncState?: Array<{ key: string; value: string }>
}): Pick<SQLiteAdapter, 'query' | 'queryOne'> {
  return {
    async queryOne<T>(sql: string): Promise<T | null> {
      const table = /FROM\s+(\w+)/i.exec(sql)?.[1] ?? ''
      const value = opts.counts[table]
      if (value instanceof Error) throw value
      return { n: value ?? 0 } as unknown as T
    },
    async query<T>(sql: string): Promise<T[]> {
      if (/sync_state/i.test(sql)) return (opts.syncState ?? []) as unknown as T[]
      return [] as unknown as T[]
    }
  }
}

describe('classifyStoreContents (R1–R5 matrix)', () => {
  it('R1/R2: a populated projection points at the read path', () => {
    expect(classifyStoreContents(42, 0, 0)).toMatch(/projection populated/i)
  })

  it('R3: change-log present but no projection is a materialization bug', () => {
    expect(classifyStoreContents(0, 99, 0)).toMatch(/PROJECTION EMPTY/i)
  })

  it('R4: a persisted cursor with no data flags under-fetch / data loss', () => {
    expect(classifyStoreContents(0, 0, 262282)).toMatch(/CURSOR PERSISTED/i)
  })

  it('R5: everything empty is a genuinely cold/evicted cache', () => {
    expect(classifyStoreContents(0, 0, 0)).toMatch(/cold\/evicted/i)
  })

  it('prefers the projection verdict even when changes and a cursor also exist', () => {
    // A healthy returning user has all three; the projection is what matters.
    expect(classifyStoreContents(10, 500, 262282)).toMatch(/projection populated/i)
  })

  it('R0: a failed count (-1) is never misreported as empty', () => {
    // nodes count threw but changes has rows — must NOT claim "projection empty".
    expect(classifyStoreContents(-1, 500, 0)).toMatch(/verdict unreliable/i)
    expect(classifyStoreContents(-1, 500, 0)).not.toMatch(/PROJECTION EMPTY/i)
    expect(classifyStoreContents(0, -1, 262282)).toMatch(/verdict unreliable/i)
  })
})

describe('probeStoreContents', () => {
  it('reads the count matrix, cursors and last Lamport time', async () => {
    const probe = await probeStoreContents(
      fakeAdapter({
        counts: { nodes: 12, node_properties: 34, changes: 560 },
        syncState: [
          { key: 'lastLamportTime', value: '262282' },
          { key: 'nodeSync:hwm:did:key:zABC', value: '262000' },
          { key: 'nodeSync:hwm:did:key:zDEF', value: '5' },
          { key: 'unrelated', value: 'ignore-me' }
        ]
      })
    )

    expect(probe.nodes).toBe(12)
    expect(probe.nodeProperties).toBe(34)
    expect(probe.changes).toBe(560)
    expect(probe.lastLamportTime).toBe(262282)
    expect(probe.syncCursors).toEqual({ 'did:key:zABC': 262000, 'did:key:zDEF': 5 })
    expect(probe.verdict).toMatch(/projection populated/i)
  })

  it('classifies a cursor-without-data boot as the data-loss risk (R4)', async () => {
    const probe = await probeStoreContents(
      fakeAdapter({
        counts: { nodes: 0, node_properties: 0, changes: 0 },
        syncState: [{ key: 'nodeSync:hwm:did:key:z1', value: '262282' }]
      })
    )
    expect(probe.verdict).toMatch(/CURSOR PERSISTED/i)
  })

  it('reports -1 for a count that throws and never rejects', async () => {
    const probe = await probeStoreContents(
      fakeAdapter({
        counts: { nodes: new Error('no such table'), node_properties: 0, changes: 0 }
      })
    )
    expect(probe.nodes).toBe(-1)
    // A new database without sync_state still resolves cleanly.
    expect(probe.lastLamportTime).toBe(0)
    expect(probe.syncCursors).toEqual({})
  })
})
