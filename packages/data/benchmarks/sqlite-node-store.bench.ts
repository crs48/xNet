/**
 * SQLite NodeStore read-scaling and write-amplification benchmarks.
 *
 * Run smoke coverage:
 * XNET_SQLITE_BENCH_MAX_NODES=1000 pnpm exec vitest bench --project unit packages/data/benchmarks/sqlite-node-store.bench.ts --run
 *
 * Run larger datasets:
 * XNET_SQLITE_BENCH_MAX_NODES=100000 pnpm exec vitest bench --project unit packages/data/benchmarks/sqlite-node-store.bench.ts --run
 * XNET_SQLITE_BENCH_MAX_NODES=1000000 pnpm exec vitest bench --project unit packages/data/benchmarks/sqlite-node-store.bench.ts --run
 */

import type { SchemaIRI } from '../src/schema/node'
import type { DID } from '@xnetjs/core'
import type { SQLiteAdapter, SQLValue } from '@xnetjs/sqlite'
import { createMemorySQLiteAdapter } from '@xnetjs/sqlite/memory'
import { afterAll, beforeAll, bench, describe } from 'vitest'
import { SQLiteNodeStorageAdapter, type SQLiteNodeStorageAdapterOptions } from '../src/store'
import {
  SQLITE_BENCHMARK_SCALAR_PROPERTY_COUNT,
  createSQLiteBenchmarkNode,
  createSQLiteNodeStoreBenchmarkPlan,
  estimateSQLiteMutationWriteAmplification
} from '../src/store/sqlite-benchmarks'

type SeededBenchmarkStore = {
  db: SQLiteAdapter
  adapter: SQLiteNodeStorageAdapter
}

type CountRow = {
  count: number
  [key: string]: SQLValue
}

const BENCH_SCHEMA_ID = 'xnet://bench/SQLiteNodeStore' as SchemaIRI
const BENCH_AUTHOR_DID = 'did:key:z6Mksqlitenodestorebench' as DID
const DEFAULT_MAX_NODE_COUNT = 10_000
const SEED_BATCH_SIZE = 500
const maxNodeCount = readEnvInteger('XNET_SQLITE_BENCH_MAX_NODES', DEFAULT_MAX_NODE_COUNT)
const queryBenchmarkCases = createSQLiteNodeStoreBenchmarkPlan(maxNodeCount)

for (const benchmarkCase of queryBenchmarkCases) {
  const describeCase = benchmarkCase.enabledByDefault ? describe : describe.skip

  describeCase(
    `SQLite NodeStore query scaling - ${formatNodeCount(benchmarkCase.nodeCount)} synthetic nodes`,
    () => {
      let store: SeededBenchmarkStore | null = null

      beforeAll(async () => {
        store = await createSeededBenchmarkStore(benchmarkCase.nodeCount)
      }, 300_000)

      afterAll(async () => {
        await closeBenchmarkStore(store)
      })

      bench('default list LIMIT 50 uses SQL pagination', async () => {
        const result = await getBenchmarkStore(store).adapter.queryNodes({
          schemaId: BENCH_SCHEMA_ID,
          includeDeleted: false,
          orderBy: { updatedAt: 'desc' },
          limit: 50
        })

        assertStorageQuery(result.plan.strategy)
        assertBoundedResult(result.nodes.length, 50)
      })

      bench('selective equality LIMIT 50 uses scalar candidates', async () => {
        const result = await getBenchmarkStore(store).adapter.queryNodes({
          schemaId: BENCH_SCHEMA_ID,
          includeDeleted: false,
          where: { status: 'open' },
          orderBy: { updatedAt: 'desc' },
          limit: 50
        })

        assertStorageQuery(result.plan.strategy)
        assertBoundedResult(result.nodes.length, 50)
      })

      bench('property sort keeps JS verification visible in plan metadata', async () => {
        const result = await getBenchmarkStore(store).adapter.queryNodes({
          schemaId: BENCH_SCHEMA_ID,
          includeDeleted: false,
          where: { bucket: 'bucket-7' },
          orderBy: { priority: 'desc' },
          limit: 50
        })

        assertStorageQuery(result.plan.strategy)
        assertBoundedResult(result.nodes.length, 50)
        if (result.plan.postFilterReason !== 'verified-in-js') {
          throw new Error(`Expected JS post-filtering, got ${result.plan.postFilterReason}`)
        }
      })
    }
  )
}

