/**
 * Hydration-mode benchmark: row-multiplied JOIN vs json_group_object
 * aggregation (exploration 0264, Wave 2).
 *
 * Runs against the REAL @sqlite.org/sqlite-wasm build (in-memory under Node —
 * the same engine the browser worker executes), seeds a workspace-scale node
 * set, and measures the three costs the row multiplication inflates:
 *   1. SQL execution time per hydrate chunk,
 *   2. rows shipped across the boundary (and their structured-clone cost —
 *      the same algorithm postMessage uses),
 *   3. end-to-end getNodes() time including JS parsing/grouping.
 *
 * The logged numbers are the Wave 3 gate: if boundary/clone cost dominates,
 * the JSONB props column is warranted; if SQL CPU dominates, it isn't.
 */

import type { NodeState } from './types'
import type { SchemaIRI } from '../schema/node'
import type { DID } from '@xnetjs/core'
import { createWebSQLiteAdapter } from '@xnetjs/sqlite/web'
import { describe, it, expect, vi } from 'vitest'
import { SQLiteNodeStorageAdapter } from './sqlite-adapter'

const SCHEMA_ID = 'xnet://bench/HydrationNode' as SchemaIRI
const AUTHOR = 'did:key:z6MkhydrationBench' as DID

const NODE_COUNT = 1000
const PROPS_PER_NODE = 8
const CHUNK = 450
const ITERATIONS = 30

function benchNode(index: number): NodeState {
  const properties: Record<string, unknown> = {}
  for (let p = 0; p < PROPS_PER_NODE; p++) {
    properties[`prop_${p}`] =
      p % 3 === 0 ? `text value ${index}-${p}` : p % 3 === 1 ? index * p : p % 2 === 0
  }
  const now = 1_700_000_000_000 + index
  return {
    id: `hyd-${String(index).padStart(4, '0')}`,
    schemaId: SCHEMA_ID,
    properties,
    timestamps: Object.fromEntries(
      Object.keys(properties).map((key, i) => [
        key,
        { lamport: index * 10 + i, author: AUTHOR, wallTime: now }
      ])
    ),
    deleted: false,
    createdAt: now,
    createdBy: AUTHOR,
    updatedAt: now,
    updatedBy: AUTHOR
  }
}

