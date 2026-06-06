/**
 * Local-only social import telemetry counters.
 */

import type { LargeArchiveStoragePlan } from './storage'
import type { StagedSocialRecord, StagingSummary } from './types'

export type SocialImportTelemetryMetric =
  | 'social.import.stage.records'
  | 'social.import.stage.warnings'
  | 'social.import.stage.ignored'
  | 'social.import.stage.duration'
  | 'social.import.storage.archive_bytes'
  | 'social.import.storage.entry_blobs'
  | 'social.import.commit.created'
  | 'social.import.commit.updated'
  | 'social.import.commit.unchanged'
  | 'social.import.commit.duration'

export type SocialImportTelemetryUnit = 'count' | 'ms' | 'bytes'

export type SocialImportTelemetryTags = {
  adapterId?: string
  adapterVersion?: string
  platform?: string
  bucketId?: string
  recordKind?: string
  privacyClass?: string
  status?: string
}

export type SocialImportTelemetryEvent = {
  metric: SocialImportTelemetryMetric
  value: number
  unit: SocialImportTelemetryUnit
  tags: SocialImportTelemetryTags
  createdAt: string
}

export type SocialImportTelemetryInput = {
  adapterId?: string
  adapterVersion?: string
  platform?: string
  stagedRecords?: readonly StagedSocialRecord[]
  stagingSummary?: StagingSummary
  storagePlan?: LargeArchiveStoragePlan
  stageDurationMs?: number
  commitDurationMs?: number
  commitSummary?: {
    created: number
    updated: number
    unchanged: number
  }
  createdAt?: string
}

function baseTags(input: SocialImportTelemetryInput): SocialImportTelemetryTags {
  return {
    ...(input.adapterId ? { adapterId: input.adapterId } : {}),
    ...(input.adapterVersion ? { adapterVersion: input.adapterVersion } : {}),
    ...(input.platform ? { platform: input.platform } : {})
  }
}

function createEvent(
  input: SocialImportTelemetryInput,
  metric: SocialImportTelemetryMetric,
  value: number,
  unit: SocialImportTelemetryUnit,
  tags: SocialImportTelemetryTags = {}
): SocialImportTelemetryEvent {
  return {
    metric,
    value,
    unit,
    tags: { ...baseTags(input), ...tags },
    createdAt: input.createdAt ?? new Date().toISOString()
  }
}

function eventsFromRecords(input: SocialImportTelemetryInput): SocialImportTelemetryEvent[] {
  const records = input.stagedRecords ?? []
  const counts = records.reduce<Map<string, number>>((map, record) => {
    const key = JSON.stringify({
      bucketId: record.bucketId,
      recordKind: record.kind,
      privacyClass: record.privacyClass
    })
    map.set(key, (map.get(key) ?? 0) + 1)
    return map
  }, new Map())

  return [...counts.entries()].map(([key, value]) =>
    createEvent(input, 'social.import.stage.records', value, 'count', JSON.parse(key))
  )
}

function eventsFromSummary(input: SocialImportTelemetryInput): SocialImportTelemetryEvent[] {
  const summary = input.stagingSummary
  if (!summary) return []

  return [
    createEvent(input, 'social.import.stage.records', summary.totalRecords, 'count'),
    createEvent(input, 'social.import.stage.warnings', summary.totalWarnings, 'count'),
    createEvent(input, 'social.import.stage.ignored', summary.totalIgnored, 'count')
  ]
}

function eventsFromStoragePlan(input: SocialImportTelemetryInput): SocialImportTelemetryEvent[] {
  const storagePlan = input.storagePlan
  if (!storagePlan) return []

  return [
    createEvent(
      input,
      'social.import.storage.archive_bytes',
      storagePlan.archiveByteSize,
      'bytes',
      {
        status: storagePlan.mode
      }
    ),
    createEvent(
      input,
      'social.import.storage.entry_blobs',
      storagePlan.entryBlobPaths.length,
      'count',
      {
        status: storagePlan.mode
      }
    )
  ]
}

function eventsFromCommit(input: SocialImportTelemetryInput): SocialImportTelemetryEvent[] {
  const summary = input.commitSummary
  if (!summary) return []

  return [
    createEvent(input, 'social.import.commit.created', summary.created, 'count'),
    createEvent(input, 'social.import.commit.updated', summary.updated, 'count'),
    createEvent(input, 'social.import.commit.unchanged', summary.unchanged, 'count')
  ]
}

/**
 * Build redacted local telemetry events. Raw content, source paths, handles, URLs,
 * and source record payloads are intentionally omitted.
 */
export function createSocialImportTelemetryEvents(
  input: SocialImportTelemetryInput
): SocialImportTelemetryEvent[] {
  return [
    ...eventsFromSummary(input),
    ...eventsFromRecords(input),
    ...(typeof input.stageDurationMs === 'number'
      ? [createEvent(input, 'social.import.stage.duration', input.stageDurationMs, 'ms')]
      : []),
    ...eventsFromStoragePlan(input),
    ...eventsFromCommit(input),
    ...(typeof input.commitDurationMs === 'number'
      ? [createEvent(input, 'social.import.commit.duration', input.commitDurationMs, 'ms')]
      : [])
  ]
}
