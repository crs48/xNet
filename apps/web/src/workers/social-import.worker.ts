import type {
  SocialImportWorkerRequest,
  SocialImportWorkerResponse,
  SocialImportWorkerSuccessResponse
} from '../lib/social-import-worker-protocol'
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

  postSuccessResponse(
    {
      kind: 'stage',
      requestId: request.requestId,
      ok: true,
      result
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

    await handleStage(request)
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
