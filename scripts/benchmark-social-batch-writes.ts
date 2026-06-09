import type { SchemaIRI } from '../packages/data/src/schema/node.ts'
import type {
  DeterministicNodeImportDraft,
  NodeBatchWritePolicy,
  NodeBatchWriteResult,
  NodeId
} from '../packages/data/src/store/index.ts'
import type { DID } from '@xnetjs/core'
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { promises as fs } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { generateSigningKeyPair } from '../packages/crypto/src/index.ts'
import { NodeStore, SQLiteNodeStorageAdapter } from '../packages/data/src/store/index.ts'
import { createDID } from '../packages/identity/src/index.ts'
import {
  iterateSocialImportBenchmarkDrafts,
  SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS
} from '../packages/social/src/import/benchmark-fixtures.ts'
import { SocialContentSchema } from '../packages/social/src/schemas/index.ts'
import { createElectronSQLiteAdapter } from '../packages/sqlite/src/adapters/electron.ts'
import { createMemorySQLiteAdapter } from '../packages/sqlite/src/adapters/memory.ts'

type BenchmarkRuntime = 'electron' | 'memory'

type BenchmarkOptions = {
  chunkSize: number
  counts: number[]
  keepDatabases: boolean
  outputPath: string
  policy: NodeBatchWritePolicy
  progressEveryBatches: number
  runtimes: BenchmarkRuntime[]
}

type StorageTotals = {
  nodeRowsWritten: number
  propertyRowsWritten: number
  changeRowsWritten: number
  scalarRowsWritten: number
  ftsRowsWritten: number
}

type TimingTotals = {
  preflightMs: number
  materializeMs: number
  applyMs: number
  notifyMs: number
  totalMs: number
}

type TimingSummary = TimingTotals & {
  avgBatchMs: number
  maxBatchMs: number
  p95BatchMs: number
}

type QueryCheck = {
  nodeCount: number
  scalarQueryRows: number
  scalarQueryPlan: string
  scalarQueryMs: number
}

type BenchmarkResult = {
  ok: true
  runtime: BenchmarkRuntime
  count: number
  chunkSize: number
  batchCount: number
  created: number
  updated: number
  changeCount: number
  totalMs: number
  recordsPerSecond: number
  databaseSizeBytes: number
  storage: StorageTotals
  timings: TimingSummary
  queryCheck: QueryCheck
}

type BenchmarkError = {
  ok: false
  runtime: BenchmarkRuntime
  count: number
  chunkSize: number
  error: string
  totalMs: number
}

type BenchmarkReport = {
  createdAt: string
  options: {
    chunkSize: number
    counts: number[]
    policy: NodeBatchWritePolicy
    progressEveryBatches: number
    runtimes: BenchmarkRuntime[]
  }
  results: Array<BenchmarkResult | BenchmarkError>
}

type RuntimeStore = {
  adapter: SQLiteNodeStorageAdapter
  db: SQLiteAdapter
  dbPath: string | null
  store: NodeStore
}

const DEFAULT_OUTPUT_PATH = 'tmp/social-batch-benchmark.json'
const DEFAULT_CHUNK_SIZE = 2500
const SOCIAL_CONTENT_SCHEMA_ID = SocialContentSchema.schema['@id'] as SchemaIRI
const EMPTY_STORAGE_TOTALS: StorageTotals = {
  nodeRowsWritten: 0,
  propertyRowsWritten: 0,
  changeRowsWritten: 0,
  scalarRowsWritten: 0,
  ftsRowsWritten: 0
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2))
  const results: Array<BenchmarkResult | BenchmarkError> = []

  for (const runtime of options.runtimes) {
    for (const count of options.counts) {
      results.push(await benchmarkRuntimeSafely({ runtime, count, options }))
    }
  }

  const report: BenchmarkReport = {
    createdAt: new Date().toISOString(),
    options: {
      chunkSize: options.chunkSize,
      counts: options.counts,
      policy: options.policy,
      progressEveryBatches: options.progressEveryBatches,
      runtimes: options.runtimes
    },
    results
  }

  await fs.mkdir(dirname(options.outputPath), { recursive: true })
  await fs.writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  printSummary(report, options.outputPath)
  if (results.some((result) => !result.ok)) {
    process.exitCode = 1
  }
}

