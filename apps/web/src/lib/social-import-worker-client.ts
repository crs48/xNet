import type {
  SocialImportWorkerExecutionMode,
  SocialImportWorkerPreviewPayload,
  SocialImportWorkerRequest,
  SocialImportWorkerResponse,
  SocialImportWorkerStageChunkPayload,
  SocialImportWorkerStagePayload,
  SocialImportWorkerTimings
} from './social-import-worker-protocol'
import type {
  ArchiveManifest,
  SocialImportNodeDraft,
  SocialImportNodeDraftStreamResult
} from '@xnetjs/social/import/browser'
import {
  createBrowserZipJsonEntryReader,
  createBrowserZipTextEntryReader,
  createSocialArchivePreview,
  readBrowserZipArchiveManifest,
  streamSocialImportNodeDrafts
} from '@xnetjs/social/import/browser'
import { builtInSocialImportAdapters } from '@xnetjs/social/importers'

type WithoutRequestId<T> = T extends { requestId: string } ? Omit<T, 'requestId'> : never
type SocialImportWorkerRequestInput = WithoutRequestId<SocialImportWorkerRequest>
type TimedWorkerResult<T> = {
  result: T
  timings: SocialImportWorkerTimings
}

export type BrowserSocialImportPreviewResult = SocialImportWorkerPreviewPayload & {
  executionMode: SocialImportWorkerExecutionMode
  workerTimings?: SocialImportWorkerTimings
}

export type BrowserSocialImportStageInput = {
  file: File
  manifest: ArchiveManifest
  buckets: string[]
  includeSensitive: boolean
  importedAt?: string
}

export type BrowserSocialImportStageResult = SocialImportWorkerStagePayload & {
  executionMode: SocialImportWorkerExecutionMode
  workerTimings?: SocialImportWorkerTimings
}

export type BrowserSocialImportStageChunkInput = {
  stageId: string
  offset: number
  limit: number
  includeSourceRecords: boolean
}

export type BrowserSocialImportStageChunkResult = SocialImportWorkerStageChunkPayload & {
  executionMode: SocialImportWorkerExecutionMode
  workerTimings?: SocialImportWorkerTimings
}

class SocialImportWorkerUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SocialImportWorkerUnavailableError'
  }
}

const adapters = builtInSocialImportAdapters
const WORKER_TIMING_FALLBACK_MS = 250
const mainThreadStageDrafts = new Map<string, MainThreadStagedResult>()
let sharedWorker: Worker | null = null
const pendingWorkerRequests = new Map<string, PendingWorkerRequest<unknown>>()

type MainThreadStagedResult = {
  file: File
  manifest: ArchiveManifest
  buckets: string[]
  includeSensitive: boolean
  importedAt: string
  result: SocialImportNodeDraftStreamResult
  streams: Map<string, MainThreadStageDraftStream>
}

type MainThreadStageDraftStream = {
  generator: AsyncGenerator<SocialImportNodeDraft, SocialImportNodeDraftStreamResult, void>
  offset: number
  totalRecords: number
  done: boolean
}

type PendingWorkerRequest<T> = {
  isExpectedResponse: (response: SocialImportWorkerResponse) => boolean
  resolve: (result: TimedWorkerResult<T>) => void
  reject: (error: Error) => void
  requestPostMessageMs: number
  pendingSuccess: TimedWorkerResult<T> | null
  pendingTimings: SocialImportWorkerTimings | null
  timingFallbackTimeout: ReturnType<typeof setTimeout> | null
}

