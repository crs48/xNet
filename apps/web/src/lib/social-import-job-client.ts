import type {
  ApplyNodeBatchResult,
  DeterministicNodeImportDraft,
  NodeBatchWriteTimings,
  SchemaIRI
} from '@xnetjs/data'
import type { SocialImportNodeDraft } from '@xnetjs/social/import/browser'
import type { SocialImportJobPhase } from '@xnetjs/social/import/core'
import type { SQLiteOperationStats } from '@xnetjs/sqlite'
import {
  createSocialImportJob,
  createSocialImportJobCheckpointAccumulator,
  upsertSocialImportJobProgress,
  updateSocialImportJob
} from '@xnetjs/social/import/core'
import {
  readBrowserSocialImportStageChunk,
  type BrowserSocialImportStageResult
} from './social-import-worker-client'

export type BrowserSocialImportCommitSummary = {
  created: number
  updated: number
  batches: number
}

export type BrowserSocialImportCommitProgressPhase =
  | 'checking'
  | 'writing'
  | 'indexing'
  | 'committed'

export type BrowserSocialImportCommitProgressMetrics = {
  recordsPerSecond: number
  lastCheckMs: number
  lastWriteMs: number
  lastPreflightMs: number
  lastMaterializeMs: number
  lastApplyMs: number
  lastNotifyMs: number
  lastProgressMs: number
  totalCheckMs: number
  totalWriteMs: number
  totalPreflightMs: number
  totalMaterializeMs: number
  totalApplyMs: number
  totalNotifyMs: number
  totalProgressMs: number
  totalNodeRowsWritten: number
  totalPropertyRowsWritten: number
  totalChangeRowsWritten: number
  totalScalarRowsWritten: number
  totalFtsRowsWritten: number
  lastSqlOperations: number
  lastWorkerRequests: number
  totalSqlOperations: number
  totalWorkerRequests: number
}

export type BrowserSocialImportCommitProgress = {
  phase: BrowserSocialImportCommitProgressPhase
  totalRecords: number
  processedRecords: number
  totalBatches: number
  completedBatches: number
  currentBatch: number
  created: number
  updated: number
  startedAt: number
  updatedAt: number
  metrics: BrowserSocialImportCommitProgressMetrics
}

export type BrowserSocialImportCommitJob = {
  jobId: string
  promise: Promise<BrowserSocialImportCommitSummary>
}

export type StartBrowserSocialImportCommitJobInput = {
  jobId?: string
  stageResult: BrowserSocialImportStageResult
  includeSourceRecords: boolean
  initialProgress?: {
    processedRecords: number
    completedBatches: number
    created: number
    updated: number
  }
  importDrafts: (drafts: DeterministicNodeImportDraft[]) => Promise<{
    created: number
    updated: number
    affectedSchemaIds?: readonly SchemaIRI[]
    storage?: ApplyNodeBatchResult
    timings?: NodeBatchWriteTimings
  }>
  getOperationStats?: () => Promise<SQLiteOperationStats | null>
  rebuildIndexesForSchemas?: (schemaIds: readonly SchemaIRI[]) => Promise<void>
  /**
   * Refresh query-planner statistics (ANALYZE) once the import has committed.
   * SQLite does not auto-maintain stats after a bulk insert, so without this
   * the first post-import reads can pick full scans over indexes — the cause
   * of the slow-after-import sidebar (exploration 0184).
   */
  analyzeDatabase?: () => Promise<void>
  onProgress?: (progress: BrowserSocialImportCommitProgress) => void
}

const COMMIT_BATCH_SIZE = 2500
const activeCommitJobs = new Map<string, BrowserSocialImportCommitJob>()
const cancelledCommitJobIds = new Set<string>()

export class BrowserSocialImportCommitCancelledError extends Error {
  constructor(jobId: string) {
    super(`Social import commit ${jobId} was cancelled`)
    this.name = 'BrowserSocialImportCommitCancelledError'
  }
}