async function benchmarkRuntimeSafely(input: {
  count: number
  options: BenchmarkOptions
  runtime: BenchmarkRuntime
}): Promise<BenchmarkResult | BenchmarkError> {
  const startedAt = performance.now()
  console.log(
    `Benchmarking ${input.runtime} ${input.count.toLocaleString()} records ` +
      `in ${input.options.chunkSize.toLocaleString()}-record chunks...`
  )

  try {
    return await benchmarkRuntime(input)
  } catch (error) {
    return {
      ok: false,
      runtime: input.runtime,
      count: input.count,
      chunkSize: input.options.chunkSize,
      error: error instanceof Error ? error.message : String(error),
      totalMs: performance.now() - startedAt
    }
  }
}

async function benchmarkRuntime(input: {
  count: number
  options: BenchmarkOptions
  runtime: BenchmarkRuntime
}): Promise<BenchmarkResult> {
  const runtimeStore = await createRuntimeStore(input.runtime, input.options.outputPath)
  const startedAt = performance.now()
  const storageTotals = { ...EMPTY_STORAGE_TOTALS }
  const timingTotals: TimingTotals = {
    preflightMs: 0,
    materializeMs: 0,
    applyMs: 0,
    notifyMs: 0,
    totalMs: 0
  }
  const batchDurations: number[] = []
  let batch: DeterministicNodeImportDraft[] = []
  let batchCount = 0
  let created = 0
  let updated = 0
  let changeCount = 0
  let processed = 0

  try {
    for (const draft of iterateSocialImportBenchmarkDrafts({
      count: input.count,
      platform: input.runtime,
      bucketId: `${input.runtime}.benchmark`
    })) {
      batch.push(toDeterministicDraft(draft))
      if (batch.length >= input.options.chunkSize) {
        const result = await writeBatch(runtimeStore.store, batch, input.options.policy)
        batchCount += 1
        created += result.created
        updated += result.updated
        changeCount += result.changeCount
        processed += batch.length
        addStorageTotals(storageTotals, result)
        addTimingTotals(timingTotals, batchDurations, result)
        printBatchProgress({
          batchCount,
          count: input.count,
          processed,
          result,
          startedAt,
          progressEveryBatches: input.options.progressEveryBatches
        })
        batch = []
      }
    }

    if (batch.length > 0) {
      const result = await writeBatch(runtimeStore.store, batch, input.options.policy)
      batchCount += 1
      created += result.created
      updated += result.updated
      changeCount += result.changeCount
      processed += batch.length
      addStorageTotals(storageTotals, result)
      addTimingTotals(timingTotals, batchDurations, result)
      printBatchProgress({
        batchCount,
        count: input.count,
        processed,
        result,
        startedAt,
        progressEveryBatches: input.options.progressEveryBatches
      })
    }

    const totalMs = performance.now() - startedAt
    const queryCheck = await verifyTouchedIndexes(
      runtimeStore.store,
      runtimeStore.adapter,
      input.count
    )
    const databaseSizeBytes = await runtimeStore.db.getDatabaseSize()

    return {
      ok: true,
      runtime: input.runtime,
      count: input.count,
      chunkSize: input.options.chunkSize,
      batchCount,
      created,
      updated,
      changeCount,
      totalMs,
      recordsPerSecond: input.count / Math.max(totalMs / 1000, 0.001),
      databaseSizeBytes,
      storage: storageTotals,
      timings: {
        ...timingTotals,
        avgBatchMs: timingTotals.totalMs / Math.max(batchCount, 1),
        maxBatchMs: Math.max(...batchDurations, 0),
        p95BatchMs: percentile(batchDurations, 0.95)
      },
      queryCheck
    }
  } finally {
    await closeRuntimeStore(runtimeStore, input.options.keepDatabases)
  }
}

async function writeBatch(
  store: NodeStore,
  drafts: readonly DeterministicNodeImportDraft[],
  policy: NodeBatchWritePolicy
): Promise<NodeBatchWriteResult> {
  return store.batchWrite({
    kind: 'deterministic-import',
    drafts,
    policy
  })
}

