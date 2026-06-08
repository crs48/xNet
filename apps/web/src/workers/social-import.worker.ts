import type {
  SocialImportWorkerRequest,
  SocialImportWorkerResponse,
  SocialImportWorkerStagePayload,
  SocialImportWorkerSuccessResponse
} from '../lib/social-import-worker-protocol'
import type { SocialImportNodeDraft, SocialImportStageResult } from '@xnetjs/social/import/browser'
import {
  createBrowserZipJsonEntryReader,
  createBrowserZipTextEntryReader,
  createSocialArchivePreview,
  readBrowserZipArchiveManifest,
  stageSocialArchive
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
  result: SocialImportStageResult
  commitDraftsWithSourceRecords: SocialImportNodeDraft[] | null
  commitDraftsWithoutSourceRecords: SocialImportNodeDraft[] | null
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
  const result = await stageSocialArchive({
    manifest: request.manifest,
    adapters,
    readJsonEntry,
    readTextEntry,
    buckets: request.buckets,
    includeSensitive: request.includeSensitive
  })
  const stageId = createStageId()
  stagedResults.set(stageId, {
    result,
    commitDraftsWithSourceRecords: null,
    commitDraftsWithoutSourceRecords: null
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

  const drafts = getCommitDrafts(stagedResult, request.includeSourceRecords)
  const offset = clampInteger(request.offset, 0, drafts.length)
  const limit = Math.max(0, Math.floor(request.limit))
  const nextOffset = Math.min(offset + limit, drafts.length)

  postSuccessResponse(
    {
      kind: 'stage-chunk',
      requestId: request.requestId,
      ok: true,
      result: {
        stageId: request.stageId,
        drafts: drafts.slice(offset, nextOffset),
        offset,
        limit,
        totalRecords: drafts.length,
        nextOffset,
        done: nextOffset >= drafts.length
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
  result: SocialImportStageResult
): SocialImportWorkerStagePayload {
  const sourceRecordCount = result.records.filter(
    (record) => record.kind === 'source-record'
  ).length
  return {
    archive: result.archive,
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

function getCommitDrafts(
  stagedResult: WorkerStagedResult,
  includeSourceRecords: boolean
): SocialImportNodeDraft[] {
  if (includeSourceRecords) {
    stagedResult.commitDraftsWithSourceRecords ??= [
      stagedResult.result.archiveNode,
      stagedResult.result.importRunNode,
      ...stagedResult.result.records
    ]
    return stagedResult.commitDraftsWithSourceRecords
  }

  stagedResult.commitDraftsWithoutSourceRecords ??= [
    stagedResult.result.archiveNode,
    stagedResult.result.importRunNode,
    ...stagedResult.result.records.filter((record) => record.kind !== 'source-record')
  ]
  return stagedResult.commitDraftsWithoutSourceRecords
}

function createStageId(): string {
  return `social-stage:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.floor(value)))
}
