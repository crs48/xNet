/**
 * Scale-limits benchmark harness (exploration 0318). Skipped entirely in CI
 * and normal test runs — it only activates when XNET_SCALE_BENCH is set.
 *
 * Seeds N synthetic nodes (same shape as sqlite-benchmarks.ts) into an
 * on-disk better-sqlite3 database via the adapter's own SQL, then measures
 * the real SQLiteNodeStorageAdapter.queryNodes paths at scale: first pages,
 * exact counts, offset walks, materialized-view build/read, hydration modes,
 * and raw keyset/offset SQL controls.
 *
 * Run one scale per invocation (results written as JSON to RESULTS_DIR;
 * the DB file persists there so re-runs skip seeding):
 *   XNET_SCALE_BENCH=10000 pnpm exec vitest --project unit run \
 *     packages/data/src/store/scale-limits.bench.test.ts
 *
 * XNET_SCALE_RISKY=1 additionally runs the full-scan paths (property sort,
 * after-cursor, unbounded list) that hydrate every candidate into JS — these
 * are expected to be slow or OOM at large scales; that is the point.
 * Numbers and analysis: docs/explorations/0318_[_]_DATABASE_SCALE_LIMITS_*.md
 */

import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import type { DID } from '@xnetjs/core'
import { createElectronSQLiteAdapter } from '@xnetjs/sqlite/electron'
import type { ElectronSQLiteAdapter } from '@xnetjs/sqlite/electron'
import type { SchemaIRI } from '../schema/node'
import { SQLiteNodeStorageAdapter } from './index'
import { encodeNodeQueryCursor, type NodeQueryDescriptor, type NodeQueryResult } from './query'
import { hashScalarValue } from './query-compiler'

const SCALE = Number.parseInt(process.env.XNET_SCALE_BENCH ?? '0', 10)
const RISKY = process.env.XNET_SCALE_RISKY === '1'
const RESULTS_DIR = process.env.XNET_SCALE_BENCH_DIR ?? join(tmpdir(), 'xnet-scale-bench')

const SCHEMA_ID = 'xnet://bench/ScaleRow' as SchemaIRI
const AUTHOR = 'did:key:z6MkscaleBenchAuthor0000000000000000000000000' as DID
const BASE_TS = 1_700_000_000_000
const WARM_RUNS = 15

type Timed = {
  coldMs?: number
  runsMs: number[]
  medianMs: number
  p95Ms: number
  rows?: number
  totalCount?: number
  strategy?: string
  postFilterReason?: string
  error?: string
  heapDeltaMB?: number
}

const results: Record<string, unknown> = {}
const timings: Record<string, Timed> = {}

function stats(runs: number[]): { medianMs: number; p95Ms: number } {
  const s = [...runs].sort((a, b) => a - b)
  return {
    medianMs: round(s[Math.floor(s.length / 2)] ?? Number.NaN),
    p95Ms: round(s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)] ?? Number.NaN)
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

async function timeQuery(
  name: string,
  adapter: SQLiteNodeStorageAdapter,
  descriptor: NodeQueryDescriptor,
  opts: { cold?: boolean; runs?: number } = {}
): Promise<NodeQueryResult | null> {
  const runs: number[] = []
  let last: NodeQueryResult | null = null
  let coldMs: number | undefined
  try {
    const n = opts.runs ?? WARM_RUNS
    for (let i = 0; i < n + (opts.cold ? 1 : 0); i++) {
      const t0 = performance.now()
      last = await adapter.queryNodes(descriptor)
      const dt = performance.now() - t0
      if (opts.cold && i === 0) coldMs = round(dt)
      else runs.push(dt)
    }
    timings[name] = {
      coldMs,
      runsMs: runs.map(round),
      ...stats(runs.length ? runs : [coldMs ?? Number.NaN]),
      rows: last?.nodes.length,
      totalCount: last?.totalCount,
      strategy: (last?.plan as { strategy?: string } | undefined)?.strategy,
      postFilterReason: (last?.plan as { postFilterReason?: string } | undefined)?.postFilterReason
    }
  } catch (err) {
    timings[name] = { runsMs: [], medianMs: Number.NaN, p95Ms: Number.NaN, error: String(err) }
  }
  flushResults()
  return last
}