async function createRuntimeStore(
  runtime: BenchmarkRuntime,
  outputPath: string
): Promise<RuntimeStore> {
  const keyPair = generateSigningKeyPair()
  const authorDID = createDID(keyPair.publicKey) as DID
  const dbPath =
    runtime === 'electron'
      ? join(
          dirname(resolve(outputPath)),
          `social-batch-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
        )
      : null
  if (dbPath) {
    await fs.mkdir(dirname(dbPath), { recursive: true })
  }
  const db =
    runtime === 'electron'
      ? await createElectronSQLiteAdapter({
          path: dbPath ?? ':memory:',
          busyTimeout: 5000,
          foreignKeys: true,
          walMode: true
        })
      : await createMemorySQLiteAdapter()
  const adapter = new SQLiteNodeStorageAdapter(db)
  await adapter.open()
  const store = new NodeStore({
    storage: adapter,
    authorDID,
    signingKey: keyPair.privateKey
  })
  await store.initialize()

  return { adapter, db, dbPath, store }
}

async function closeRuntimeStore(
  runtimeStore: RuntimeStore,
  keepDatabases: boolean
): Promise<void> {
  await runtimeStore.adapter.close()
  if (runtimeStore.db.isOpen()) {
    await runtimeStore.db.close()
  }
  if (!keepDatabases && runtimeStore.dbPath) {
    await Promise.all(
      [runtimeStore.dbPath, `${runtimeStore.dbPath}-wal`, `${runtimeStore.dbPath}-shm`].map(
        async (path) => {
          try {
            await fs.unlink(path)
          } catch {
            // Ignore missing SQLite sidecar files.
          }
        }
      )
    )
  }
}

async function verifyTouchedIndexes(
  store: NodeStore,
  adapter: SQLiteNodeStorageAdapter,
  expectedCount: number
): Promise<QueryCheck> {
  const nodeCount = await adapter.countNodes({
    schemaId: SOCIAL_CONTENT_SCHEMA_ID,
    includeDeleted: false
  })
  if (nodeCount !== expectedCount) {
    throw new Error(`Expected ${expectedCount} imported nodes, found ${nodeCount}`)
  }

  const queryStartedAt = performance.now()
  const queryResult = await store.query({
    schemaId: SOCIAL_CONTENT_SCHEMA_ID,
    includeDeleted: false,
    where: { contentType: 'video' },
    limit: 5
  })
  const scalarQueryMs = performance.now() - queryStartedAt

  if (queryResult.nodes.length === 0) {
    throw new Error('Expected touched scalar indexes to return benchmark video rows')
  }

  return {
    nodeCount,
    scalarQueryRows: queryResult.nodes.length,
    scalarQueryPlan: queryResult.plan.strategy,
    scalarQueryMs
  }
}

function toDeterministicDraft(input: {
  deterministicId: string
  properties: Record<string, unknown>
  schemaId: string
}): DeterministicNodeImportDraft {
  return {
    id: input.deterministicId as NodeId,
    schemaId: input.schemaId as SchemaIRI,
    properties: input.properties
  }
}

function addStorageTotals(totals: StorageTotals, result: NodeBatchWriteResult): void {
  const storage = result.storage
  if (!storage) return

  totals.nodeRowsWritten += storage.nodeRowsWritten
  totals.propertyRowsWritten += storage.propertyRowsWritten
  totals.changeRowsWritten += storage.changeRowsWritten
  totals.scalarRowsWritten += storage.scalarRowsWritten
  totals.ftsRowsWritten += storage.ftsRowsWritten
}

function addTimingTotals(
  totals: TimingTotals,
  batchDurations: number[],
  result: NodeBatchWriteResult
): void {
  totals.preflightMs += result.timings.preflightMs
  totals.materializeMs += result.timings.materializeMs
  totals.applyMs += result.timings.applyMs
  totals.notifyMs += result.timings.notifyMs
  totals.totalMs += result.timings.totalMs
  batchDurations.push(result.timings.totalMs)
}

function percentile(values: readonly number[], percentileRank: number): number {
  if (values.length === 0) return 0

  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileRank) - 1)
  return sorted[index] ?? 0
}

function readOptions(args: readonly string[]): BenchmarkOptions {
  return args.reduce(
    (options, arg) => {
      if (arg.startsWith('--runtime=')) {
        return { ...options, runtimes: parseRuntimes(arg.slice('--runtime='.length)) }
      }
      if (arg.startsWith('--counts=')) {
        return { ...options, counts: parseCounts(arg.slice('--counts='.length)) }
      }
      if (arg.startsWith('--chunk-size=')) {
        return { ...options, chunkSize: parsePositiveInteger(arg.slice('--chunk-size='.length)) }
      }
      if (arg.startsWith('--progress-every=')) {
        return {
          ...options,
          progressEveryBatches: parsePositiveInteger(arg.slice('--progress-every='.length))
        }
      }
      if (arg.startsWith('--out=')) {
        return { ...options, outputPath: resolve(arg.slice('--out='.length)) }
      }
      if (arg === '--keep-databases') {
        return { ...options, keepDatabases: true }
      }
      if (arg.startsWith('--index-mode=')) {
        return {
          ...options,
          policy: {
            ...options.policy,
            indexMode: parsePolicyValue(arg, ['eager', 'touched', 'defer-schema'])
          }
        }
      }
      return options
    },
    {
      chunkSize: DEFAULT_CHUNK_SIZE,
      counts: [SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS.tenThousand],
      keepDatabases: false,
      outputPath: resolve(DEFAULT_OUTPUT_PATH),
      policy: {
        indexMode: 'touched',
        notificationMode: 'batch',
        syncMode: 'defer'
      },
      progressEveryBatches: 10,
      runtimes: ['electron']
    } satisfies BenchmarkOptions
  )
}

function parseRuntimes(value: string): BenchmarkRuntime[] {
  const values = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (values.includes('both')) return ['electron', 'memory']

  const runtimes = values.map((item) => {
    if (item === 'electron' || item === 'memory') return item
    throw new Error(`Unknown benchmark runtime: ${item}`)
  })

  return runtimes.length > 0 ? [...new Set(runtimes)] : ['electron']
}

function parseCounts(value: string): number[] {
  const counts = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseRecordCount)

  return counts.length > 0 ? counts : [SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS.tenThousand]
}

function parseRecordCount(value: string): number {
  const normalized = value.toLowerCase()
  const aliases: Record<string, number> = {
    '10k': SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS.tenThousand,
    youtube: SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS.largeYouTubeLike,
    '72k': SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS.largeYouTubeLike,
    '72738': SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS.largeYouTubeLike,
    '280k': SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS.largeSourceRecordImport,
    source: SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS.largeSourceRecordImport,
    '1m': SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS.stressMillion,
    million: SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS.stressMillion
  }

  if (aliases[normalized] !== undefined) return aliases[normalized]
  return parsePositiveInteger(value)
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got ${value}`)
  }
  return parsed
}

