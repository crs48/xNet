/**
 * Shared archive staging orchestration for Electron and web import surfaces.
 */

import type {
  ArchiveManifest,
  ImportProbe,
  ImportSelection,
  JsonArchiveEntryReader,
  SocialImportAdapter,
  SocialImportStageProgress,
  StagedSocialRecord,
  StagingSummary,
  TextArchiveEntryReader
} from './types'
import { SocialImportArchiveSchema, SocialImportRunSchema } from '../schemas'
import { detectSocialArchive } from './detector'
import { createSocialNodeId } from './ids'
import { createStagingSummaryAccumulator } from './staging'
import { createLargeArchiveStoragePlan } from './storage'
import { createSocialImportTelemetryEvents, type SocialImportTelemetryEvent } from './telemetry'

export type SocialImportNodeDraft = {
  kind: StagedSocialRecord['kind'] | 'import-archive' | 'import-run'
  deterministicId: string
  schemaId: string
  platform: string
  bucketId: string
  privacyClass: string
  properties: Record<string, unknown>
  warningCount: number
}

export type SocialImportArchivePreview = {
  archivePath?: string
  filename: string
  byteSize: number
  entryCount: number
  archiveHash: string | null
  adapter: {
    id: string
    version: string
    platform: string
    confidence: number
  } | null
  probe: ImportProbe | null
  storagePlan: {
    mode: string
    archiveByteSize: number
    entryBlobCount: number
    skippedBlobCount: number
    warnings: string[]
  }
}

export type SocialImportStageInput = {
  manifest: ArchiveManifest
  adapters: readonly SocialImportAdapter[]
  readJsonEntry: JsonArchiveEntryReader
  readTextEntry?: TextArchiveEntryReader
  buckets?: readonly string[]
  includeSensitive?: boolean
  importedAt?: string
  observedBy?: string
  onProgress?: (progress: SocialImportStageProgress) => void
  progressIntervalRecords?: number
}

export type SocialImportStageResult = {
  archive: SocialImportArchivePreview
  archiveNode: SocialImportNodeDraft
  importRunNode: SocialImportNodeDraft
  records: SocialImportNodeDraft[]
  summary: StagingSummary
  telemetry: SocialImportTelemetryEvent[]
  stageDurationMs: number
}

export async function createSocialArchivePreview(input: {
  adapters: readonly SocialImportAdapter[]
  manifest: ArchiveManifest
}): Promise<SocialImportArchivePreview> {
  const detection = detectSocialArchive(input.adapters, input.manifest)
  const probe = detection ? await detection.adapter.probe({ manifest: input.manifest }) : null
  const storagePlan = createLargeArchiveStoragePlan(input.manifest)

  return {
    archivePath: input.manifest.archivePath,
    filename: input.manifest.filename,
    byteSize: input.manifest.byteSize,
    entryCount: input.manifest.entries.length,
    archiveHash: input.manifest.archiveHash ?? null,
    adapter: detection
      ? {
          id: detection.adapter.id,
          version: detection.adapter.version,
          platform: detection.adapter.platform,
          confidence: detection.confidence
        }
      : null,
    probe,
    storagePlan: {
      mode: storagePlan.mode,
      archiveByteSize: storagePlan.archiveByteSize,
      entryBlobCount: storagePlan.entryBlobPaths.length,
      skippedBlobCount: storagePlan.skippedBlobPaths.length,
      warnings: storagePlan.warnings
    }
  }
}

export async function stageSocialArchive(
  input: SocialImportStageInput
): Promise<SocialImportStageResult> {
  const stageStartedAt = Date.now()
  const detection = detectSocialArchive(input.adapters, input.manifest)
  if (!detection) throw new Error('No social importer recognized this archive')

  const probe = await detection.adapter.probe({ manifest: input.manifest })
  const selectedBuckets = resolveSelectedSocialImportBuckets(probe, input)
  const importedAt = input.importedAt ?? new Date().toISOString()
  const archiveId = createSocialNodeId('import-archive', [
    input.manifest.archiveHash ?? input.manifest.filename,
    input.manifest.byteSize
  ])
  const importRunId = createSocialNodeId('import-run', [
    archiveId,
    detection.adapter.id,
    detection.adapter.version,
    selectedBuckets,
    Boolean(input.includeSensitive),
    importedAt
  ])
  const selection: ImportSelection = {
    buckets: selectedBuckets,
    includeSensitive: Boolean(input.includeSensitive)
  }
  const stagedRecords: StagedSocialRecord[] = []
  const summaryAccumulator = createStagingSummaryAccumulator()
  const progressIntervalRecords = Math.max(1, Math.floor(input.progressIntervalRecords ?? 1000))

  for await (const record of detection.adapter.stage(
    {
      manifest: input.manifest,
      archiveId,
      importRunId,
      importedAt,
      observedBy: input.observedBy,
      readJsonEntry: input.readJsonEntry,
      readTextEntry: input.readTextEntry
    },
    selection
  )) {
    stagedRecords.push(record)
    summaryAccumulator.add(record)

    if (input.onProgress && stagedRecords.length % progressIntervalRecords === 0) {
      input.onProgress(summaryAccumulator.progress(record.bucketId))
    }
  }

  const summary = summaryAccumulator.summary()
  input.onProgress?.({
    ...summary,
    currentBucketId: null
  })
  const stageDurationMs = Date.now() - stageStartedAt

  return {
    archive: await createSocialArchivePreview({
      adapters: input.adapters,
      manifest: input.manifest
    }),
    archiveNode: createSocialImportArchiveDraft({
      adapter: detection.adapter,
      archiveId,
      importedAt,
      manifest: input.manifest
    }),
    importRunNode: createSocialImportRunDraft({
      adapter: detection.adapter,
      archiveId,
      importRunId,
      importedAt,
      selectedBuckets,
      summary
    }),
    records: createSocialImportNodeDrafts(stagedRecords),
    summary,
    telemetry: createSocialImportTelemetryEvents({
      adapterId: detection.adapter.id,
      adapterVersion: detection.adapter.version,
      platform: detection.adapter.platform,
      stagedRecords,
      stagingSummary: summary,
      stageDurationMs,
      storagePlan: createLargeArchiveStoragePlan(input.manifest),
      createdAt: importedAt
    }),
    stageDurationMs
  }
}