function flushResults(): void {
  mkdirSync(RESULTS_DIR, { recursive: true })
  const file = join(RESULTS_DIR, `results-${SCALE}${RISKY ? '-risky' : ''}.json`)
  writeFileSync(
    file,
    JSON.stringify({ scale: SCALE, risky: RISKY, results, timings, partial: true }, null, 2)
  )
}

function propsFor(i: number): Record<string, unknown> {
  const status = i % 5 === 0 ? 'blocked' : i % 3 === 0 ? 'done' : 'open'
  return {
    title: `Synthetic task ${i}`,
    status,
    priority: i % 100,
    score: (i * 17) % 10_000,
    bucket: `bucket-${i % 64}`,
    done: status === 'done'
  }
}

function scalarFor(value: unknown): {
  type: string
  text: string | null
  num: number | null
  bool: number | null
  hash: string
} {
  if (typeof value === 'string')
    return { type: 'text', text: value, num: null, bool: null, hash: hashScalarValue(value) }
  if (typeof value === 'number')
    return {
      type: 'number',
      text: null,
      num: value,
      bool: null,
      hash: hashScalarValue(String(value))
    }
  return {
    type: 'boolean',
    text: null,
    num: null,
    bool: value ? 1 : 0,
    hash: value ? 'true' : 'false'
  }
}

const nodeId = (i: number): string => `bench-node-${String(i).padStart(9, '0')}`

async function seed(db: ElectronSQLiteAdapter, count: number): Promise<void> {
  const existing = await db.queryOne<{ c: number }>(
    'SELECT COUNT(*) AS c FROM nodes WHERE schema_id = ?',
    [SCHEMA_ID]
  )
  if (Number(existing?.c ?? 0) === count) {
    results.seed = { skipped: true, existingRows: Number(existing?.c) }
    return
  }

  await db.exec('PRAGMA synchronous = OFF')
  await db.exec('PRAGMA journal_mode = WAL')
  await db.exec('PRAGMA cache_size = -262144') // 256 MiB page cache

  const NODES_PER_STMT = 400
  const t0 = performance.now()
  const enc = new TextEncoder()

  for (let start = 0; start < count; start += 25_000) {
    const chunkEnd = Math.min(start + 25_000, count)
    await db.beginTransaction()
    for (let s = start; s < chunkEnd; s += NODES_PER_STMT) {
      const e = Math.min(s + NODES_PER_STMT, chunkEnd)
      const nodeParams: unknown[] = []
      const propParams: unknown[] = []
      const scalarParams: unknown[] = []
      for (let i = s; i < e; i++) {
        const id = nodeId(i)
        const createdAt = BASE_TS + i
        const updatedAt = BASE_TS + i
        nodeParams.push(id, SCHEMA_ID, createdAt, updatedAt, AUTHOR, null)
        const props = propsFor(i)
        let lamport = 1
        for (const [key, value] of Object.entries(props)) {
          propParams.push(
            id,
            key,
            enc.encode(JSON.stringify(value)),
            lamport,
            AUTHOR,
            updatedAt,
            null
          )
          const sc = scalarFor(value)
          scalarParams.push(
            id,
            SCHEMA_ID,
            key,
            sc.type,
            sc.text,
            sc.num,
            sc.bool,
            sc.hash,
            updatedAt,
            lamport
          )
          lamport++
        }
      }
      const n = e - s
      await db.run(
        `INSERT INTO nodes (id, schema_id, created_at, updated_at, created_by, deleted_at) VALUES ${Array(n).fill('(?,?,?,?,?,?)').join(',')}`,
        nodeParams as never
      )
      await db.run(
        `INSERT INTO node_properties (node_id, property_key, value, lamport_time, updated_by, updated_at, tiebreak_key) VALUES ${Array(
          n * 6
        )
          .fill('(?,?,?,?,?,?,?)')
          .join(',')}`,
        propParams as never
      )
      await db.run(
        `INSERT INTO node_property_scalars (node_id, schema_id, property_key, value_type, value_text, value_number, value_boolean, value_hash, updated_at, lamport_time) VALUES ${Array(
          n * 6
        )
          .fill('(?,?,?,?,?,?,?,?,?,?)')
          .join(',')}`,
        scalarParams as never
      )
    }
    await db.commit()
    if ((start / 25_000) % 20 === 0) {
      console.log(`seed progress ${chunkEnd}/${count} @ ${round((performance.now() - t0) / 1000)}s`)
    }
  }

  const tAnalyze = performance.now()
  await db.exec('ANALYZE')
  await db.exec('PRAGMA optimize')
  await db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const t1 = performance.now()
  results.seed = {
    seconds: round((t1 - t0) / 1000),
    analyzeSeconds: round((t1 - tAnalyze) / 1000),
    rowsPerSec: Math.round(count / ((tAnalyze - t0) / 1000)),
    physicalRows: count * 13
  }
  await db.exec('PRAGMA synchronous = NORMAL')
}