function parsePolicyValue<const T extends readonly string[]>(arg: string, allowed: T): T[number] {
  const value = arg.slice(arg.indexOf('=') + 1)
  if (!allowed.includes(value)) {
    throw new Error(`Expected ${arg} to be one of ${allowed.join(', ')}`)
  }
  return value
}

function printBatchProgress(input: {
  batchCount: number
  count: number
  processed: number
  progressEveryBatches: number
  result: NodeBatchWriteResult
  startedAt: number
}): void {
  const shouldPrint =
    input.processed >= input.count || input.batchCount % input.progressEveryBatches === 0
  if (!shouldPrint) return

  const elapsedMs = performance.now() - input.startedAt
  const rate = input.processed / Math.max(elapsedMs / 1000, 0.001)
  const remainingMs = ((input.count - input.processed) / Math.max(rate, 1)) * 1000
  console.log(
    `  batch ${input.batchCount}: ${input.processed.toLocaleString()} / ` +
      `${input.count.toLocaleString()} records, ${Math.round(rate).toLocaleString()} rec/s, ` +
      `last ${Math.round(input.result.timings.totalMs)}ms ` +
      `(apply ${Math.round(input.result.timings.applyMs)}ms, ` +
      `materialize ${Math.round(input.result.timings.materializeMs)}ms), ` +
      `remaining ~${formatDuration(remainingMs)}`
  )
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '0s'

  const totalSeconds = Math.ceil(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
}

function printSummary(report: BenchmarkReport, outputPath: string): void {
  const rows = report.results.map((result) => ({
    runtime: result.runtime,
    status: result.ok ? 'ok' : 'error',
    records: result.count,
    batches: result.ok ? result.batchCount : 0,
    totalMs: Math.round(result.totalMs),
    recordsPerSecond: result.ok ? Math.round(result.recordsPerSecond) : 0,
    applyMs: result.ok ? Math.round(result.timings.applyMs) : 0,
    materializeMs: result.ok ? Math.round(result.timings.materializeMs) : 0,
    preflightMs: result.ok ? Math.round(result.timings.preflightMs) : 0,
    queryMs: result.ok ? Math.round(result.queryCheck.scalarQueryMs) : 0,
    dbMB: result.ok ? Math.round(result.databaseSizeBytes / 1024 / 1024) : 0,
    error: result.ok ? '' : result.error
  }))

  console.table(rows)
  console.log(`Wrote social batch benchmark report to ${outputPath}`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
