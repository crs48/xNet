import type {
  ArchiveManifest,
  SocialImportArchivePreview,
  SocialImportStageResult
} from '@xnetjs/social/import/browser'

export type SocialImportWorkerExecutionMode = 'worker' | 'main-thread'

export type SocialImportWorkerTimings = {
  requestPostMessageMs?: number
  workerDurationMs?: number
  responsePostMessageMs?: number
}

export type SocialImportWorkerPreviewPayload = {
  manifest: ArchiveManifest
  preview: SocialImportArchivePreview
}

export type SocialImportWorkerStagePayload = SocialImportStageResult

export type SocialImportWorkerPreviewRequest = {
  kind: 'preview'
  requestId: string
  file: File
}

export type SocialImportWorkerStageRequest = {
  kind: 'stage'
  requestId: string
  file: File
  manifest: ArchiveManifest
  buckets: string[]
  includeSensitive: boolean
}

export type SocialImportWorkerRequest =
  | SocialImportWorkerPreviewRequest
  | SocialImportWorkerStageRequest

export type SocialImportWorkerSuccessResponse =
  | {
      kind: 'preview'
      requestId: string
      ok: true
      result: SocialImportWorkerPreviewPayload
      timings?: SocialImportWorkerTimings
    }
  | {
      kind: 'stage'
      requestId: string
      ok: true
      result: SocialImportWorkerStagePayload
      timings?: SocialImportWorkerTimings
    }

export type SocialImportWorkerTimingResponse = {
  kind: 'timing'
  requestId: string
  ok: true
  timings: SocialImportWorkerTimings
}

export type SocialImportWorkerErrorResponse = {
  kind: SocialImportWorkerRequest['kind']
  requestId: string
  ok: false
  error: {
    name: string
    message: string
  }
}

export type SocialImportWorkerResponse =
  | SocialImportWorkerSuccessResponse
  | SocialImportWorkerTimingResponse
  | SocialImportWorkerErrorResponse
