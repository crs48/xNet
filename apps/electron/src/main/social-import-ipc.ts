import type {
  ElectronStagedSocialImport,
  SocialImportArchivePreview,
  SocialImportStageRequest,
  SocialImportStageResult,
  SocialImportCommitJobRequest,
  SocialImportCommitJobSnapshot
} from '../shared/social-import'
/**
 * Main-process IPC for local social graph archive imports.
 */

import type {
  ApplyNodeBatchResult,
  DeterministicNodeImportDraft,
  NodeBatchWriteTimings
} from '@xnetjs/data'
import type {
  SocialImportArchivePreview as SharedSocialImportArchivePreview,
  SocialImportNodeDraft as SharedSocialImportNodeDraft,
  SocialImportJobCheckpointSnapshot,
  SocialImportNodeDraftStreamResult,
  SocialImportJobMetrics,
  SocialImportJobPhase
} from '@xnetjs/social/import/core'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import { extname } from 'node:path'
import {
  createSocialImportJobCheckpointAccumulator,
  resolveSocialImportCommitPolicy,
  shouldCommitSourceRecordNodes,
  toNodeBatchWritePolicy
} from '@xnetjs/social/import/core'
import {
  createSocialArchivePreview,
  openSocialImportSource,
  streamSocialImportNodeDrafts
} from '@xnetjs/social/import/node'
import { builtInSocialImportAdapters } from '@xnetjs/social/importers'
import { dialog, ipcMain } from 'electron'
import {
  loadImportJournals,
  saveImportJournal,
  retainedJournalSource,
  type ImportJournal
} from '../storage/import-journal'
import { retainImportSource } from '../storage/import-sources'
import { sendDataProcessRequest } from './data-process-manager'
import { freezeLibrary, thawLibrary, refreshLibrarySources } from './library-ipc'
import { dataPath } from './profile'
import { recoveryIsBusy } from './recovery'

export type {
  ElectronStagedSocialImport,
  SocialImportArchivePreview,
  SocialImportNodeDraft,
  SocialImportStageRequest,
  SocialImportStageResult,
  SocialImportCommitJobRequest,
  SocialImportCommitJobSummary,
  SocialImportCommitJobSnapshot
} from '../shared/social-import'

const adapters = builtInSocialImportAdapters
const approvedArchivePaths = new Set<string>()
const stagedResults = new Map<string, ElectronStagedSocialImport>()
const commitJobs = new Map<string, SocialImportCommitJobSnapshot>()
const journals = new Map<string, ImportJournal>()
let journalsLoaded = false
const cancelledCommitJobIds = new Set<string>()

function ensureCommitJobsLoaded(): void {
  if (journalsLoaded) return
  const saved = loadImportJournals(dataPath)
  for (const journal of saved) {
    journals.set(journal.job.jobId, journal)
    commitJobs.set(journal.job.jobId, journal.job)
  }
  journalsLoaded = true
}
let queuedTestArchivePath: string | null = null
const COMMIT_BATCH_SIZE = 2500

export function hasActiveSocialImports(): boolean {
  return [...commitJobs.values()].some((job) => job.status === 'queued' || job.status === 'running')
}

