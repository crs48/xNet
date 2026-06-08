import type {
  SocialImportWorkerExecutionMode,
  SocialImportWorkerPreviewPayload,
  SocialImportWorkerRequest,
  SocialImportWorkerResponse,
  SocialImportWorkerStagePayload,
  SocialImportWorkerTimings
} from './social-import-worker-protocol'
import type { ArchiveManifest } from '@xnetjs/social/import/browser'
import {
  createBrowserZipJsonEntryReader,
  createBrowserZipTextEntryReader,
  createSocialArchivePreview,
  readBrowserZipArchiveManifest,
  stageSocialArchive
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
}

export type BrowserSocialImportStageResult = SocialImportWorkerStagePayload & {
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
  const worker = createWorker()

  return new Promise((resolve, reject) => {
    let requestPostMessageMs = 0
    let pendingSuccess: TimedWorkerResult<T> | null = null
    let pendingTimings: SocialImportWorkerTimings | null = null
    let timingFallbackTimeout: ReturnType<typeof setTimeout> | null = null
    let settled = false

    const cleanup = (): void => {
      if (timingFallbackTimeout) {
        clearTimeout(timingFallbackTimeout)
        timingFallbackTimeout = null
      }
      worker.onmessage = null
      worker.onerror = null
      worker.terminate()
    }

    const resolveTimedResult = (result: TimedWorkerResult<T>): void => {
      if (settled) return
      settled = true
      cleanup()
      resolve({
        result: result.result,
        timings: {
          ...result.timings,
          ...(pendingTimings ?? {})
        }
      })
    }

    const rejectTimedResult = (error: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    worker.onmessage = (event: MessageEvent<SocialImportWorkerResponse>): void => {
      const response = event.data
      if (response.requestId !== requestId) return

      if (response.kind === 'timing') {
        pendingTimings = response.timings
        if (pendingSuccess) {
          resolveTimedResult(pendingSuccess)
        }
        return
      }

      if (!response.ok) {
        rejectTimedResult(new Error(response.error.message))
        return
      }

      if (!isExpectedResponse(response)) {
        rejectTimedResult(new Error(`Unexpected social import worker response: ${response.kind}`))
        return
      }

      pendingSuccess = {
        result: response.result,
        timings: {
          requestPostMessageMs,
          ...(response.timings ?? {})
        }
      }

      if (pendingTimings) {
        resolveTimedResult(pendingSuccess)
        return
      }

      timingFallbackTimeout = setTimeout(() => {
        if (pendingSuccess) {
          resolveTimedResult(pendingSuccess)
        }
      }, WORKER_TIMING_FALLBACK_MS)
    }

    worker.onerror = (event): void => {
      rejectTimedResult(
        new SocialImportWorkerUnavailableError(
          event instanceof ErrorEvent ? event.message : 'Social import worker failed.'
        )
      )
    }

    try {
      const postMessageStartedAt = performance.now()
      worker.postMessage({ ...input, requestId } as SocialImportWorkerRequest)
      requestPostMessageMs = performance.now() - postMessageStartedAt
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      rejectTimedResult(new SocialImportWorkerUnavailableError(message))
    }
  })
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
  const result = await stageSocialArchive({
    manifest: input.manifest,
    adapters,
    readJsonEntry,
    readTextEntry,
    buckets: input.buckets,
    includeSensitive: input.includeSensitive
  })

  return {
    ...result,
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
        includeSensitive: input.includeSensitive
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
