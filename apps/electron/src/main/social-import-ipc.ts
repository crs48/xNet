/**
 * Main-process IPC for local social graph archive imports.
 */

import type {
  ArchiveManifest,
  ImportProbe,
  ImportSelection,
  SocialImportAdapter,
  SocialImportTelemetryEvent,
  StagedSocialRecord,
  StagingSummary
} from '@xnetjs/social/import'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import {
  collectStagedRecords,
  createLargeArchiveStoragePlan,
  createSocialImportTelemetryEvents,
  createSocialNodeId,
  createStagingSummary,
  createZipJsonEntryReader,
  createZipTextEntryReader,
  detectSocialArchive,
  readZipArchiveManifest
} from '@xnetjs/social/import'
import { grokAdapter, instagramAdapter, youtubeAdapter } from '@xnetjs/social/importers'
import { SocialImportArchiveSchema, SocialImportRunSchema } from '@xnetjs/social/schemas'
import { dialog, ipcMain } from 'electron'

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
  archivePath: string
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

export type SocialImportStageRequest = {
  archivePath: string
  buckets?: string[]
  includeSensitive?: boolean
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

const adapters = [instagramAdapter, grokAdapter, youtubeAdapter] as const
const approvedArchivePaths = new Set<string>()

export function setupSocialImportIPC(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('xnet:social-import:pickArchive', async () => {
    const window = getWindow()
    const result = window
      ? await dialog.showOpenDialog(window, archiveDialogOptions)
      : await dialog.showOpenDialog(archiveDialogOptions)

    if (result.canceled || result.filePaths.length === 0) return null

    const archivePath = result.filePaths[0]
    approvedArchivePaths.add(archivePath)
    return createArchivePreview(archivePath)
  })

  ipcMain.handle(
    'xnet:social-import:stageArchive',
    async (_event, request: SocialImportStageRequest): Promise<SocialImportStageResult> => {
      if (!approvedArchivePaths.has(request.archivePath)) {
        throw new Error('Archive was not selected through the social import picker')
      }

      return stageArchive(request)
    }
  )
}

const archiveDialogOptions: OpenDialogOptions = {
  title: 'Select social archive',
  properties: ['openFile'],
  filters: [{ name: 'ZIP archives', extensions: ['zip'] }]
}

async function createArchivePreview(archivePath: string): Promise<SocialImportArchivePreview> {
  const manifest = await readZipArchiveManifest(archivePath, { hashEntries: false })
  const detection = detectSocialArchive(adapters, manifest)
  const probe = detection ? await detection.adapter.probe({ manifest }) : null
  const storagePlan = createLargeArchiveStoragePlan(manifest)

  return {
    archivePath,
    filename: manifest.filename,
    byteSize: manifest.byteSize,
    entryCount: manifest.entries.length,
    archiveHash: manifest.archiveHash ?? null,
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

async function stageArchive(request: SocialImportStageRequest): Promise<SocialImportStageResult> {
  const stageStartedAt = Date.now()
  const manifest = await readZipArchiveManifest(request.archivePath, { hashEntries: false })
  const detection = detectSocialArchive(adapters, manifest)
  if (!detection) throw new Error('No social importer recognized this archive')

  const probe = await detection.adapter.probe({ manifest })
  const selectedBuckets = resolveSelectedBuckets(probe, request)
  const importedAt = new Date().toISOString()
  const archiveId = createSocialNodeId('import-archive', [
    manifest.archiveHash ?? manifest.filename,
    manifest.byteSize
  ])
  const importRunId = createSocialNodeId('import-run', [
    archiveId,
    detection.adapter.id,
    detection.adapter.version,
    selectedBuckets,
    Boolean(request.includeSensitive),
    importedAt
  ])
  const readJsonEntry = await createZipJsonEntryReader(request.archivePath)
  const readTextEntry = await createZipTextEntryReader(request.archivePath)
  const selection: ImportSelection = {
    buckets: selectedBuckets,
    includeSensitive: Boolean(request.includeSensitive)
  }
  const stagedRecords = await collectStagedRecords(
    detection.adapter.stage(
      {
        manifest,
        archiveId,
        importRunId,
        importedAt,
        readJsonEntry,
        readTextEntry
      },
      selection
    )
  )
  const summary = createStagingSummary(stagedRecords)
  const stageDurationMs = Date.now() - stageStartedAt
  const preview = await createArchivePreview(request.archivePath)

  return {
    archive: preview,
    archiveNode: createArchiveNodeDraft({
      adapter: detection.adapter,
      archiveId,
      importedAt,
      manifest
    }),
    importRunNode: createImportRunNodeDraft({
      adapter: detection.adapter,
      archiveId,
      importRunId,
      importedAt,
      selectedBuckets,
      summary
    }),
    records: stagedRecords.map(toNodeDraft),
    summary,
    telemetry: createSocialImportTelemetryEvents({
      adapterId: detection.adapter.id,
      adapterVersion: detection.adapter.version,
      platform: detection.adapter.platform,
      stagedRecords,
      stagingSummary: summary,
      stageDurationMs,
      storagePlan: createLargeArchiveStoragePlan(manifest),
      createdAt: importedAt
    }),
    stageDurationMs
  }
}

function resolveSelectedBuckets(probe: ImportProbe, request: SocialImportStageRequest): string[] {
  const fallback = probe.buckets
    .filter((bucket) => bucket.defaultSelected)
    .map((bucket) => bucket.id)
  const requested = request.buckets?.length ? request.buckets : fallback
  return [...new Set(requested)].sort()
}

function createArchiveNodeDraft(input: {
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

function createImportRunNodeDraft(input: {
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

function toNodeDraft(record: StagedSocialRecord): SocialImportNodeDraft {
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