export function resolveSelectedSocialImportBuckets(
  probe: ImportProbe,
  selection: { buckets?: readonly string[] }
): string[] {
  const fallback = probe.buckets
    .filter((bucket) => bucket.defaultSelected)
    .map((bucket) => bucket.id)
  const requested = selection.buckets?.length ? selection.buckets : fallback
  return [...new Set(requested)].sort()
}

export function createSocialImportNodeDrafts(
  records: readonly StagedSocialRecord[]
): SocialImportNodeDraft[] {
  return records.map(toSocialImportNodeDraft)
}

export function createSocialImportArchiveDraft(input: {
  adapter: SocialImportAdapter
  archiveId: string
  importedAt: string
  manifest: ArchiveManifest
}): SocialImportNodeDraft {
  return {
    kind: 'import-archive',
    deterministicId: input.archiveId,
    schemaId: SocialImportArchiveSchema.schema['@id'],
    platform: input.adapter.platform,
    bucketId: 'import.archive',
    privacyClass: 'private',
    properties: {
      platform: input.adapter.platform,
      archiveHash: input.manifest.archiveHash ?? input.archiveId,
      filename: input.manifest.filename,
      byteSize: input.manifest.byteSize,
      entryCount: input.manifest.entries.length,
      importedAt: input.importedAt,
      adapterId: input.adapter.id,
      adapterVersion: input.adapter.version,
      manifestJson: JSON.stringify(createRedactedManifestSummary(input.manifest))
    },
    warningCount: 0
  }
}

export function createSocialImportRunDraft(input: {
  adapter: SocialImportAdapter
  archiveId: string
  importRunId: string
  importedAt: string
  selectedBuckets: string[]
  summary: StagingSummary
}): SocialImportNodeDraft {
  return {
    kind: 'import-run',
    deterministicId: input.importRunId,
    schemaId: SocialImportRunSchema.schema['@id'],
    platform: input.adapter.platform,
    bucketId: 'import.run',
    privacyClass: 'private',
    properties: {
      archive: input.archiveId,
      platform: input.adapter.platform,
      adapterId: input.adapter.id,
      adapterVersion: input.adapter.version,
      status: 'completed',
      startedAt: input.importedAt,
      completedAt: input.importedAt,
      selectedBucketsJson: JSON.stringify(input.selectedBuckets),
      summaryJson: JSON.stringify(input.summary),
      warningCount: input.summary.totalWarnings,
      errorCount: 0
    },
    warningCount: input.summary.totalWarnings
  }
}

export function toSocialImportNodeDraft(record: StagedSocialRecord): SocialImportNodeDraft {
  return {
    kind: record.kind,
    deterministicId: record.deterministicId,
    schemaId: record.schemaId,
    platform: record.platform,
    bucketId: record.bucketId,
    privacyClass: record.privacyClass,
    properties: record.properties,
    warningCount: record.warnings.length
  }
}

function createRedactedManifestSummary(manifest: ArchiveManifest): Record<string, unknown> {
  const entriesByTopLevel = manifest.entries.reduce<Record<string, number>>((counts, entry) => {
    const [topLevel = 'root'] = entry.path.split('/')
    return { ...counts, [topLevel]: (counts[topLevel] ?? 0) + 1 }
  }, {})

  return {
    filename: manifest.filename,
    byteSize: manifest.byteSize,
    entryCount: manifest.entries.length,
    archiveHash: manifest.archiveHash,
    entriesByTopLevel
  }
}
