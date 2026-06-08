/**
 * Browser-safe social importer contracts and utilities.
 */

export {
  buildSocialCommitOperations,
  commitStagedSocialNodes,
  type SocialCommitSummary
} from './commit'
export { detectSocialArchive, probeSocialArchive, type SocialArchiveDetection } from './detector'
export {
  clearCompletedSocialImportJobs,
  createSocialImportJob,
  listSocialImportJobs,
  subscribeSocialImportJobs,
  updateSocialImportJob,
  type CreateSocialImportJobInput,
  type SocialImportJobMetrics,
  type SocialImportJobPatch,
  type SocialImportJobPhase,
  type SocialImportJobProgress,
  type SocialImportJobStatus
} from './jobs'
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
  createSocialImportTelemetryEvents,
  type SocialImportTelemetryEvent,
  type SocialImportTelemetryInput,
  type SocialImportTelemetryMetric,
  type SocialImportTelemetryTags,
  type SocialImportTelemetryUnit
} from './telemetry'
export {
  collectStagedRecords,
  createIgnoredSourceRecord,
  createSourceRecord,
  createStagedNode,
  createStagingSummary,
  filterStagedRecordsBySelection
} from './staging'
export {
  createSocialArchivePreview,
  createSocialImportNodeDrafts,
  createSocialImportRunDraft,
  createSocialImportArchiveDraft,
  resolveSelectedSocialImportBuckets,
  stageSocialArchive,
  toSocialImportNodeDraft,
  type SocialImportArchivePreview,
  type SocialImportNodeDraft,
  type SocialImportStageInput,
  type SocialImportStageResult
} from './stage-archive'
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
  TextArchiveEntryReader,
  SocialImportAdapter,
  SocialImportContext,
  StagedCanonicalNodeKind,
  StagedIgnoredSourceRecord,
  StagedSocialNode,
  StagedSocialRecord,
  StagedSourceRecord,
  StagingSummary
} from './types'
