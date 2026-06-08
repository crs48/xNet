import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import type { SocialImportNodeDraft } from '@xnetjs/social/import/browser'
import type { SocialImportJobPhase } from '@xnetjs/social/import/core'
import { createSocialImportJob, updateSocialImportJob } from '@xnetjs/social/import/core'
import {
  readBrowserSocialImportStageChunk,
  type BrowserSocialImportStageResult
} from './social-import-worker-client'

export type BrowserSocialImportCommitSummary = {
  created: number
  updated: number
  batches: number
}

export type BrowserSocialImportCommitProgressPhase = 'checking' | 'writing' | 'committed'

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
  stageResult: BrowserSocialImportStageResult
  includeSourceRecords: boolean
  importDrafts: (drafts: DeterministicNodeImportDraft[]) => Promise<{
    created: number
    updated: number
  }>
  onProgress?: (progress: BrowserSocialImportCommitProgress) => void
}

const COMMIT_BATCH_SIZE = 2500
const activeCommitJobs = new Map<string, BrowserSocialImportCommitJob>()

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
  const commitJob = createSocialImportJob({
    archiveName: input.stageResult.archive.filename,
    platform: input.stageResult.archive.adapter?.platform ?? 'unknown',
    totalRecords,
    totalChunks,
    warnings: input.stageResult.summary.totalWarnings
  })

  const promise = commitBrowserSocialImportStage({
    ...input,
    jobId: commitJob.jobId,
    totalRecords,
    totalChunks
  })
    .then((summary) => {
      updateSocialImportJob(commitJob.jobId, {
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
      updateSocialImportJob(commitJob.jobId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    })
    .finally(() => {
      activeCommitJobs.delete(commitJob.jobId)
    })

  const job = {
    jobId: commitJob.jobId,
    promise
  }
  activeCommitJobs.set(commitJob.jobId, job)
  return job
}

export function getActiveBrowserSocialImportCommitJobs(): BrowserSocialImportCommitJob[] {
  return [...activeCommitJobs.values()]
}

async function commitBrowserSocialImportStage(input: {
  stageResult: BrowserSocialImportStageResult
  includeSourceRecords: boolean
  importDrafts: StartBrowserSocialImportCommitJobInput['importDrafts']
  onProgress?: (progress: BrowserSocialImportCommitProgress) => void
  jobId: string
  totalRecords: number
  totalChunks: number
}): Promise<BrowserSocialImportCommitSummary> {
  let created = 0
  let updated = 0
  let offset = 0
  let completedBatches = 0
  const startedAt = Date.now()
  const metrics: Omit<BrowserSocialImportCommitProgressMetrics, 'recordsPerSecond'> = {
    lastCheckMs: 0,
    lastWriteMs: 0,
    lastProgressMs: 0,
    totalCheckMs: 0,
    totalWriteMs: 0,
    totalProgressMs: 0
  }

  const reportProgress = (
    progress: Omit<BrowserSocialImportCommitProgress, 'startedAt' | 'updatedAt' | 'metrics'>
  ) => {
    const updatedAt = Date.now()
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
      error: null
    })
    input.onProgress?.(commitProgress)
  }

  await reportProgressAndYield(metrics, () =>
    reportProgress({
      phase: 'checking',
      totalRecords: input.totalRecords,
      processedRecords: 0,
      totalBatches: input.totalChunks,
      completedBatches,
      currentBatch: input.totalChunks > 0 ? 1 : 0,
      created,
      updated
    })
  )

  while (offset < input.totalRecords) {
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
    completedBatches += 1
    offset = chunk.nextOffset

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

  return { created, updated, batches: completedBatches }
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