export function getBrowserSocialImportCommitRecordCount(
  stageResult: Pick<BrowserSocialImportStageResult, 'canonicalRecordCount' | 'recordCount'>,
  includeSourceRecords: boolean
): number {
  return 2 + (includeSourceRecords ? stageResult.recordCount : stageResult.canonicalRecordCount)
}

export function startBrowserSocialImportCommitJob(
  input: StartBrowserSocialImportCommitJobInput
): BrowserSocialImportCommitJob {
  const totalRecords = getBrowserSocialImportCommitRecordCount(
    input.stageResult,
    input.includeSourceRecords
  )
  const totalChunks = Math.ceil(totalRecords / COMMIT_BATCH_SIZE)
  const jobId =
    input.jobId ??
    createSocialImportJob({
      archiveName: input.stageResult.archive.filename,
      platform: input.stageResult.archive.adapter?.platform ?? 'unknown',
      totalRecords,
      totalChunks,
      warnings: input.stageResult.summary.totalWarnings
    }).jobId
  cancelledCommitJobIds.delete(jobId)
  const queuedJob = updateSocialImportJob(jobId, {
    status: 'queued',
    phase: 'checking',
    totalRecords,
    totalChunks,
    processedRecords: input.initialProgress?.processedRecords ?? 0,
    created: input.initialProgress?.created ?? 0,
    updated: input.initialProgress?.updated ?? 0,
    currentChunk: input.initialProgress?.completedBatches ?? 0,
    warnings: input.stageResult.summary.totalWarnings,
    error: null,
    completedAt: null
  })
  if (!queuedJob) {
    upsertSocialImportJobProgress({
      jobId,
      status: 'queued',
      phase: 'checking',
      platform: input.stageResult.archive.adapter?.platform ?? 'unknown',
      archiveName: input.stageResult.archive.filename,
      totalRecords,
      processedRecords: input.initialProgress?.processedRecords ?? 0,
      created: input.initialProgress?.created ?? 0,
      updated: input.initialProgress?.updated ?? 0,
      skipped: 0,
      warnings: input.stageResult.summary.totalWarnings,
      currentBucketId: null,
      currentChunk: input.initialProgress?.completedBatches ?? 0,
      totalChunks,
      startedAt: null,
      updatedAt: Date.now(),
      completedAt: null,
      error: null,
      metrics: null,
      checkpoint: null,
      bucketCheckpoints: []
    })
  }

  const promise = commitBrowserSocialImportStage({
    ...input,
    jobId,
    totalRecords,
    totalChunks
  })
    .then((summary) => {
      updateSocialImportJob(jobId, {
        status: 'completed',
        phase: 'finalizing',
        processedRecords: totalRecords,
        created: summary.created,
        updated: summary.updated,
        currentChunk: summary.batches,
        totalChunks: summary.batches,
        error: null
      })
      return summary
    })
    .catch((error: unknown) => {
      if (error instanceof BrowserSocialImportCommitCancelledError) {
        updateSocialImportJob(jobId, {
          status: 'cancelled',
          phase: 'finalizing',
          error: null
        })
        throw error
      }

      updateSocialImportJob(jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    })
    .finally(() => {
      activeCommitJobs.delete(jobId)
      cancelledCommitJobIds.delete(jobId)
    })

  const job = {
    jobId,
    promise
  }
  activeCommitJobs.set(jobId, job)
  return job
}

export function getActiveBrowserSocialImportCommitJobs(): BrowserSocialImportCommitJob[] {
  return [...activeCommitJobs.values()]
}

export function cancelBrowserSocialImportCommitJob(jobId: string): boolean {
  if (!activeCommitJobs.has(jobId)) return false

  cancelledCommitJobIds.add(jobId)
  updateSocialImportJob(jobId, {
    status: 'cancelled',
    error: null
  })
  return true
}

async function commitBrowserSocialImportStage(input: {
  stageResult: BrowserSocialImportStageResult
  includeSourceRecords: boolean
  importDrafts: StartBrowserSocialImportCommitJobInput['importDrafts']
  getOperationStats?: StartBrowserSocialImportCommitJobInput['getOperationStats']
  rebuildIndexesForSchemas?: StartBrowserSocialImportCommitJobInput['rebuildIndexesForSchemas']
  analyzeDatabase?: StartBrowserSocialImportCommitJobInput['analyzeDatabase']
  onProgress?: (progress: BrowserSocialImportCommitProgress) => void
  jobId: string
  initialProgress?: StartBrowserSocialImportCommitJobInput['initialProgress']
  totalRecords: number
  totalChunks: number
}): Promise<BrowserSocialImportCommitSummary> {
  let created = 0
  let updated = 0
  let offset = input.initialProgress?.processedRecords ?? 0
  let completedBatches = input.initialProgress?.completedBatches ?? 0
  created = input.initialProgress?.created ?? created
  updated = input.initialProgress?.updated ?? updated
  const startedAt = Date.now()
  const metrics: Omit<BrowserSocialImportCommitProgressMetrics, 'recordsPerSecond'> = {
    lastCheckMs: 0,
    lastWriteMs: 0,
    lastPreflightMs: 0,
    lastMaterializeMs: 0,
    lastApplyMs: 0,
    lastNotifyMs: 0,
    lastProgressMs: 0,
    totalCheckMs: 0,
    totalWriteMs: 0,
    totalPreflightMs: 0,
    totalMaterializeMs: 0,
    totalApplyMs: 0,
    totalNotifyMs: 0,
    totalProgressMs: 0,
    totalNodeRowsWritten: 0,
    totalPropertyRowsWritten: 0,
    totalChangeRowsWritten: 0,
    totalScalarRowsWritten: 0,
    totalFtsRowsWritten: 0,
    lastSqlOperations: 0,
    lastWorkerRequests: 0,
    totalSqlOperations: 0,
    totalWorkerRequests: 0
  }
  const checkpointAccumulator = createSocialImportJobCheckpointAccumulator()
  const affectedSchemaIds = new Set<SchemaIRI>()

  const reportProgress = (
    progress: Omit<BrowserSocialImportCommitProgress, 'startedAt' | 'updatedAt' | 'metrics'>
  ) => {
    const updatedAt = Date.now()
    const checkpointSnapshot = checkpointAccumulator.snapshot()
    const commitProgress = {
      ...progress,
      startedAt,
      updatedAt,
      metrics: {
        ...metrics,
        recordsPerSecond: getRecordsPerSecond(progress.processedRecords, startedAt, updatedAt)
      }
    }
    updateSocialImportJob(input.jobId, {
      status: 'running',
      phase: commitProgressPhaseToJobPhase(commitProgress),
      totalRecords: commitProgress.totalRecords,
      processedRecords: commitProgress.processedRecords,
      created: commitProgress.created,
      updated: commitProgress.updated,
      currentChunk: commitProgress.completedBatches,
      totalChunks: commitProgress.totalBatches,
      startedAt: commitProgress.startedAt,
      metrics: commitProgress.metrics,
      currentBucketId: checkpointSnapshot.checkpoint?.bucketId ?? null,
      checkpoint: checkpointSnapshot.checkpoint,
      bucketCheckpoints: checkpointSnapshot.bucketCheckpoints,
      error: null
    })
    input.onProgress?.(commitProgress)
  }

  await reportProgressAndYield(metrics, () =>
    reportProgress({
      phase: 'checking',
      totalRecords: input.totalRecords,
      processedRecords: offset,
      totalBatches: input.totalChunks,
      completedBatches,
      currentBatch: input.totalChunks > 0 ? Math.min(input.totalChunks, completedBatches + 1) : 0,
      created,
      updated
    })
  )

  while (offset < input.totalRecords) {
    assertBrowserSocialImportCommitNotCancelled(input.jobId)
    const currentBatch = completedBatches + 1

    await reportProgressAndYield(metrics, () =>
      reportProgress({
        phase: 'checking',
        totalRecords: input.totalRecords,
        processedRecords: offset,
        totalBatches: input.totalChunks,
        completedBatches,
        currentBatch,
        created,
        updated
      })
    )

    const checkStartedAt = performance.now()
    const chunk = await readBrowserSocialImportStageChunk({
      stageId: input.stageResult.stageId,
      offset,
      limit: COMMIT_BATCH_SIZE,
      includeSourceRecords: input.includeSourceRecords
    })
    const deterministicDrafts = chunk.drafts.map(toDeterministicNodeImportDraft)
    metrics.lastCheckMs = performance.now() - checkStartedAt
    metrics.totalCheckMs += metrics.lastCheckMs

    await reportProgressAndYield(metrics, () =>
      reportProgress({
        phase: 'writing',
        totalRecords: chunk.totalRecords,
        processedRecords: offset,
        totalBatches: input.totalChunks,
        completedBatches,
        currentBatch,
        created,
        updated
      })
    )

    const writeStartedAt = performance.now()
    const operationStatsBefore = await input.getOperationStats?.()
    const batchResult = await input.importDrafts(deterministicDrafts)
    const operationStatsAfter = await input.getOperationStats?.()
    metrics.lastWriteMs = performance.now() - writeStartedAt
    metrics.totalWriteMs += metrics.lastWriteMs
    applyBatchResultMetrics(metrics, batchResult)
    applyOperationStatsDelta(metrics, operationStatsBefore ?? null, operationStatsAfter ?? null)

    created += batchResult.created
    updated += batchResult.updated
    batchResult.affectedSchemaIds?.forEach((schemaId) => affectedSchemaIds.add(schemaId))
    completedBatches += 1
    offset = chunk.nextOffset
    checkpointAccumulator.add(chunk.drafts, {
      processedRecords: offset,
      currentChunk: completedBatches
    })
    assertBrowserSocialImportCommitNotCancelled(input.jobId)

    reportProgress({
      phase: 'committed',
      totalRecords: chunk.totalRecords,
      processedRecords: offset,
      totalBatches: input.totalChunks,
      completedBatches,
      currentBatch,
      created,
      updated
    })

    if (chunk.done) break
  }

  if (offset !== input.totalRecords) {
    throw new Error(`Social import streamed ${offset} records but expected ${input.totalRecords}`)
  }

  if (input.rebuildIndexesForSchemas && affectedSchemaIds.size > 0) {
    await reportProgressAndYield(metrics, () =>
      reportProgress({
        phase: 'indexing',
        totalRecords: input.totalRecords,
        processedRecords: input.totalRecords,
        totalBatches: input.totalChunks,
        completedBatches,
        currentBatch: completedBatches,
        created,
        updated
      })
    )

    const indexStartedAt = performance.now()
    await input.rebuildIndexesForSchemas([...affectedSchemaIds])
    metrics.lastWriteMs = performance.now() - indexStartedAt
    metrics.totalWriteMs += metrics.lastWriteMs
  }

  await analyzeAfterCommit(input.analyzeDatabase, affectedSchemaIds.size)

  return { created, updated, batches: completedBatches }
}

/**
 * Refresh planner statistics so the first post-import load uses indexes
 * (exploration 0184). Best-effort: a failed ANALYZE must not fail the import.
 */
async function analyzeAfterCommit(
  analyzeDatabase: (() => Promise<void>) | undefined,
  affectedSchemaCount: number
): Promise<void> {
  if (!analyzeDatabase || affectedSchemaCount === 0) return
  try {
    await analyzeDatabase()
  } catch (err) {
    console.warn('[social-import] ANALYZE after commit failed', err)
  }
}

function assertBrowserSocialImportCommitNotCancelled(jobId: string): void {
  if (cancelledCommitJobIds.has(jobId)) {
    throw new BrowserSocialImportCommitCancelledError(jobId)
  }
}

function applyBatchResultMetrics(
  metrics: Omit<BrowserSocialImportCommitProgressMetrics, 'recordsPerSecond'>,
  result: {
    storage?: ApplyNodeBatchResult
    timings?: NodeBatchWriteTimings
  }
): void {
  metrics.lastPreflightMs = result.timings?.preflightMs ?? 0
  metrics.lastMaterializeMs = result.timings?.materializeMs ?? 0
  metrics.lastApplyMs = result.timings?.applyMs ?? 0
  metrics.lastNotifyMs = result.timings?.notifyMs ?? 0
  metrics.totalPreflightMs += metrics.lastPreflightMs
  metrics.totalMaterializeMs += metrics.lastMaterializeMs
  metrics.totalApplyMs += metrics.lastApplyMs
  metrics.totalNotifyMs += metrics.lastNotifyMs
  metrics.totalNodeRowsWritten += result.storage?.nodeRowsWritten ?? 0
  metrics.totalPropertyRowsWritten += result.storage?.propertyRowsWritten ?? 0
  metrics.totalChangeRowsWritten += result.storage?.changeRowsWritten ?? 0
  metrics.totalScalarRowsWritten += result.storage?.scalarRowsWritten ?? 0
  metrics.totalFtsRowsWritten += result.storage?.ftsRowsWritten ?? 0
}

function applyOperationStatsDelta(
  metrics: Omit<BrowserSocialImportCommitProgressMetrics, 'recordsPerSecond'>,
  before: SQLiteOperationStats | null,
  after: SQLiteOperationStats | null
): void {
  if (!before || !after) {
    metrics.lastSqlOperations = 0
    metrics.lastWorkerRequests = 0
    return
  }

  const delta = subtractOperationStats(after, before)
  metrics.lastSqlOperations = countSqlOperations(delta)
  metrics.lastWorkerRequests = Math.max(0, delta.workerRequestCount)
  metrics.totalSqlOperations += metrics.lastSqlOperations
  metrics.totalWorkerRequests += metrics.lastWorkerRequests
}

function subtractOperationStats(
  after: SQLiteOperationStats,
  before: SQLiteOperationStats
): SQLiteOperationStats {
  return {
    queryCount: Math.max(0, after.queryCount - before.queryCount),
    queryOneCount: Math.max(0, after.queryOneCount - before.queryOneCount),
    runCount: Math.max(0, after.runCount - before.runCount),
    execCount: Math.max(0, after.execCount - before.execCount),
    transactionCount: Math.max(0, after.transactionCount - before.transactionCount),
    transactionBatchCount: Math.max(0, after.transactionBatchCount - before.transactionBatchCount),
    transactionBatchOperationCount: Math.max(
      0,
      after.transactionBatchOperationCount - before.transactionBatchOperationCount
    ),
    workerRequestCount: Math.max(0, after.workerRequestCount - before.workerRequestCount)
  }
}

function countSqlOperations(stats: SQLiteOperationStats): number {
  return (
    stats.queryCount +
    stats.queryOneCount +
    stats.runCount +
    stats.execCount +
    stats.transactionBatchOperationCount
  )
}

function toDeterministicNodeImportDraft(
  draft: SocialImportNodeDraft
): DeterministicNodeImportDraft {
  return {
    id: draft.deterministicId,
    schemaId: draft.schemaId as DeterministicNodeImportDraft['schemaId'],
    properties: draft.properties
  }
}

async function reportProgressAndYield(
  metrics: Omit<BrowserSocialImportCommitProgressMetrics, 'recordsPerSecond'>,
  report: () => void
): Promise<void> {
  const progressStartedAt = performance.now()
  report()
  await yieldCommitProgress()
  metrics.lastProgressMs = performance.now() - progressStartedAt
  metrics.totalProgressMs += metrics.lastProgressMs
}

function commitProgressPhaseToJobPhase(
  progress: BrowserSocialImportCommitProgress
): SocialImportJobPhase {
  if (progress.phase === 'indexing') return 'indexing'
  if (progress.processedRecords >= progress.totalRecords) return 'finalizing'
  if (progress.phase === 'checking') return 'checking'
  return 'writing'
}

function getRecordsPerSecond(
  processedRecords: number,
  startedAt: number,
  updatedAt: number
): number {
  const elapsedSeconds = Math.max((updatedAt - startedAt) / 1000, 0.001)
  return processedRecords / elapsedSeconds
}

function yieldCommitProgress(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}
