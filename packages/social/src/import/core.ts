/**
 * Browser-safe social importer contracts and utilities.
 */

export {
  createSocialImportBenchmarkDrafts,
  iterateSocialImportBenchmarkDrafts,
  SOCIAL_IMPORT_BENCHMARK_RECORD_COUNTS,
  type SocialImportBenchmarkDraftOptions,
  type SocialImportBenchmarkRecordCount
} from './benchmark-fixtures'
export {
  buildSocialCommitOperations,
  commitStagedSocialNodes,
  type SocialCommitSummary
} from './commit'
export { detectSocialArchive, probeSocialArchive, type SocialArchiveDetection } from './detector'
export {
  clearCompletedSocialImportJobs,
  createSocialImportJob,
  createSocialImportJobCheckpointAccumulator,
  listSocialImportJobs,
  subscribeSocialImportJobs,
  updateSocialImportJob,
  upsertSocialImportJobProgress,
  type CreateSocialImportJobInput,
  type SocialImportJobBucketCheckpoint,
  type SocialImportJobCheckpoint,
  type SocialImportJobCheckpointDraft,
  type SocialImportJobCheckpointSnapshot,
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
  DEFAULT_SOCIAL_IMPORT_COMMIT_POLICY,
  resolveSocialImportCommitPolicy,
  shouldCommitSourceRecordNodes,
  toNodeBatchWritePolicy,
  type SocialImportCommitPolicy,
  type SocialImportCommitPolicyInput,
  type SocialImportSourceRecordMode
} from './policy'
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
  createStagingSummaryAccumulator,
  createStagingSummary,
  filterStagedRecordsBySelection
} from './staging'
export {
  createSocialArchivePreview,
  createSocialImportStagePlan,
  createSocialImportNodeDrafts,
  createSocialImportRunDraft,
  createSocialImportArchiveDraft,
  previewSocialImportNodeDrafts,
  resolveSelectedSocialImportBuckets,
  stageSocialArchive,
  streamSocialImportNodeDrafts,
  toSocialImportNodeDraft,
  type SocialImportArchivePreview,
  type SocialImportNodeDraftPreviewResult,
  type SocialImportNodeDraftStreamResult,
  type SocialImportNodeDraft,
  type PreviewSocialImportNodeDraftsInput,
  type SocialImportStagePlan,
  type SocialImportStageInput,
  type SocialImportStageResult,
  type StreamSocialImportNodeDraftsInput
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
  SocialImportStageProgress,
  StagedCanonicalNodeKind,
  StagedIgnoredSourceRecord,
  StagedSocialNode,
  StagedSocialRecord,
  StagedSourceRecord,
  StagingSummary
} from './types'