describe('SQLite NodeStore mutation write amplification', () => {
  let baselineStore: SeededBenchmarkStore | null = null
  let adaptiveStore: SeededBenchmarkStore | null = null
  let mutationOrdinal = 0

  beforeAll(async () => {
    baselineStore = await createSeededBenchmarkStore(1_000)
    adaptiveStore = await createSeededBenchmarkStore(1_000, {
      adaptiveIndexing: {
        enabled: true,
        minHits: 1,
        minDurationMs: 0,
        minCandidates: 0,
        maxIndexesPerSchema: 4
      }
    })
    await adaptiveStore.adapter.queryNodes({
      schemaId: BENCH_SCHEMA_ID,
      includeDeleted: false,
      where: { status: 'open' },
      limit: 50
    })
  }, 120_000)

  afterAll(async () => {
    await closeBenchmarkStore(baselineStore)
    await closeBenchmarkStore(adaptiveStore)
  })

  bench('setNode scalar sidecar replacement reports row footprint', async () => {
    const { db, adapter } = getBenchmarkStore(baselineStore)
    const node = nextMutationNode(mutationOrdinal++)

    await adapter.setNode(node)
    const scalarRows = await countRows(
      db,
      'SELECT COUNT(*) as count FROM node_property_scalars WHERE node_id = ?',
      [node.id]
    )

    if (scalarRows !== SQLITE_BENCHMARK_SCALAR_PROPERTY_COUNT) {
      throw new Error(
        `Expected ${SQLITE_BENCHMARK_SCALAR_PROPERTY_COUNT} scalar rows, got ${scalarRows}`
      )
    }
  })

  bench('setNode with adaptive indexes measures extra maintained indexes', async () => {
    const { db, adapter } = getBenchmarkStore(adaptiveStore)
    const node = nextMutationNode(mutationOrdinal++)

    await adapter.setNode(node)
    const adaptiveIndexes = await countRows(
      db,
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_auto_prop_%'"
    )

    if (adaptiveIndexes < 1) {
      throw new Error('Expected at least one adaptive index for mutation benchmark')
    }
  })

  bench('write amplification budget model includes scalar and adaptive index work', () => {
    const estimate = estimateSQLiteMutationWriteAmplification({
      scalarPropertyCount: SQLITE_BENCHMARK_SCALAR_PROPERTY_COUNT,
      adaptiveIndexCount: 4
    })

    if (estimate.writeAmplificationFactor <= SQLITE_BENCHMARK_SCALAR_PROPERTY_COUNT) {
      throw new Error(
        `Unexpected write amplification estimate: ${estimate.writeAmplificationFactor}`
      )
    }
  })
})

async function createSeededBenchmarkStore(
  nodeCount: number,
  options?: SQLiteNodeStorageAdapterOptions
): Promise<SeededBenchmarkStore> {
  const db = await createMemorySQLiteAdapter()
  const adapter = new SQLiteNodeStorageAdapter(db, options)

  for (let start = 0; start < nodeCount; start += SEED_BATCH_SIZE) {
    const batchSize = Math.min(SEED_BATCH_SIZE, nodeCount - start)
    const nodes = Array.from({ length: batchSize }, (_, offset) =>
      createSQLiteBenchmarkNode({
        index: start + offset,
        schemaId: BENCH_SCHEMA_ID,
        authorDID: BENCH_AUTHOR_DID
      })
    )

    for (const node of nodes) {
      await adapter.setNode(node)
    }
  }

  return { db, adapter }
}

async function closeBenchmarkStore(store: SeededBenchmarkStore | null): Promise<void> {
  if (store?.db.isOpen()) {
    await store.db.close()
  }
}

function getBenchmarkStore(store: SeededBenchmarkStore | null): SeededBenchmarkStore {
  if (!store) {
    throw new Error('Benchmark store has not been initialized')
  }

  return store
}

function nextMutationNode(mutationOrdinal: number) {
  return createSQLiteBenchmarkNode({
    index: mutationOrdinal % 1_000,
    schemaId: BENCH_SCHEMA_ID,
    authorDID: BENCH_AUTHOR_DID,
    mutationOrdinal
  })
}

async function countRows(db: SQLiteAdapter, sql: string, params: SQLValue[] = []): Promise<number> {
  const row = await db.queryOne<CountRow>(sql, params)

  return Number(row?.count ?? 0)
}

function assertStorageQuery(strategy: string): void {
  if (strategy !== 'storage-query') {
    throw new Error(`Expected storage-query strategy, got ${strategy}`)
  }
}

function assertBoundedResult(actual: number, expectedMax: number): void {
  if (actual > expectedMax) {
    throw new Error(`Expected at most ${expectedMax} rows, got ${actual}`)
  }
}

function readEnvInteger(name: string, fallback: number): number {
  const value = process.env[name]
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)

  return Number.isFinite(parsed) ? parsed : fallback
}

function formatNodeCount(nodeCount: number): string {
  return new Intl.NumberFormat('en-US').format(nodeCount)
}