export function setupSocialImportIPC(getWindow: () => BrowserWindow | null): void {
  // The preload obtains this path from a disk-backed File selected or dropped
  // by the user. Renderer-created File objects have no filesystem path.
  ipcMain.handle('xnet:social-import:previewSelectedFile', async (_event, archivePath: string) => {
    if (
      typeof archivePath !== 'string' ||
      !['.zip', '.json'].includes(extname(archivePath).toLowerCase())
    )
      throw new Error('Choose a ZIP or JSON archive.')
    const preview = await createArchivePreview(archivePath)
    approvedArchivePaths.add(archivePath)
    return preview
  })
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
    'xnet:social-import:resumeCommitJob',
    async (
      _event,
      request: {
        jobId: string
        authorDID: string
        signingKey: number[]
      }
    ) => {
      ensureCommitJobsLoaded()
      if (recoveryIsBusy())
        throw new Error('Wait for workspace recovery to finish before resuming.')
      if (hasActiveSocialImports()) throw new Error('Finish or pause the current import first.')
      const journal = journals.get(request.jobId)
      const job = commitJobs.get(request.jobId)
      if (!journal || !job || job.status === 'completed')
        throw new Error('No unfinished import found.')
      if (request.authorDID !== journal.authorDID || request.signingKey.length !== 32)
        throw new Error('Resume with the same workspace identity that started this import.')
      const adapter = journal.stage.archive.adapter
      if (
        !adapters.some(
          (candidate) => candidate.id === adapter?.id && candidate.version === adapter.version
        )
      )
        throw new Error(
          'This importer changed. Review the retained source as a new import before continuing.'
        )
      const stagedResult = {
        ...journal.stage,
        archivePath: retainedJournalSource(dataPath, journal)
      }
      const next = updateCommitJob(
        job.jobId,
        { status: 'queued', error: null, completedAt: null },
        getWindow
      )
      void runCommitJob({
        jobId: job.jobId,
        stagedResult,
        request: { ...request, stageId: '', includeSourceRecords: journal.includeSourceRecords },
        totalRecords: job.totalRecords ?? 0,
        getWindow,
        resume: job
      })
      return next
    }
  )

  ipcMain.handle(
    'xnet:social-import:listCommitJobs',
    async (): Promise<SocialImportCommitJobSnapshot[]> => listCommitJobs()
  )

  ipcMain.handle(
    'xnet:social-import:getCommitJob',
    async (_event, jobId: string): Promise<SocialImportCommitJobSnapshot | null> => {
      ensureCommitJobsLoaded()
      return commitJobs.get(jobId) ?? null
    }
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
  filters: [{ name: 'Social exports, stars, and garden snapshots', extensions: ['zip', 'json'] }]
}

async function createArchivePreview(archivePath: string): Promise<SocialImportArchivePreview> {
  const { manifest } = await openSocialImportSource(archivePath)
  return requireArchivePath(await createSocialArchivePreview({ adapters, manifest }), archivePath)
}

async function stageArchive(request: SocialImportStageRequest): Promise<SocialImportStageResult> {
  const { manifest, readJsonEntry, readTextEntry } = await openSocialImportSource(
    request.archivePath
  )
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
    sourceRecordMode: result.sourceRecordMode,
    sidecarSourceRecordCount: result.sidecarSourceRecordCount,
    canonicalRecordCount: result.canonicalRecordCount
  }
}

function startCommitJob(
  request: SocialImportCommitJobRequest,
  getWindow: () => BrowserWindow | null
): SocialImportCommitJobSnapshot {
  ensureCommitJobsLoaded()
  if (recoveryIsBusy()) throw new Error('Wait for workspace recovery to finish before importing.')
  if (hasActiveSocialImports()) throw new Error('Finish or pause the current import first.')
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
  ensureCommitJobsLoaded()
  return [...commitJobs.values()].sort((a, b) => b.updatedAt - a.updatedAt)
}

function cancelCommitJob(
  jobId: string,
  getWindow: () => BrowserWindow | null
): SocialImportCommitJobSnapshot | null {
  const job = commitJobs.get(jobId)
  if (!job || !isActiveJob(job)) return job ?? null

  cancelledCommitJobIds.add(jobId)
  // The current batch may still be writing. Keep quit/recovery blocked until it acknowledges.
  publishCommitJob(job, getWindow)
  return job
}