function nextRequestId(): string {
  return `social-import:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function createWorker(): Worker {
  if (typeof Worker === 'undefined') {
    throw new SocialImportWorkerUnavailableError('Web Workers are not available.')
  }

  try {
    return new Worker(new URL('../workers/social-import.worker.ts', import.meta.url), {
      type: 'module'
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new SocialImportWorkerUnavailableError(message)
  }
}

function requestWorker<T>(
  input: SocialImportWorkerRequestInput,
  isExpectedResponse: (
    response: SocialImportWorkerResponse
  ) => response is SocialImportWorkerResponse & {
    ok: true
    result: T
  }
): Promise<TimedWorkerResult<T>> {
  const requestId = nextRequestId()
  const worker = getSharedWorker()

  return new Promise((resolve, reject) => {
    try {
      const postMessageStartedAt = performance.now()
      const pendingRequest: PendingWorkerRequest<T> = {
        isExpectedResponse,
        resolve,
        reject,
        requestPostMessageMs: 0,
        pendingSuccess: null,
        pendingTimings: null,
        timingFallbackTimeout: null
      }
      pendingWorkerRequests.set(requestId, pendingRequest as PendingWorkerRequest<unknown>)
      worker.postMessage({ ...input, requestId } as SocialImportWorkerRequest)
      pendingRequest.requestPostMessageMs = performance.now() - postMessageStartedAt
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      pendingWorkerRequests.delete(requestId)
      reject(new SocialImportWorkerUnavailableError(message))
    }
  })
}

function getSharedWorker(): Worker {
  if (sharedWorker) return sharedWorker

  const worker = createWorker()
  worker.onmessage = (event: MessageEvent<SocialImportWorkerResponse>): void => {
    handleSharedWorkerMessage(event.data)
  }
  worker.onerror = (event): void => {
    const error = new SocialImportWorkerUnavailableError(
      event instanceof ErrorEvent ? event.message : 'Social import worker failed.'
    )
    rejectPendingWorkerRequests(error)
    sharedWorker = null
  }
  sharedWorker = worker
  return worker
}

function handleSharedWorkerMessage(response: SocialImportWorkerResponse): void {
  const pendingRequest = pendingWorkerRequests.get(response.requestId)
  if (!pendingRequest) return

  if (response.kind === 'timing') {
    pendingRequest.pendingTimings = response.timings
    if (pendingRequest.pendingSuccess) {
      resolvePendingWorkerRequest(response.requestId, pendingRequest, pendingRequest.pendingSuccess)
    }
    return
  }

  if (!response.ok) {
    rejectPendingWorkerRequest(
      response.requestId,
      pendingRequest,
      new Error(response.error.message)
    )
    return
  }

  if (!pendingRequest.isExpectedResponse(response)) {
    rejectPendingWorkerRequest(
      response.requestId,
      pendingRequest,
      new Error(`Unexpected social import worker response: ${response.kind}`)
    )
    return
  }

  pendingRequest.pendingSuccess = {
    result: response.result,
    timings: {
      requestPostMessageMs: pendingRequest.requestPostMessageMs,
      ...(response.timings ?? {})
    }
  }

  if (pendingRequest.pendingTimings) {
    resolvePendingWorkerRequest(response.requestId, pendingRequest, pendingRequest.pendingSuccess)
    return
  }

  pendingRequest.timingFallbackTimeout = setTimeout(() => {
    if (pendingRequest.pendingSuccess) {
      resolvePendingWorkerRequest(response.requestId, pendingRequest, pendingRequest.pendingSuccess)
    }
  }, WORKER_TIMING_FALLBACK_MS)
}

function resolvePendingWorkerRequest<T>(
  requestId: string,
  pendingRequest: PendingWorkerRequest<T>,
  result: TimedWorkerResult<T>
): void {
  cleanupPendingWorkerRequest(requestId, pendingRequest)
  pendingRequest.resolve({
    result: result.result,
    timings: {
      ...result.timings,
      ...(pendingRequest.pendingTimings ?? {})
    }
  })
}

function rejectPendingWorkerRequest(
  requestId: string,
  pendingRequest: PendingWorkerRequest<unknown>,
  error: Error
): void {
  cleanupPendingWorkerRequest(requestId, pendingRequest)
  pendingRequest.reject(error)
}

function cleanupPendingWorkerRequest<T>(
  requestId: string,
  pendingRequest: PendingWorkerRequest<T>
): void {
  if (pendingRequest.timingFallbackTimeout) {
    clearTimeout(pendingRequest.timingFallbackTimeout)
    pendingRequest.timingFallbackTimeout = null
  }
  pendingWorkerRequests.delete(requestId)
}

function rejectPendingWorkerRequests(error: Error): void {
  for (const [requestId, pendingRequest] of pendingWorkerRequests.entries()) {
    rejectPendingWorkerRequest(requestId, pendingRequest, error)
  }
}

function isPreviewResponse(
  response: SocialImportWorkerResponse
): response is SocialImportWorkerResponse & {
  kind: 'preview'
  ok: true
  result: SocialImportWorkerPreviewPayload
} {
  return response.ok && response.kind === 'preview'
}

function isStageResponse(
  response: SocialImportWorkerResponse
): response is SocialImportWorkerResponse & {
  kind: 'stage'
  ok: true
  result: SocialImportWorkerStagePayload
} {
  return response.ok && response.kind === 'stage'
}

function isStageChunkResponse(
  response: SocialImportWorkerResponse
): response is SocialImportWorkerResponse & {
  kind: 'stage-chunk'
  ok: true
  result: SocialImportWorkerStageChunkPayload
} {
  return response.ok && response.kind === 'stage-chunk'
}

async function readPreviewOnMainThread(file: File): Promise<BrowserSocialImportPreviewResult> {
  const manifest = await readBrowserZipArchiveManifest(file, { hashEntries: false })
  const preview = await createSocialArchivePreview({ adapters, manifest })

  return {
    manifest,
    preview,
    executionMode: 'main-thread'
  }
}

async function stageOnMainThread(
  input: BrowserSocialImportStageInput
): Promise<BrowserSocialImportStageResult> {
  const readJsonEntry = await createBrowserZipJsonEntryReader(input.file)
  const readTextEntry = await createBrowserZipTextEntryReader(input.file)
  const streamResults: SocialImportNodeDraftStreamResult[] = []
  const importedAt = input.importedAt ?? new Date().toISOString()
  for await (const draft of streamSocialImportNodeDrafts({
    manifest: input.manifest,
    adapters,
    readJsonEntry,
    readTextEntry,
    buckets: input.buckets,
    includeSensitive: input.includeSensitive,
    importedAt,
    includeSourceRecords: true,
    onComplete: (result) => {
      streamResults.push(result)
    }
  })) {
    void draft
  }
  const result = requireStreamResult(streamResults)
  const stageId = createStageId()
  mainThreadStageDrafts.set(stageId, {
    file: input.file,
    manifest: input.manifest,
    buckets: input.buckets,
    includeSensitive: input.includeSensitive,
    importedAt,
    result,
    streams: new Map()
  })

  return {
    ...createStagePayload(stageId, result, importedAt),
    executionMode: 'main-thread'
  }
}

export async function readBrowserSocialImportPreview(
  file: File
): Promise<BrowserSocialImportPreviewResult> {
  try {
    const result = await requestWorker<SocialImportWorkerPreviewPayload>(
      { kind: 'preview', file },
      isPreviewResponse
    )

    return {
      ...result.result,
      executionMode: 'worker',
      workerTimings: result.timings
    }
  } catch (error) {
    if (error instanceof SocialImportWorkerUnavailableError) {
      return readPreviewOnMainThread(file)
    }

    throw error
  }
}

export async function stageBrowserSocialArchive(
  input: BrowserSocialImportStageInput
): Promise<BrowserSocialImportStageResult> {
  try {
    const result = await requestWorker<SocialImportWorkerStagePayload>(
      {
        kind: 'stage',
        file: input.file,
        manifest: input.manifest,
        buckets: input.buckets,
        includeSensitive: input.includeSensitive,
        importedAt: input.importedAt
      },
      isStageResponse
    )

    return {
      ...result.result,
      executionMode: 'worker',
      workerTimings: result.timings
    }
  } catch (error) {
    if (error instanceof SocialImportWorkerUnavailableError) {
      return stageOnMainThread(input)
    }

    throw error
  }
}

export async function readBrowserSocialImportStageChunk(
  input: BrowserSocialImportStageChunkInput
): Promise<BrowserSocialImportStageChunkResult> {
  const mainThreadResult = await readStageChunkOnMainThread(input)
  if (mainThreadResult) return mainThreadResult

  const result = await requestWorker<SocialImportWorkerStageChunkPayload>(
    {
      kind: 'stage-chunk',
      stageId: input.stageId,
      offset: input.offset,
      limit: input.limit,
      includeSourceRecords: input.includeSourceRecords
    },
    isStageChunkResponse
  )

  return {
    ...result.result,
    executionMode: 'worker',
    workerTimings: result.timings
  }
}

async function readStageChunkOnMainThread(
  input: BrowserSocialImportStageChunkInput
): Promise<BrowserSocialImportStageChunkResult | null> {
  const stagedResult = mainThreadStageDrafts.get(input.stageId)
  if (!stagedResult) return null

  let stream = await getMainThreadStageDraftStream(stagedResult, input.includeSourceRecords)
  const offset = clampInteger(input.offset, 0, stream.totalRecords)
  if (offset === 0 && stream.offset !== 0) {
    stream = await getMainThreadStageDraftStream(stagedResult, input.includeSourceRecords, true)
  }
  if (offset > stream.offset) {
    await readMainThreadStageDraftStream(stream, offset - stream.offset)
  }
  if (offset !== stream.offset) {
    throw new Error(
      `Social import stage stream expected offset ${stream.offset} but received ${offset}`
    )
  }

  const limit = Math.max(0, Math.floor(input.limit))
  const drafts = await readMainThreadStageDraftStream(stream, limit)

  return {
    stageId: input.stageId,
    drafts,
    offset,
    limit,
    totalRecords: stream.totalRecords,
    nextOffset: stream.offset,
    done: stream.done || stream.offset >= stream.totalRecords,
    executionMode: 'main-thread'
  }
}

function createStagePayload(
  stageId: string,
  result: SocialImportNodeDraftStreamResult,
  importedAt: string
): SocialImportWorkerStagePayload {
  return {
    archive: result.archive,
    archiveNode: result.archiveNode,
    importRunNode: result.importRunNode,
    summary: result.summary,
    telemetry: result.telemetry,
    stageDurationMs: result.stageDurationMs,
    stageId,
    importedAt,
    recordCount: result.recordCount,
    sourceRecordCount: result.sourceRecordCount,
    sourceRecordMode: result.sourceRecordMode,
    sidecarSourceRecordCount: result.sidecarSourceRecordCount,
    canonicalRecordCount: result.canonicalRecordCount
  }
}

async function getMainThreadStageDraftStream(
  stagedResult: MainThreadStagedResult,
  includeSourceRecords: boolean,
  reset = false
): Promise<MainThreadStageDraftStream> {
  const streamKey = includeSourceRecords ? 'with-source-records' : 'without-source-records'
  const existing = stagedResult.streams.get(streamKey)
  if (existing && !reset) return existing

  const readJsonEntry = await createBrowserZipJsonEntryReader(stagedResult.file)
  const readTextEntry = await createBrowserZipTextEntryReader(stagedResult.file)
  const totalRecords = getCommitRecordCount(stagedResult.result, includeSourceRecords)
  const stream: MainThreadStageDraftStream = {
    generator: streamSocialImportNodeDrafts({
      manifest: stagedResult.manifest,
      adapters,
      readJsonEntry,
      readTextEntry,
      buckets: stagedResult.buckets,
      includeSensitive: stagedResult.includeSensitive,
      importedAt: stagedResult.importedAt,
      includeSourceRecords
    }),
    offset: 0,
    totalRecords,
    done: false
  }
  stagedResult.streams.set(streamKey, stream)
  return stream
}

async function readMainThreadStageDraftStream(
  stream: MainThreadStageDraftStream,
  limit: number
): Promise<SocialImportWorkerStageChunkPayload['drafts']> {
  const drafts: SocialImportWorkerStageChunkPayload['drafts'] = []
  while (drafts.length < limit && !stream.done) {
    const next = await stream.generator.next()
    if (next.done) {
      stream.done = true
      break
    }
    drafts.push(next.value)
  }
  stream.offset += drafts.length
  return drafts
}

function getCommitRecordCount(
  result: Pick<SocialImportNodeDraftStreamResult, 'canonicalRecordCount' | 'recordCount'>,
  includeSourceRecords: boolean
): number {
  return 2 + (includeSourceRecords ? result.recordCount : result.canonicalRecordCount)
}

function requireStreamResult(
  results: readonly SocialImportNodeDraftStreamResult[]
): SocialImportNodeDraftStreamResult {
  const [result] = results
  if (!result) throw new Error('Social import stream did not complete.')
  return result
}

function createStageId(): string {
  return `social-stage:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}
