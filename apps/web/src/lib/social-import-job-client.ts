import type { DeterministicNodeImportDraft, SchemaIRI } from '@xnetjs/data'
import type { SocialImportNodeDraft } from '@xnetjs/social/import/browser'
import type { SocialImportJobPhase } from '@xnetjs/social/import/core'
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
  lastProgressMs: number
  totalCheckMs: number
  totalWriteMs: number
  totalProgressMs: number
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
  }>
  rebuildIndexesForSchemas?: (schemaIds: readonly SchemaIRI[]) => Promise<void>
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
  rebuildIndexesForSchemas?: StartBrowserSocialImportCommitJobInput['rebuildIndexesForSchemas']
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
    lastProgressMs: 0,
    totalCheckMs: 0,
    totalWriteMs: 0,
    totalProgressMs: 0
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
    const batchResult = await input.importDrafts(deterministicDrafts)
    metrics.lastWriteMs = performance.now() - writeStartedAt
    metrics.totalWriteMs += metrics.lastWriteMs

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

  return { created, updated, batches: completedBatches }
}

function assertBrowserSocialImportCommitNotCancelled(jobId: string): void {
  if (cancelledCommitJobIds.has(jobId)) {
    throw new BrowserSocialImportCommitCancelledError(jobId)
  }
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