describe('hydration-mode benchmark (0264 Wave 2)', () => {
  it('measures row-multiplied vs aggregated hydration and verifies equivalence', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = await createWebSQLiteAdapter({ path: '/hydration-bench.db' })
    try {
      const rowsAdapter = new SQLiteNodeStorageAdapter(db, { aggregatedHydration: false })
      const aggAdapter = new SQLiteNodeStorageAdapter(db, { aggregatedHydration: true })

      const nodes = Array.from({ length: NODE_COUNT }, (_, i) => benchNode(i))
      await rowsAdapter.importNodes(nodes)

      const ids = nodes.slice(0, CHUNK).map((n) => n.id)

      // ── Correctness: both modes must produce identical NodeStates. ──
      const viaRows = await rowsAdapter.getNodes(ids)
      const viaAgg = await aggAdapter.getNodes(ids)
      expect(viaAgg).toHaveLength(viaRows.length)
      const byId = new Map(viaRows.map((n) => [n.id, n]))
      for (const node of viaAgg) {
        const reference = byId.get(node.id)!
        expect(node.properties).toEqual(reference.properties)
        expect(node.timestamps).toEqual(reference.timestamps)
        expect(node.updatedBy).toBe(reference.updatedBy)
        expect(node.deleted).toBe(reference.deleted)
      }

      // ── Capture each mode's chunk SQL via a proxy. ──
      const captured: { sql: string; params: unknown[] }[] = []
      const capturing = new Proxy(db, {
        get(target, property, receiver) {
          if (property === 'query') {
            return async (sql: string, params?: unknown[]) => {
              captured.push({ sql, params: params ?? [] })
              return target.query(sql, params as never)
            }
          }
          const value = Reflect.get(target, property, receiver)
          return typeof value === 'function' ? value.bind(target) : value
        }
      }) as typeof db
      await new SQLiteNodeStorageAdapter(capturing, { aggregatedHydration: false }).getNodes(ids)
      await new SQLiteNodeStorageAdapter(capturing, { aggregatedHydration: true }).getNodes(ids)
      // Each fresh adapter's first read runs the one-time pre-v8 column
      // repair PRAGMA (0305) — skip it; we want the two hydrate reads.
      const [rowsSql, aggSql] = captured.filter((read) => !read.sql.startsWith('PRAGMA'))

      // ── Measure: SQL exec + boundary clone per mode. ──
      const measure = async (read: { sql: string; params: unknown[] }) => {
        let rowCount = 0
        let queryMs = 0
        let cloneMs = 0
        for (let i = 0; i < ITERATIONS; i++) {
          const t0 = performance.now()
          const rows = await db.query(read.sql, read.params as never)
          queryMs += performance.now() - t0
          const t1 = performance.now()
          structuredClone(rows)
          cloneMs += performance.now() - t1
          rowCount = rows.length
        }
        return { rowCount, queryMs, cloneMs }
      }

      const measureEndToEnd = async (adapter: SQLiteNodeStorageAdapter) => {
        const t0 = performance.now()
        for (let i = 0; i < ITERATIONS; i++) {
          await adapter.getNodes(ids)
        }
        return performance.now() - t0
      }

      const rowsStats = await measure(rowsSql)
      const aggStats = await measure(aggSql)
      const rowsE2eMs = await measureEndToEnd(rowsAdapter)
      const aggE2eMs = await measureEndToEnd(aggAdapter)

      const fmt = (n: number): string => (n / ITERATIONS).toFixed(2)
      // eslint-disable-next-line no-console
      console.info(
        `[0264 bench] hydrate ${CHUNK} nodes × ${PROPS_PER_NODE} props @ ${NODE_COUNT}-node table (${ITERATIONS} iters, per-chunk):\n` +
          `  rows-mode: ${rowsStats.rowCount} rows | query ${fmt(rowsStats.queryMs)}ms | clone ${fmt(rowsStats.cloneMs)}ms | e2e ${fmt(rowsE2eMs)}ms\n` +
          `  agg-mode:  ${aggStats.rowCount} rows | query ${fmt(aggStats.queryMs)}ms | clone ${fmt(aggStats.cloneMs)}ms | e2e ${fmt(aggE2eMs)}ms\n` +
          `  boundary rows ×${(rowsStats.rowCount / aggStats.rowCount).toFixed(1)} | clone ×${(rowsStats.cloneMs / Math.max(aggStats.cloneMs, 0.001)).toFixed(1)}`
      )

      // The structural claim under test: aggregation collapses the boundary
      // to one row per node.
      expect(aggStats.rowCount).toBe(CHUNK)
      expect(rowsStats.rowCount).toBeGreaterThanOrEqual(CHUNK * PROPS_PER_NODE)
    } finally {
      await db.close()
      vi.restoreAllMocks()
    }
  }, 120_000)

  it('holds at a 10k-node table (larger scales opt-in via XNET_SQLITE_BENCH_MAX_NODES)', async () => {
    // Per-chunk hydrate cost must not regress as the TABLE grows — the chunk
    // reads the same 450 nodes; a larger b-tree only deepens the index probes.
    // 100k+ scales follow the repo's opt-in benchmark convention (0182).
    const scale = Number(process.env.XNET_SQLITE_BENCH_MAX_NODES ?? 10_000)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const db = await createWebSQLiteAdapter({ path: '/hydration-bench-10k.db' })
    try {
      const aggAdapter = new SQLiteNodeStorageAdapter(db, { aggregatedHydration: true })
      const nodes = Array.from({ length: Math.min(scale, 100_000) }, (_, i) => benchNode(i))
      await aggAdapter.importNodes(nodes)

      const ids = nodes.slice(0, CHUNK).map((n) => n.id)
      const start = performance.now()
      const iterations = 10
      for (let i = 0; i < iterations; i++) {
        await aggAdapter.getNodes(ids)
      }
      const perChunkMs = (performance.now() - start) / iterations

      // eslint-disable-next-line no-console
      console.info(
        `[0264 bench] agg-mode hydrate ${CHUNK} nodes @ ${nodes.length}-node table: ${perChunkMs.toFixed(2)}ms/chunk`
      )
      // Generous ceiling: catches an accidental O(table) regression, not noise.
      expect(perChunkMs).toBeLessThan(200)
    } finally {
      await db.close()
      vi.restoreAllMocks()
    }
  }, 240_000)
})
