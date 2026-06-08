import type {
  ArchiveManifest,
  SocialImportArchivePreview,
  SocialImportNodeDraft,
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

export type SocialImportWorkerStagePayload = Omit<SocialImportStageResult, 'records'> & {
  stageId: string
  recordCount: number
  sourceRecordCount: number
  canonicalRecordCount: number
}

export type SocialImportWorkerStageChunkPayload = {
  stageId: string
  drafts: SocialImportNodeDraft[]
  offset: number
  limit: number
  totalRecords: number
  nextOffset: number
  done: boolean
}

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

export type SocialImportWorkerStageChunkRequest = {
  kind: 'stage-chunk'
  requestId: string
  stageId: string
  offset: number
  limit: number
  includeSourceRecords: boolean
}

export type SocialImportWorkerRequest =
  | SocialImportWorkerPreviewRequest
  | SocialImportWorkerStageRequest
  | SocialImportWorkerStageChunkRequest

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
  | {
      kind: 'stage-chunk'
      requestId: string
      ok: true
      result: SocialImportWorkerStageChunkPayload
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
