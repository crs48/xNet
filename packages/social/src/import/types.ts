/**
 * Shared social import contracts.
 */

import type {
  SocialPlatform,
  SocialPrivacyClass,
  SocialSourceRecordKind
} from '../schemas/constants'

export type ArchiveEntryRef = {
  path: string
  byteSize: number
  compressedByteSize?: number
  sha256?: string
  compressionMethod?: number
  modifiedAt?: string
}

export type ArchiveManifest = {
  archivePath?: string
  filename: string
  byteSize: number
  archiveHash?: string
  entries: ArchiveEntryRef[]
}

export type ImportBucket = {
  id: string
  label: string
  description?: string
  entryPaths: string[]
  recordCount?: number
  privacyClass: SocialPrivacyClass
  defaultSelected: boolean
  ignoredReason?: string
}

export type ImportProbe = {
  adapterId: string
  adapterVersion: string
  platform: SocialPlatform
  confidence: number
  buckets: ImportBucket[]
  warnings: string[]
}

export type ImportSelection = {
  buckets?: readonly string[]
  includeSensitive?: boolean
}

export type JsonArchiveEntryReader = <T = unknown>(path: string) => Promise<T>
export type TextArchiveEntryReader = (path: string) => Promise<string>

export type SocialImportContext = {
  manifest: ArchiveManifest
  archiveId: string
  importRunId?: string
  observedBy?: string
  importedAt: string
  readJsonEntry: JsonArchiveEntryReader
  readTextEntry?: TextArchiveEntryReader
}

export type StagedCanonicalNodeKind =
  | 'actor'
  | 'identity-claim'
  | 'content'
  | 'interaction'
  | 'conversation'
  | 'message'
  | 'collection'
  | 'collection-item'

export type StagedSourceRecord = {
  kind: 'source-record'
  deterministicId: string
  schemaId: string
  platform: SocialPlatform
  bucketId: string
  source: ArchiveEntryRef
  sourceRecordKind: SocialSourceRecordKind
  sourceRecordId: string
  sourceRecordHash: string
  privacyClass: SocialPrivacyClass
  properties: Record<string, unknown>
  warnings: string[]
}

export type StagedIgnoredSourceRecord = StagedSourceRecord & {
  ignored: true
  ignoredReason: string
}

export type StagedSocialNode = {
  kind: StagedCanonicalNodeKind
  deterministicId: string
  schemaId: string
  platform: SocialPlatform
  bucketId: string
  source: ArchiveEntryRef
  sourceRecordId: string
  privacyClass: SocialPrivacyClass
  properties: Record<string, unknown>
  warnings: string[]
}

export type StagedSocialRecord = StagedSourceRecord | StagedIgnoredSourceRecord | StagedSocialNode

export type ImportBucketSummary = {
  bucketId: string
  totalRecords: number
  recordsByKind: Record<string, number>
  recordsByPrivacyClass: Record<string, number>
  warningCount: number
  ignoredCount: number
}

export type StagingSummary = {
  totalRecords: number
  totalWarnings: number
  totalIgnored: number
  bucketSummaries: ImportBucketSummary[]
}

export type SocialImportAdapter = {
  id: string
  version: string
  platform: SocialPlatform
  detect: (manifest: ArchiveManifest) => number
  probe: (context: Pick<SocialImportContext, 'manifest'>) => Promise<ImportProbe> | ImportProbe
  stage: (
    context: SocialImportContext,
    selection?: ImportSelection
  ) => AsyncIterable<StagedSocialRecord>
}
