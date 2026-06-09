/**
 * Main-process IPC for local social graph archive imports.
 */

import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import type {
  ArchiveManifest,
  SocialImportArchivePreview as SharedSocialImportArchivePreview,
  SocialImportNodeDraft as SharedSocialImportNodeDraft,
  SocialImportJobCheckpointSnapshot,
  SocialImportNodeDraftStreamResult,
  SocialImportJobMetrics,
  SocialImportJobPhase,
  SocialImportJobProgress
} from '@xnetjs/social/import/core'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import { createSocialImportJobCheckpointAccumulator } from '@xnetjs/social/import/core'
import {
  createSocialArchivePreview,
  createZipJsonEntryReader,
  createZipTextEntryReader,
  readZipArchiveManifest,
  streamSocialImportNodeDrafts
} from '@xnetjs/social/import/node'
import { builtInSocialImportAdapters } from '@xnetjs/social/importers'
import { dialog, ipcMain } from 'electron'
import { sendDataProcessRequest } from './data-process-manager'

export type SocialImportArchivePreview = Omit<SharedSocialImportArchivePreview, 'archivePath'> & {
  archivePath: string
}

export type SocialImportNodeDraft = SharedSocialImportNodeDraft

export type SocialImportStageRequest = {
  archivePath: string
  buckets?: string[]
  includeSensitive?: boolean
}

export type SocialImportStageResult = Omit<SocialImportNodeDraftStreamResult, 'archive'> & {
  archive: SocialImportArchivePreview
  stageId: string
}

export type SocialImportCommitJobRequest = {
  stageId: string
  includeSourceRecords: boolean
  authorDID: string
  signingKey: number[]
}

export type SocialImportCommitJobSummary = {
  created: number
  updated: number
  batches: number
}

export type SocialImportCommitJobSnapshot = SocialImportJobProgress & {
  summary?: SocialImportCommitJobSummary
}

const adapters = builtInSocialImportAdapters
const approvedArchivePaths = new Set<string>()
const stagedResults = new Map<string, ElectronStagedSocialImport>()
const commitJobs = new Map<string, SocialImportCommitJobSnapshot>()
const cancelledCommitJobIds = new Set<string>()
let queuedTestArchivePath: string | null = null
const COMMIT_BATCH_SIZE = 2500

type ElectronStagedSocialImport = Omit<SocialImportNodeDraftStreamResult, 'archive'> & {
  archive: SocialImportArchivePreview
  archivePath: string
  manifest: ArchiveManifest
  stageRequest: SocialImportStageRequest
  importedAt: string
}

export function setupSocialImportIPC(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('xnet:social-import:pickArchive', async () => {
    if (process.env.XNET_TEST_BYPASS === 'true' && queuedTestArchivePath) {
      const archivePath = queuedTestArchivePath
      queuedTestArchivePath = null
      approvedArchivePaths.add(archivePath)
      return createArchivePreview(archivePath)
    }

    const window = getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, archiveDialogOptions)
      : await dialog.showOpenDialog(archiveDialogOptions)

    if (result.canceled || result.filePaths.length === 0) return null

    const archivePath = result.filePaths[0]
    approvedArchivePaths.add(archivePath)
    return createArchivePreview(archivePath)
  })

  ipcMain.handle(
    'xnet:social-import:queueArchiveForTest',
    async (_event, archivePath: string): Promise<SocialImportArchivePreview> => {
      if (process.env.XNET_TEST_BYPASS !== 'true') {
        throw new Error('Social import test queue is only available in test bypass mode')
      }

      queuedTestArchivePath = archivePath
      approvedArchivePaths.add(archivePath)
      return createArchivePreview(archivePath)
    }
  )

  ipcMain.handle(
    'xnet:social-import:stageArchive',
    async (_event, request: SocialImportStageRequest): Promise<SocialImportStageResult> => {
      if (!approvedArchivePaths.has(request.archivePath)) {
        throw new Error('Archive was not selected through the social import picker')
      }

      return stageArchive(request)
    }
  )

  ipcMain.handle(
    'xnet:social-import:startCommitJob',
    async (_event, request: SocialImportCommitJobRequest): Promise<SocialImportCommitJobSnapshot> =>
      startCommitJob(request, getWindow)
  )

  ipcMain.handle(
    'xnet:social-import:listCommitJobs',
    async (): Promise<SocialImportCommitJobSnapshot[]> => listCommitJobs()
  )

  ipcMain.handle(
    'xnet:social-import:getCommitJob',
    async (_event, jobId: string): Promise<SocialImportCommitJobSnapshot | null> =>
      commitJobs.get(jobId) ?? null
  )

  ipcMain.handle(
    'xnet:social-import:cancelCommitJob',
    async (_event, jobId: string): Promise<SocialImportCommitJobSnapshot | null> =>
      cancelCommitJob(jobId, getWindow)
  )
}

