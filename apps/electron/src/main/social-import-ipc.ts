/**
 * Main-process IPC for local social graph archive imports.
 */

import type { DeterministicNodeImportDraft } from '@xnetjs/data'
import type {
  SocialImportArchivePreview as SharedSocialImportArchivePreview,
  SocialImportNodeDraft as SharedSocialImportNodeDraft,
  SocialImportStageResult as SharedSocialImportStageResult,
  SocialImportJobMetrics,
  SocialImportJobPhase,
  SocialImportJobProgress
} from '@xnetjs/social/import/core'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import {
  createSocialArchivePreview,
  createZipJsonEntryReader,
  createZipTextEntryReader,
  readZipArchiveManifest,
  stageSocialArchive
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

export type SocialImportStageResult = Omit<SharedSocialImportStageResult, 'archive' | 'records'> & {
  archive: SocialImportArchivePreview
  stageId: string
  recordCount: number
  sourceRecordCount: number
  canonicalRecordCount: number
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

type ElectronStagedSocialImport = Omit<SharedSocialImportStageResult, 'archive'> & {
  archive: SocialImportArchivePreview
  commitDraftsWithSourceRecords: SharedSocialImportNodeDraft[] | null
  commitDraftsWithoutSourceRecords: SharedSocialImportNodeDraft[] | null
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

  const result = await stageSocialArchive({
    manifest,
    adapters,
    readJsonEntry,
    readTextEntry,
    buckets: request.buckets,
    includeSensitive: request.includeSensitive
  })
  const archive = requireArchivePath(result.archive, request.archivePath)
  const stageId = createStageId()
  stagedResults.set(stageId, {
    ...result,
    archive,
    commitDraftsWithSourceRecords: null,
    commitDraftsWithoutSourceRecords: null
  })
  const sourceRecordCount = result.records.filter(
    (record) => record.kind === 'source-record'
  ).length

  return {
    archive,
    archiveNode: result.archiveNode,
    importRunNode: result.importRunNode,
    summary: result.summary,
    telemetry: result.telemetry,
    stageDurationMs: result.stageDurationMs,
    stageId,
    recordCount: result.records.length,
    sourceRecordCount,
    canonicalRecordCount: result.records.length - sourceRecordCount
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

  const drafts = getCommitDrafts(stagedResult, request.includeSourceRecords)
  const now = Date.now()
  const job: SocialImportCommitJobSnapshot = {
    jobId: createCommitJobId(),
    status: 'queued',
    phase: 'checking',
    platform: stagedResult.archive.adapter?.platform ?? 'unknown',
    archiveName: stagedResult.archive.filename,
    totalRecords: drafts.length,
    processedRecords: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    warnings: stagedResult.summary.totalWarnings,
    currentBucketId: null,
    currentChunk: 0,
    totalChunks: Math.ceil(drafts.length / COMMIT_BATCH_SIZE),
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    error: null,
    metrics: null
  }

  commitJobs.set(job.jobId, job)
  publishCommitJob(job, getWindow)
  void runCommitJob({ jobId: job.jobId, drafts, request, getWindow })
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
  drafts: SharedSocialImportNodeDraft[]
  request: SocialImportCommitJobRequest
  getWindow: () => BrowserWindow | null
}): Promise<void> {
  const startedAt = Date.now()
  const totalRecords = input.drafts.length
  const totalChunks = Math.ceil(totalRecords / COMMIT_BATCH_SIZE)
  const metrics: Omit<SocialImportJobMetrics, 'recordsPerSecond'> = {
    lastCheckMs: 0,
    lastWriteMs: 0,
    lastProgressMs: 0,
    totalCheckMs: 0,
    totalWriteMs: 0,
    totalProgressMs: 0
  }
  let created = 0
  let updated = 0

  try {
    updateCommitJob(input.jobId, { status: 'running', phase: 'checking' }, input.getWindow)

    for (const [chunkIndex, draftChunk] of chunkItems(input.drafts, COMMIT_BATCH_SIZE).entries()) {
      assertCommitJobNotCancelled(input.jobId)
      const processedBeforeChunk = Math.min(chunkIndex * COMMIT_BATCH_SIZE, totalRecords)
      const currentChunk = chunkIndex + 1

      const checkStartedAt = performance.now()
      const deterministicDrafts = draftChunk.map(toDeterministicNodeImportDraft)
      metrics.lastCheckMs = performance.now() - checkStartedAt
      metrics.totalCheckMs += metrics.lastCheckMs

      reportCommitJobProgress({
        jobId: input.jobId,
        phase: 'writing',
        totalRecords,
        processedRecords: processedBeforeChunk,
        created,
        updated,
        currentChunk: chunkIndex,
        totalChunks,
        startedAt,
        metrics,
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
      assertCommitJobNotCancelled(input.jobId)

      reportCommitJobProgress({
        jobId: input.jobId,
        phase: currentChunk >= totalChunks ? 'finalizing' : 'checking',
        totalRecords,
        processedRecords: processedBeforeChunk + draftChunk.length,
        created,
        updated,
        currentChunk,
        totalChunks,
        startedAt,
        metrics,
        getWindow: input.getWindow
      })
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
      metrics: {
        ...input.metrics,
        recordsPerSecond: input.processedRecords / elapsedSeconds
      }
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

function getCommitDrafts(
  stagedResult: ElectronStagedSocialImport,
  includeSourceRecords: boolean
): SharedSocialImportNodeDraft[] {
  if (includeSourceRecords) {
    stagedResult.commitDraftsWithSourceRecords ??= [
      stagedResult.archiveNode,
      stagedResult.importRunNode,
      ...stagedResult.records
    ]
    return stagedResult.commitDraftsWithSourceRecords
  }

  stagedResult.commitDraftsWithoutSourceRecords ??= [
    stagedResult.archiveNode,
    stagedResult.importRunNode,
    ...stagedResult.records.filter((record) => record.kind !== 'source-record')
  ]
  return stagedResult.commitDraftsWithoutSourceRecords
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

function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
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