async function runCommitJob(input: {
  jobId: string
  stagedResult: ElectronStagedSocialImport
  request: SocialImportCommitJobRequest
  totalRecords: number
  getWindow: () => BrowserWindow | null
  resume?: SocialImportCommitJobSnapshot
}): Promise<void> {
  const startedAt = Date.now()
  const totalRecords = input.totalRecords
  const totalChunks = Math.ceil(totalRecords / COMMIT_BATCH_SIZE)
  const commitPolicy = resolveSocialImportCommitPolicy({
    includeSourceRecords: input.request.includeSourceRecords
  })
  const commitSourceRecordNodes = shouldCommitSourceRecordNodes(commitPolicy)
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
  let created = input.resume?.created ?? 0
  let updated = input.resume?.updated ?? 0
  let processedRecords = input.resume?.processedRecords ?? 0
  let currentChunk = input.resume?.currentChunk ?? 0
  const resumeCursor = processedRecords
  let streamedRecords = 0
  let streamedChunks = 0
  let draftBatch: SharedSocialImportNodeDraft[] = []
  const checkpointAccumulator = createSocialImportJobCheckpointAccumulator()

  try {
    await freezeLibrary()
    updateCommitJob(input.jobId, { status: 'running', phase: 'checking' }, input.getWindow)

    const expectedHash = input.stagedResult.manifest.archiveHash
    if (!expectedHash) throw new Error('Import preview has no source fingerprint. Review it again.')
    const retainedPath = await retainImportSource({
      dataPath,
      sourcePath: input.stagedResult.archivePath,
      expectedHash
    })
    const { manifest, readJsonEntry, readTextEntry } = await openSocialImportSource(retainedPath)
    if (manifest.archiveHash !== expectedHash)
      throw new Error('Retained archive fingerprint does not match the preview.')
    const journal: ImportJournal = {
      version: 1,
      job: commitJobs.get(input.jobId)!,
      stage: input.stagedResult,
      authorDID: input.request.authorDID,
      sourceHash: expectedHash,
      sourceExtension: extname(retainedPath) as '.zip' | '.json',
      includeSourceRecords: input.request.includeSourceRecords
    }
    saveImportJournal(dataPath, journal)
    journals.set(input.jobId, journal)

    const flushDraftBatch = async (): Promise<void> => {
      if (draftBatch.length === 0) return

      assertCommitJobNotCancelled(input.jobId)
      const draftChunk = draftBatch
      draftBatch = []
      streamedRecords += draftChunk.length
      streamedChunks += 1
      if (streamedRecords <= resumeCursor) {
        checkpointAccumulator.add(draftChunk, {
          processedRecords: streamedRecords,
          currentChunk: streamedChunks
        })
        return
      }
      if (streamedRecords - draftChunk.length < resumeCursor)
        throw new Error(
          'Import cursor does not align with the reviewed source. No batch was skipped.'
        )
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
          signingKey: input.request.signingKey,
          policy: toNodeBatchWritePolicy(commitPolicy)
        },
        10 * 60 * 1000
      )) as {
        created: number
        updated: number
        storage?: ApplyNodeBatchResult
        timings?: NodeBatchWriteTimings
      }
      metrics.lastWriteMs = performance.now() - writeStartedAt
      metrics.totalWriteMs += metrics.lastWriteMs
      applyBatchResultMetrics(metrics, batchResult)

      created += batchResult.created
      updated += batchResult.updated
      processedRecords += draftChunk.length
      currentChunk = nextChunk
      const checkpointSnapshot = checkpointAccumulator.add(draftChunk, {
        processedRecords,
        currentChunk
      })
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
      includeSourceRecords: commitSourceRecordNodes,
      sourceRecordMode: commitPolicy.sourceRecordMode
    })) {
      assertCommitJobNotCancelled(input.jobId)
      draftBatch.push(draft)
      if (draftBatch.length >= COMMIT_BATCH_SIZE) {
        await flushDraftBatch()
      }
    }

    await flushDraftBatch()
    await thawLibrary()
    await refreshLibrarySources()

    if (processedRecords !== totalRecords || streamedRecords !== totalRecords) {
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
    const failed: Partial<SocialImportCommitJobSnapshot> = {
      status: cancelled ? 'paused' : 'failed',
      completedAt: Date.now(),
      error: cancelled
        ? 'Paused after the last saved batch.'
        : error instanceof Error
          ? error.message
          : String(error)
    }
    try {
      updateCommitJob(input.jobId, failed, input.getWindow)
    } catch (journalError) {
      const current = commitJobs.get(input.jobId)!
      const next = {
        ...current,
        ...failed,
        error: `Import stopped; progress could not be saved: ${String(journalError)}`
      }
      commitJobs.set(input.jobId, next)
      publishCommitJob(next, input.getWindow)
    }
  } finally {
    await thawLibrary()
    cancelledCommitJobIds.delete(input.jobId)
  }
}

function applyBatchResultMetrics(
  metrics: Omit<SocialImportJobMetrics, 'recordsPerSecond'>,
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
  const journal = journals.get(jobId)
  if (journal) {
    const saved = { ...journal, job: next }
    saveImportJournal(dataPath, saved)
    journals.set(jobId, saved)
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