describe.skipIf(!SCALE)(`scale-limits ${SCALE}`, () => {
  it('measures query paths at scale', { timeout: 7_200_000 }, async () => {
    mkdirSync(RESULTS_DIR, { recursive: true })
    const dbPath = join(RESULTS_DIR, `bench-${SCALE}.db`)
    const seedDb = await createElectronSQLiteAdapter({ path: dbPath })
    await seed(seedDb, SCALE)
    await seedDb.close()
    results.fileBytes = statSync(dbPath).size
    for (const suffix of ['-wal', '-shm']) {
      const p = dbPath + suffix
      if (existsSync(p)) results[`fileBytes${suffix}`] = statSync(p).size
    }

    // Fresh connection for measurements (cold statement caches, warm OS cache).
    const db = await createElectronSQLiteAdapter({ path: dbPath })
    const adapter = new SQLiteNodeStorageAdapter(db)

    const base: NodeQueryDescriptor = {
      schemaId: SCHEMA_ID,
      includeDeleted: false,
      orderBy: { updatedAt: 'desc' },
      limit: 50
    }

    // 1. Cold + warm first page (the app's default list read).
    const firstPage = await timeQuery('first_page_50', adapter, base, { cold: true })

    // 2. The grid's actual window (useGridDatabase pageSize = 500).
    await timeQuery('first_page_500', adapter, { ...base, limit: 500 })

    // 3. Wider hydrate (arity bucket 450).
    await timeQuery('first_page_450', adapter, { ...base, limit: 450 })

    // 4. Exact count folded into the page query.
    await timeQuery('count_exact_50', adapter, { ...base, count: 'exact' })

    // 5. Scalar-filtered page.
    await timeQuery('filtered_status_50', adapter, { ...base, where: { status: 'open' } })

    // 6. Offset walk (scrollbar-jump cost curve).
    for (const off of [1_000, 10_000, 100_000, 1_000_000, 5_000_000, Math.floor(SCALE / 2)]) {
      if (off + 50 > SCALE) continue
      await timeQuery(`offset_${off}`, adapter, { ...base, offset: off }, { runs: 7 })
    }

    // 7. Materialized view: build cost, then deep page reads through it.
    await timeQuery(
      'mv_build',
      adapter,
      { ...base, materializedView: { viewId: 'bench-mv', forceRefresh: true } },
      { runs: 1 }
    )
    await timeQuery('mv_first_page_50', adapter, {
      ...base,
      materializedView: { viewId: 'bench-mv' }
    })
    await timeQuery(
      'mv_offset_mid',
      adapter,
      { ...base, offset: Math.floor(SCALE / 2), materializedView: { viewId: 'bench-mv' } },
      { runs: 7 }
    )

    // 8. Joined (non-aggregated) hydration variant for comparison.
    const joinedAdapter = new SQLiteNodeStorageAdapter(db, { aggregatedHydration: false })
    await timeQuery('first_page_50_joined_hydration', joinedAdapter, base)

    // 9. Raw SQL controls on the same connection.
    await rawControls(db)

    // 10. Risky full-scan paths (opt-in): property sort, cursor, unbounded.
    if (RISKY) {
      await timeQuery(
        'property_sort_50',
        adapter,
        { ...base, orderBy: { priority: 'desc' } },
        { runs: 3 }
      )
      if (firstPage && firstPage.nodes.length > 0) {
        const cursor = encodeNodeQueryCursor(base, firstPage.nodes[firstPage.nodes.length - 1])
        await timeQuery('after_cursor_page_50', adapter, { ...base, after: cursor }, { runs: 3 })
      }
      const heap0 = process.memoryUsage().heapUsed
      const unbounded = await timeQuery(
        'unbounded_list',
        adapter,
        { schemaId: SCHEMA_ID, includeDeleted: false },
        { runs: 1 }
      )
      timings.unbounded_list.heapDeltaMB = Math.round(
        (process.memoryUsage().heapUsed - heap0) / 1_048_576
      )
      timings.unbounded_list.rows = unbounded?.nodes.length

      // Adaptive-index variant: the built-but-disabled fix for property sorts.
      const adaptive = new SQLiteNodeStorageAdapter(db, {
        adaptiveIndexing: {
          enabled: true,
          minHits: 1,
          minDurationMs: 0,
          minCandidates: 0,
          maxIndexesPerSchema: 4
        }
      })
      await timeQuery(
        'property_sort_50_adaptive_first',
        adaptive,
        { ...base, orderBy: { priority: 'desc' } },
        { runs: 1 }
      )
      await timeQuery(
        'property_sort_50_adaptive_warm',
        adaptive,
        { ...base, orderBy: { priority: 'desc' } },
        { runs: 5 }
      )
    }

    await db.close()

    const out = { scale: SCALE, risky: RISKY, results, timings, at: new Date().toISOString() }
    const file = join(RESULTS_DIR, `results-${SCALE}${RISKY ? '-risky' : ''}.json`)
    writeFileSync(file, JSON.stringify(out, null, 2))
    console.log(`RESULTS WRITTEN: ${file}`)
  })
})

