import type {
  SocialImportWorkerRequest,
  SocialImportWorkerResponse,
  SocialImportWorkerStagePayload,
  SocialImportWorkerSuccessResponse
} from '../lib/social-import-worker-protocol'
import type {
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

type SocialImportWorkerScope = {
  onmessage: ((event: MessageEvent<SocialImportWorkerRequest>) => void) | null
  postMessage: (message: SocialImportWorkerResponse) => void
}

const adapters = builtInSocialImportAdapters

const workerScope = self as unknown as SocialImportWorkerScope
const stagedResults = new Map<string, WorkerStagedResult>()

type WorkerStagedResult = {
  result: SocialImportNodeDraftStreamResult
  file: File
  manifest: Extract<SocialImportWorkerRequest, { kind: 'stage' }>['manifest']
  buckets: string[]
  includeSensitive: boolean
  importedAt: string
  streams: Map<string, WorkerStageDraftStream>
}

type WorkerStageDraftStream = {
  generator: AsyncGenerator<SocialImportNodeDraft, SocialImportNodeDraftStreamResult, void>
  offset: number
  totalRecords: number
  done: boolean
}

function errorPayload(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    }
  }

  return {
    name: 'Error',
    message: String(error)
  }
}

function postSuccessResponse(response: SocialImportWorkerSuccessResponse, startedAt: number): void {
  const responsePostStartedAt = performance.now()
  workerScope.postMessage({
    ...response,
    timings: {
      ...response.timings,
      workerDurationMs: responsePostStartedAt - startedAt
    }
  })
  workerScope.postMessage({
    kind: 'timing',
    requestId: response.requestId,
    ok: true,
    timings: {
      responsePostMessageMs: performance.now() - responsePostStartedAt
    }
  })
}

async function handlePreview(
  request: Extract<SocialImportWorkerRequest, { kind: 'preview' }>
): Promise<void> {
  const startedAt = performance.now()
  const manifest = await readBrowserZipArchiveManifest(request.file, { hashEntries: false })
  const preview = await createSocialArchivePreview({ adapters, manifest })

  postSuccessResponse(
    {
      kind: 'preview',
      requestId: request.requestId,
      ok: true,
      result: {
        manifest,
        preview
      }
    },
    startedAt
  )
}

async function handleStage(
  request: Extract<SocialImportWorkerRequest, { kind: 'stage' }>
): Promise<void> {
  const startedAt = performance.now()
  const readJsonEntry = await createBrowserZipJsonEntryReader(request.file)
  const readTextEntry = await createBrowserZipTextEntryReader(request.file)
  const streamResults: SocialImportNodeDraftStreamResult[] = []
  const importedAt = new Date().toISOString()

  for await (const draft of streamSocialImportNodeDrafts({
    manifest: request.manifest,
    adapters,
    readJsonEntry,
    readTextEntry,
    buckets: request.buckets,
    includeSensitive: request.includeSensitive,
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
  stagedResults.set(stageId, {
    result,
    file: request.file,
    manifest: request.manifest,
    buckets: request.buckets,
    includeSensitive: request.includeSensitive,
    importedAt,
    streams: new Map()
  })

  postSuccessResponse(
    {
      kind: 'stage',
      requestId: request.requestId,
      ok: true,
      result: createStagePayload(stageId, result)
    },
    startedAt
  )
}

async function handleStageChunk(
  request: Extract<SocialImportWorkerRequest, { kind: 'stage-chunk' }>
): Promise<void> {
  const startedAt = performance.now()
  const stagedResult = stagedResults.get(request.stageId)
  if (!stagedResult) {
    throw new Error(`No staged social import found for ${request.stageId}`)
  }

  let stream = await getStageDraftStream(stagedResult, request.includeSourceRecords)
  const offset = clampInteger(request.offset, 0, stream.totalRecords)
  if (offset === 0 && stream.offset !== 0) {
    stream = await getStageDraftStream(stagedResult, request.includeSourceRecords, true)
  }
  if (offset !== stream.offset) {
    throw new Error(
      `Social import stage stream expected offset ${stream.offset} but received ${offset}`
    )
  }

  const limit = Math.max(0, Math.floor(request.limit))
  const drafts = await readStageDraftStream(stream, limit)

  postSuccessResponse(
    {
      kind: 'stage-chunk',
      requestId: request.requestId,
      ok: true,
      result: {
        stageId: request.stageId,
        drafts,
        offset,
        limit,
        totalRecords: stream.totalRecords,
        nextOffset: stream.offset,
        done: stream.done || stream.offset >= stream.totalRecords
      }
    },
    startedAt
  )
}

async function handleRequest(request: SocialImportWorkerRequest): Promise<void> {
  try {
    if (request.kind === 'preview') {
      await handlePreview(request)
      return
    }

    if (request.kind === 'stage') {
      await handleStage(request)
      return
    }

    await handleStageChunk(request)
  } catch (error) {
    workerScope.postMessage({
      kind: request.kind,
      requestId: request.requestId,
      ok: false,
      error: errorPayload(error)
    })
  }
}

workerScope.onmessage = (event): void => {
  void handleRequest(event.data)
}

function createStagePayload(
  stageId: string,
  result: SocialImportNodeDraftStreamResult
): SocialImportWorkerStagePayload {
  return {
    archive: result.archive,
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

async function getStageDraftStream(
  stagedResult: WorkerStagedResult,
  includeSourceRecords: boolean,
  reset = false
): Promise<WorkerStageDraftStream> {
  const streamKey = includeSourceRecords ? 'with-source-records' : 'without-source-records'
  const existing = stagedResult.streams.get(streamKey)
  if (existing && !reset) return existing

  const readJsonEntry = await createBrowserZipJsonEntryReader(stagedResult.file)
  const readTextEntry = await createBrowserZipTextEntryReader(stagedResult.file)
  const totalRecords = getCommitRecordCount(stagedResult.result, includeSourceRecords)
  const stream: WorkerStageDraftStream = {
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

async function readStageDraftStream(
  stream: WorkerStageDraftStream,
  limit: number
): Promise<SocialImportNodeDraft[]> {
  const drafts: SocialImportNodeDraft[] = []
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
