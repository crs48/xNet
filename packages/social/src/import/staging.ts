/**
 * Helpers for creating and summarizing staged social records.
 */

import type { SocialPlatform, SocialPrivacyClass, SocialSourceRecordKind } from '../schemas'
import type {
  ArchiveEntryRef,
  ImportSelection,
  StagedCanonicalNodeKind,
  StagedIgnoredSourceRecord,
  StagedSocialNode,
  StagedSocialRecord,
  StagedSourceRecord,
  StagingSummary
} from './types'
import {
  SocialActorSchema,
  SocialCollectionItemSchema,
  SocialCollectionSchema,
  SocialContentSchema,
  SocialConversationSchema,
  SocialIdentityClaimSchema,
  SocialInteractionSchema,
  SocialMessageSchema,
  SocialSourceRecordSchema
} from '../schemas'
import { createSourceRecordHash, createSourceRecordId } from './ids'
import { getPrivacyVisibility } from './privacy'

const schemaIdsByKind: Record<StagedCanonicalNodeKind | 'source-record', string> = {
  'source-record': SocialSourceRecordSchema.schema['@id'],
  actor: SocialActorSchema.schema['@id'],
  'identity-claim': SocialIdentityClaimSchema.schema['@id'],
  content: SocialContentSchema.schema['@id'],
  interaction: SocialInteractionSchema.schema['@id'],
  conversation: SocialConversationSchema.schema['@id'],
  message: SocialMessageSchema.schema['@id'],
  collection: SocialCollectionSchema.schema['@id'],
  'collection-item': SocialCollectionItemSchema.schema['@id']
}

export function createSourceRecord(input: {
  archiveId: string
  importRunId?: string
  platform: SocialPlatform
  bucketId: string
  source: ArchiveEntryRef
  sourceRecordKind: SocialSourceRecordKind
  sourceRecordId: string
  payload: unknown
  privacyClass: SocialPrivacyClass
  warnings?: readonly string[]
}): StagedSourceRecord {
  const sourceRecordHash = createSourceRecordHash({
    platform: input.platform,
    sourcePath: input.source.path,
    sourceRecordId: input.sourceRecordId,
    payload: input.payload
  })
  const deterministicId = createSourceRecordId({
    platform: input.platform,
    archiveId: input.archiveId,
    sourcePath: input.source.path,
    sourceRecordId: input.sourceRecordId
  })

  return {
    kind: 'source-record',
    deterministicId,
    schemaId: schemaIdsByKind['source-record'],
    platform: input.platform,
    bucketId: input.bucketId,
    source: input.source,
    sourceRecordKind: input.sourceRecordKind,
    sourceRecordId: input.sourceRecordId,
    sourceRecordHash,
    privacyClass: input.privacyClass,
    properties: {
      archive: input.archiveId,
      importRun: input.importRunId,
      platform: input.platform,
      sourcePath: input.source.path,
      sourceRecordId: input.sourceRecordId,
      sourceRecordHash,
      sourceRecordKind: input.sourceRecordKind,
      privacyClass: input.privacyClass,
      byteLength: input.source.byteSize,
      ignored: false,
      warningsJson: JSON.stringify(input.warnings ?? []),
      shapeJson: JSON.stringify(describeJsonShape(input.payload))
    },
    warnings: [...(input.warnings ?? [])]
  }
}

export function createIgnoredSourceRecord(
  input: Parameters<typeof createSourceRecord>[0] & { ignoredReason: string }
): StagedIgnoredSourceRecord {
  const sourceRecord = createSourceRecord(input)
  return {
    ...sourceRecord,
    ignored: true,
    ignoredReason: input.ignoredReason,
    properties: {
      ...sourceRecord.properties,
      ignored: true,
      ignoredReason: input.ignoredReason
    }
  }
}

export function createStagedNode(input: {
  kind: StagedCanonicalNodeKind
  deterministicId: string
  platform: SocialPlatform
  bucketId: string
  source: ArchiveEntryRef
  sourceRecordId: string
  privacyClass: SocialPrivacyClass
  properties: Record<string, unknown>
  warnings?: readonly string[]
}): StagedSocialNode {
  return {
    kind: input.kind,
    deterministicId: input.deterministicId,
    schemaId: schemaIdsByKind[input.kind],
    platform: input.platform,
    bucketId: input.bucketId,
    source: input.source,
    sourceRecordId: input.sourceRecordId,
    privacyClass: input.privacyClass,
    properties: {
      platform: input.platform,
      sourceRecord: input.sourceRecordId,
      privacyClass: input.privacyClass,
      visibility: getPrivacyVisibility(input.privacyClass),
      ...input.properties
    },
    warnings: [...(input.warnings ?? [])]
  }
}

export async function collectStagedRecords(
  records: AsyncIterable<StagedSocialRecord>
): Promise<StagedSocialRecord[]> {
  const collected: StagedSocialRecord[] = []
  for await (const record of records) collected.push(record)
  return collected
}

export function filterStagedRecordsBySelection(
  records: readonly StagedSocialRecord[],
  selection?: ImportSelection
): StagedSocialRecord[] {
  if (!selection?.buckets?.length) return [...records]
  const selected = new Set(selection.buckets)
  return records.filter((record) => selected.has(record.bucketId))
}

export function createStagingSummary(records: readonly StagedSocialRecord[]): StagingSummary {
  const bucketIds = [...new Set(records.map((record) => record.bucketId))].sort()
  const bucketSummaries = bucketIds.map((bucketId) => {
    const bucketRecords = records.filter((record) => record.bucketId === bucketId)
    return {
      bucketId,
      totalRecords: bucketRecords.length,
      recordsByKind: countBy(bucketRecords, (record) => record.kind),
      recordsByPrivacyClass: countBy(bucketRecords, (record) => record.privacyClass),
      warningCount: bucketRecords.reduce((count, record) => count + record.warnings.length, 0),
      ignoredCount: bucketRecords.filter((record) => 'ignored' in record && record.ignored).length
    }
  })

  return {
    totalRecords: records.length,
    totalWarnings: records.reduce((count, record) => count + record.warnings.length, 0),
    totalIgnored: records.filter((record) => 'ignored' in record && record.ignored).length,
    bucketSummaries
  }
}

function countBy<T>(items: readonly T[], getKey: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item)
    return { ...counts, [key]: (counts[key] ?? 0) + 1 }
  }, {})
}

function describeJsonShape(value: unknown): unknown {
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      item: value.length > 0 ? describeJsonShape(value[0]) : undefined
    }
  }
  if (!value || typeof value !== 'object') return { type: typeof value }

  const record = value as Record<string, unknown>
  return {
    type: 'object',
    keys: Object.keys(record).sort(),
    properties: Object.fromEntries(
      Object.entries(record)
        .slice(0, 25)
        .map(([key, child]) => [
          key,
          Array.isArray(child) ? `array(${child.length})` : typeof child
        ])
    )
  }
}
