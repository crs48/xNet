import type {
  ArchiveManifest,
  SocialImportArchivePreview as SharedSocialImportArchivePreview,
  SocialImportNodeDraft as SharedSocialImportNodeDraft,
  SocialImportNodeDraftStreamResult,
  SocialImportJobProgress
} from '@xnetjs/social/import/core'

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
export type ElectronStagedSocialImport = Omit<SocialImportNodeDraftStreamResult, 'archive'> & {
  archive: SocialImportArchivePreview
  archivePath: string
  manifest: ArchiveManifest
  stageRequest: SocialImportStageRequest
  importedAt: string
}