const archiveDialogOptions: OpenDialogOptions = {
  title: 'Select social archive',
  properties: ['openFile'],
  filters: [{ name: 'ZIP archives', extensions: ['zip'] }]
}

async function createArchivePreview(archivePath: string): Promise<SocialImportArchivePreview> {
  const manifest = await readZipArchiveManifest(archivePath, { hashEntries: false })
  return requireArchivePath(await createSocialArchivePreview({ adapters, manifest }), archivePath)
}

async function stageArchive(request: SocialImportStageRequest): Promise<SocialImportStageResult> {
  const manifest = await readZipArchiveManifest(request.archivePath, { hashEntries: false })
  const readJsonEntry = await createZipJsonEntryReader(request.archivePath)
  const readTextEntry = await createZipTextEntryReader(request.archivePath)
  const importedAt = new Date().toISOString()

  const streamResults: SocialImportNodeDraftStreamResult[] = []
  for await (const draft of streamSocialImportNodeDrafts({
    manifest,
    adapters,
    readJsonEntry,
    readTextEntry,
    buckets: request.buckets,
    includeSensitive: request.includeSensitive,
    importedAt,
    includeSourceRecords: true,
    onComplete: (streamResult) => {
      streamResults.push(streamResult)
    }
  })) {
    void draft
  }
  const result = requireStreamResult(streamResults)
  const archive = requireArchivePath(result.archive, request.archivePath)
  const stageId = createStageId()
  stagedResults.set(stageId, {
    ...result,
    archive,
    archivePath: request.archivePath,
    manifest,
    stageRequest: request,
    importedAt
  })

  return {
    archive,
    archiveNode: result.archiveNode,
    importRunNode: result.importRunNode,
    summary: result.summary,
    telemetry: result.telemetry,
    stageDurationMs: result.stageDurationMs,
    stageId,
    recordCount: result.recordCount,
    sourceRecordCount: result.sourceRecordCount,
    canonicalRecordCount: result.canonicalRecordCount
  }
}

function startCommitJob(
  request: SocialImportCommitJobRequest,
  getWindow: () => BrowserWindow | null
): SocialImportCommitJobSnapshot {
  const stagedResult = stagedResults.get(request.stageId)
  if (!stagedResult) {
    throw new Error(`No staged social import found for ${request.stageId}`)
  }
  if (!request.authorDID || request.signingKey.length === 0) {
    throw new Error('Missing import signing identity')
  }

  const totalRecords = getCommitRecordCount(stagedResult, request.includeSourceRecords)
  const now = Date.now()
  const job: SocialImportCommitJobSnapshot = {
    jobId: createCommitJobId(),
    status: 'queued',
    phase: 'checking',
    platform: stagedResult.archive.adapter?.platform ?? 'unknown',
    archiveName: stagedResult.archive.filename,
    totalRecords,
    processedRecords: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    warnings: stagedResult.summary.totalWarnings,
    currentBucketId: null,
    currentChunk: 0,
    totalChunks: Math.ceil(totalRecords / COMMIT_BATCH_SIZE),
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    error: null,
    metrics: null,
    checkpoint: null,
    bucketCheckpoints: []
  }

  commitJobs.set(job.jobId, job)
  publishCommitJob(job, getWindow)
  void runCommitJob({ jobId: job.jobId, stagedResult, request, totalRecords, getWindow })
  return job
}