async function rawControls(db: ElectronSQLiteAdapter): Promise<void> {
  const mid = Math.floor(SCALE / 2)
  const raw = async (name: string, sql: string, params: unknown[], runs = 7) => {
    const runsMs: number[] = []
    let rows = 0
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now()
      const r = await db.query(sql, params as never)
      runsMs.push(performance.now() - t0)
      rows = r.length
    }
    timings[name] = { runsMs: runsMs.map(round), ...stats(runsMs), rows }
  }

  await raw(
    'raw_count',
    'SELECT COUNT(*) AS c FROM nodes WHERE schema_id = ? AND deleted_at IS NULL',
    [SCHEMA_ID],
    3
  )
  await raw(
    'raw_offset_mid',
    `SELECT id FROM nodes WHERE schema_id = ? AND deleted_at IS NULL
     ORDER BY updated_at DESC LIMIT 50 OFFSET ${mid}`,
    [SCHEMA_ID]
  )
  const anchor = await db.queryOne<{ updated_at: number; id: string }>(
    `SELECT updated_at, id FROM nodes WHERE schema_id = ? AND deleted_at IS NULL
     ORDER BY updated_at DESC LIMIT 1 OFFSET ${mid}`,
    [SCHEMA_ID]
  )
  if (anchor) {
    await raw(
      'raw_keyset_mid',
      `SELECT id FROM nodes WHERE schema_id = ? AND deleted_at IS NULL
       AND (updated_at, id) < (?, ?)
       ORDER BY updated_at DESC, id DESC LIMIT 50`,
      [SCHEMA_ID, anchor.updated_at, anchor.id]
    )
  }
}
