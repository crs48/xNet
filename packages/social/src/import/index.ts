/**
 * Social importer contracts and utilities.
 */

export {
  readZipArchiveManifest,
  type ZipArchiveManifestOptions,
  type ZipCentralDirectoryEntry
} from './archive-reader'
export {
  buildSocialCommitOperations,
  commitStagedSocialNodes,
  type SocialCommitSummary
} from './commit'
export { detectSocialArchive, probeSocialArchive, type SocialArchiveDetection } from './detector'
export {
  createSocialNodeId,
  createSourceRecordHash,
  createSourceRecordId,
  normalizeHandle,
  normalizeToken,
  normalizeUrl,
  sha256Hex,
  stableJsonStringify
} from './ids'
export {
  classifySocialEntryPrivacy,
  getBucketDefaultSelected,
  getPrivacyVisibility,
  isSensitivePrivacyClass
} from './privacy'
export {
  createLargeArchiveStoragePlan,
  type ArchiveBlobStorageMode,
  type LargeArchiveStoragePlan,
  type LargeArchiveStoragePolicy
} from './storage'
export {
  collectStagedRecords,
  createIgnoredSourceRecord,
  createSourceRecord,
  createStagedNode,
  createStagingSummary,
  filterStagedRecordsBySelection
} from './staging'
export {
  sanitizeForFixture,
  sanitizeStagedRecordsForFixture,
  type SanitizedFixtureOptions
} from './sanitize'
export type {
  ArchiveEntryRef,
  ArchiveManifest,
  ImportBucket,
  ImportBucketSummary,
  ImportProbe,
  ImportSelection,
  JsonArchiveEntryReader,
  SocialImportAdapter,
  SocialImportContext,
  StagedCanonicalNodeKind,
  StagedIgnoredSourceRecord,
  StagedSocialNode,
  StagedSocialRecord,
  StagedSourceRecord,
  StagingSummary
} from './types'