function listCommitJobs(): SocialImportCommitJobSnapshot[] {
  return [...commitJobs.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

function cancelCommitJob(
  jobId: string,
  getWindow: () => BrowserWindow | null
): SocialImportCommitJobSnapshot | null {
  const job = commitJobs.get(jobId)
  if (!job || !isActiveJob(job)) return job ?? null

  cancelledCommitJobIds.add(jobId)
  const next = updateCommitJob(jobId, { status: 'cancelled', updatedAt: Date.now() }, getWindow)
  return next
}

async function runCommitJob(input: {
  jobId: string
  stagedResult: ElectronStagedSocialImport
  request: SocialImportCommitJobRequest
  totalRecords: number
  getWindow: () => BrowserWindow | null
}): Promise<void> {
  const startedAt = Date.now()
  const totalRecords = input.totalRecords
  const totalChunks = Math.ceil(totalRecords / COMMIT_BATCH_SIZE)
  const metrics: Omit<SocialImportJobMetrics, 'recordsPerSecond'> = {
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
    totalFtsRowsWritten: 0
  }
  let created = 0
  let updated = 0
  let processedRecords = 0
  let currentChunk = 0
  let draftBatch: SharedSocialImportNodeDraft[] = []
  const checkpointAccumulator = createSocialImportJobCheckpointAccumulator()

  try {
    updateCommitJob(input.jobId, { status: 'running', phase: 'checking' }, input.getWindow)

    const readJsonEntry = await createZipJsonEntryReader(input.stagedResult.archivePath)
    const readTextEntry = await createZipTextEntryReader(input.stagedResult.archivePath)

    const flushDraftBatch = async (): Promise<void> => {
      if (draftBatch.length === 0) return

      assertCommitJobNotCancelled(input.jobId)
      const draftChunk = draftBatch
      draftBatch = []
      const nextChunk = currentChunk + 1

      const checkStartedAt = performance.now()
      const deterministicDrafts = draftChunk.map(toDeterministicNodeImportDraft)
      metrics.lastCheckMs = performance.now() - checkStartedAt
      metrics.totalCheckMs += metrics.lastCheckMs

      reportCommitJobProgress({
        jobId: input.jobId,
        phase: 'writing',
        totalRecords,
        processedRecords,
        created,
        updated,
        currentChunk,
        totalChunks,
        startedAt,
        metrics,
        checkpointSnapshot: checkpointAccumulator.snapshot(),
        getWindow: input.getWindow
      })

      const writeStartedAt = performance.now()
      const batchResult = (await sendDataProcessRequest(
        'nodes:importDeterministicNodes',
        {
          drafts: deterministicDrafts,
          authorDID: input.request.authorDID,
          signingKey: input.request.signingKey
        },
        10 * 60 * 1000
      )) as { created: number; updated: number }
      metrics.lastWriteMs = performance.now() - writeStartedAt
      metrics.totalWriteMs += metrics.lastWriteMs

      created += batchResult.created
      updated += batchResult.updated
      processedRecords += draftChunk.length
      currentChunk = nextChunk
      const checkpointSnapshot = checkpointAccumulator.add(draftChunk, {
        processedRecords,
        currentChunk
      })
      assertCommitJobNotCancelled(input.jobId)

      reportCommitJobProgress({
        jobId: input.jobId,
        phase: currentChunk >= totalChunks ? 'finalizing' : 'checking',
        totalRecords,
        processedRecords,
        created,
        updated,
        currentChunk,
        totalChunks,
        startedAt,
        metrics,
        checkpointSnapshot,
        getWindow: input.getWindow
      })
    }

    for await (const draft of streamSocialImportNodeDrafts({
      manifest: input.stagedResult.manifest,
      adapters,
      readJsonEntry,
      readTextEntry,
      buckets: input.stagedResult.stageRequest.buckets,
      includeSensitive: input.stagedResult.stageRequest.includeSensitive,
      importedAt: input.stagedResult.importedAt,
      includeSourceRecords: input.request.includeSourceRecords
    })) {
      assertCommitJobNotCancelled(input.jobId)
      draftBatch.push(draft)
      if (draftBatch.length >= COMMIT_BATCH_SIZE) {
        await flushDraftBatch()
      }
    }

    await flushDraftBatch()

    if (processedRecords !== totalRecords) {
      throw new Error(
        `Social import streamed ${processedRecords} records but expected ${totalRecords}`
      )
    }

    updateCommitJob(
      input.jobId,
      {
        status: 'completed',
        phase: 'finalizing',
        processedRecords: totalRecords,
        created,
        updated,
        currentChunk: totalChunks,
        totalChunks,
        completedAt: Date.now(),
        error: null,
        summary: { created, updated, batches: totalChunks }
      },
      input.getWindow
    )
  } catch (error) {
    const cancelled = error instanceof SocialImportCommitCancelledError
    updateCommitJob(
      input.jobId,
      {
        status: cancelled ? 'cancelled' : 'failed',
        completedAt: Date.now(),
        error: cancelled ? null : error instanceof Error ? error.message : String(error)
      },
      input.getWindow
    )
  } finally {
    cancelledCommitJobIds.delete(input.jobId)
  }
}

function reportCommitJobProgress(input: {
  jobId: string
  phase: SocialImportJobPhase
  totalRecords: number
  processedRecords: number
  created: number
  updated: number
  currentChunk: number
  totalChunks: number
  startedAt: number
  metrics: Omit<SocialImportJobMetrics, 'recordsPerSecond'>
  checkpointSnapshot: SocialImportJobCheckpointSnapshot
  getWindow: () => BrowserWindow | null
}): void {
  const progressStartedAt = performance.now()
  const updatedAt = Date.now()
  const elapsedSeconds = Math.max((updatedAt - input.startedAt) / 1000, 0.001)
  updateCommitJob(
    input.jobId,
    {
      status: 'running',
      phase: input.phase,
      totalRecords: input.totalRecords,
      processedRecords: input.processedRecords,
      created: input.created,
      updated: input.updated,
      currentChunk: input.currentChunk,
      totalChunks: input.totalChunks,
      startedAt: input.startedAt,
      updatedAt,
      currentBucketId: input.checkpointSnapshot.checkpoint?.bucketId ?? null,
      metrics: {
        ...input.metrics,
        recordsPerSecond: input.processedRecords / elapsedSeconds
      },
      checkpoint: input.checkpointSnapshot.checkpoint,
      bucketCheckpoints: input.checkpointSnapshot.bucketCheckpoints
    },
    input.getWindow
  )
  input.metrics.lastProgressMs = performance.now() - progressStartedAt
  input.metrics.totalProgressMs += input.metrics.lastProgressMs
}

function updateCommitJob(
  jobId: string,
  patch: Partial<SocialImportCommitJobSnapshot>,
  getWindow: () => BrowserWindow | null
): SocialImportCommitJobSnapshot {
  const current = commitJobs.get(jobId)
  if (!current) throw new Error(`Unknown social import job ${jobId}`)

  const next = {
    ...current,
    ...patch,
    updatedAt: patch.updatedAt ?? Date.now()
  }
  commitJobs.set(jobId, next)
  publishCommitJob(next, getWindow)
  return next
}

function publishCommitJob(
  job: SocialImportCommitJobSnapshot,
  getWindow: () => BrowserWindow | null
): void {
  const window = getWindow()
  if (window && !window.isDestroyed()) {
    window.webContents.send('xnet:social-import:job', job)
  }
}

function getCommitRecordCount(
  stagedResult: ElectronStagedSocialImport,
  includeSourceRecords: boolean
): number {
  return 2 + (includeSourceRecords ? stagedResult.recordCount : stagedResult.canonicalRecordCount)
}

function requireStreamResult(
  results: readonly SocialImportNodeDraftStreamResult[]
): SocialImportNodeDraftStreamResult {
  const [result] = results
  if (!result) throw new Error('Social import stream did not complete.')
  return result
}

function toDeterministicNodeImportDraft(
  draft: SharedSocialImportNodeDraft
): DeterministicNodeImportDraft {
  return {
    id: draft.deterministicId,
    schemaId: draft.schemaId as DeterministicNodeImportDraft['schemaId'],
    properties: draft.properties
  }
}

function assertCommitJobNotCancelled(jobId: string): void {
  if (cancelledCommitJobIds.has(jobId)) {
    throw new SocialImportCommitCancelledError(jobId)
  }
}

function isActiveJob(job: SocialImportCommitJobSnapshot): boolean {
  return job.status === 'queued' || job.status === 'running'
}

class SocialImportCommitCancelledError extends Error {
  constructor(jobId: string) {
    super(`Social import commit ${jobId} was cancelled`)
    this.name = 'SocialImportCommitCancelledError'
  }
}

function createStageId(): string {
  return `electron-social-stage:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function createCommitJobId(): string {
  return `electron-social-import:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function requireArchivePath(
  preview: SharedSocialImportArchivePreview,
  fallbackArchivePath: string
): SocialImportArchivePreview {
  return {
    ...preview,
    archivePath: preview.archivePath ?? fallbackArchivePath
  }
}
