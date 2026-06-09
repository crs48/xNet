/**
 * Shared visual-preview derivation for saved view rows.
 */

import type { SavedViewQueryResult } from '../hooks/useSavedView'
import type { ExternalReferenceProvider, SavedViewDescriptor } from '@xnetjs/data'
import { parseExternalReferenceUrl } from '@xnetjs/data'

export type SavedViewVisualPreviewKind =
  | 'content'
  | 'actor'
  | 'interaction'
  | 'message'
  | 'collection'
  | 'reference'
  | 'record'

export type SavedViewVisualPreviewPrivacy = 'private' | 'shared' | 'public' | 'unknown'

export type SavedViewVisualWorkspaceLayout =
  | { kind: 'grid'; groupBy?: string; sortBy?: string }
  | { kind: 'timeline'; timeField: string; laneBy?: string }
  | { kind: 'cluster'; groupBy: string; sizeBy?: string }
  | {
      kind: 'graph'
      lensId?: string
      algorithm: 'layered' | 'radial' | 'force' | 'stress'
    }
  | { kind: 'collection-board'; collectionField: string }

export type SavedViewVisualPreviewCreator = {
  id?: string
  label: string
  url?: string
}

export type SavedViewVisualPreviewRelationship = {
  kind: string
  targetNodeId: string
  label?: string
}

export type SavedViewVisualPreviewModel = {
  id: string
  sourceNodeId: string
  sourceSchemaId: string
  kind: SavedViewVisualPreviewKind
  platform: string
  title: string
  subtitle?: string
  creator?: SavedViewVisualPreviewCreator
  timestamp?: string
  timestampMs?: number
  url?: string
  thumbnailUrl?: string
  embedUrl?: string
  provider?: ExternalReferenceProvider
  privacy: SavedViewVisualPreviewPrivacy
  metrics: Record<string, number>
  relationships: SavedViewVisualPreviewRelationship[]
  source: {
    queryId?: string
    rowRole?: string
    schemaName?: string
    sourceRecordId?: string
    importRunId?: string
  }
}

export type SavedViewVisualTimelineBucket = {
  key: string
  label: string
  startMs: number
  count: number
  previews: SavedViewVisualPreviewModel[]
}

export type SavedViewCanvasProjectionNode = {
  id: string
  schemaId: string
  kind:
    | 'actor'
    | 'content'
    | 'interaction'
    | 'conversation'
    | 'message'
    | 'collection'
    | 'collection-item'
    | 'source-record'
  title: string
  subtitle?: string
  platform?: string
  privacyClass?: string
  groupKey?: string
}

const TITLE_FIELDS = [
  'title',
  'displayName',
  'targetTitle',
  'textPreview',
  'handle',
  'platformContentId',
  'platformCollectionId',
  'platformActorId',
  'value'
] as const

const URL_FIELDS = [
  'canonicalUrl',
  'platformUrl',
  'profileUrl',
  'url',
  'sourceUrl',
  'value'
] as const

const TIMESTAMP_FIELDS = [
  'publishedAt',
  'observedAt',
  'sentAt',
  'startedAt',
  'lastMessageAt',
  'importedAt',
  'createdAt',
  'updatedAt'
] as const

const NUMBER_METRIC_FIELDS = [
  'itemCount',
  'messageCount',
  'count',
  'likeCount',
  'replyCount',
  'viewCount',
  'confidence'
] as const

const RELATIONSHIP_FIELDS = [
  ['authorActor', 'author'] as const,
  ['actor', 'actor'] as const,
  ['target', 'target'] as const,
  ['targetAuthorActor', 'target-author'] as const,
  ['senderActor', 'sender'] as const,
  ['conversation', 'conversation'] as const,
  ['parentContent', 'parent'] as const,
  ['parentMessage', 'parent-message'] as const,
  ['collection', 'collection'] as const,
  ['item', 'item'] as const,
  ['sourceRecord', 'source-record'] as const,
  ['sourceArchive', 'source-archive'] as const
] as const

const MAX_TITLE_LENGTH = 140
const MAX_SUBTITLE_LENGTH = 180

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function numberValue(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

function firstStringField(
  row: Readonly<Record<string, unknown>>,
  fields: readonly string[]
): string | null {
  for (const field of fields) {
    const value = stringValue(row[field])
    if (value) return value
  }

  return null
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  const raw = stringValue(value)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function parseJsonArray(value: unknown): unknown[] {
  const raw = stringValue(value)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function urlFromUnknown(value: unknown): string | null {
  const raw = stringValue(value)
  if (!raw) return null

  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

function firstUrlField(row: Readonly<Record<string, unknown>>): string | null {
  for (const field of URL_FIELDS) {
    const url = urlFromUnknown(row[field])
    if (url) return url
  }

  return null
}

function firstExternalRefUrl(row: Readonly<Record<string, unknown>>): string | null {
  const refs = parseJsonArray(row.externalRefsJson)

  for (const ref of refs) {
    if (typeof ref === 'string') {
      const url = urlFromUnknown(ref)
      if (url) return url
    }

    if (ref && typeof ref === 'object') {
      const record = ref as Record<string, unknown>
      const url = urlFromUnknown(record.url) ?? urlFromUnknown(record.href)
      if (url) return url
    }
  }

  return null
}

function timestampFor(row: Readonly<Record<string, unknown>>): {
  timestamp?: string
  timestampMs?: number
} {
  for (const field of TIMESTAMP_FIELDS) {
    const value = row[field]
    const numeric = numberValue(value)
    if (numeric !== null && numeric > 0) {
      return { timestamp: new Date(numeric).toISOString(), timestampMs: numeric }
    }

    const raw = stringValue(value)
    if (!raw) continue

    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) {
      return { timestamp: new Date(parsed).toISOString(), timestampMs: parsed }
    }
  }

  return {}
}

function visualKindFor(
  row: Readonly<Record<string, unknown>>,
  query?: Pick<SavedViewQueryResult, 'rowRole' | 'schemaName'> | null
): SavedViewVisualPreviewKind {
  const roleText = `${query?.rowRole ?? ''} ${query?.schemaName ?? ''}`.toLowerCase()
  if (roleText.includes('actor') || stringValue(row.displayName) || stringValue(row.handle)) {
    return 'actor'
  }
  if (roleText.includes('interaction') || stringValue(row.interactionKind)) return 'interaction'
  if (roleText.includes('message') || stringValue(row.messageKind)) return 'message'
  if (roleText.includes('collection') || stringValue(row.collectionKind)) return 'collection'
  if (roleText.includes('content') || stringValue(row.contentKind)) return 'content'
  if (firstExternalRefUrl(row)) return 'reference'

  return 'record'
}

function platformFor(row: Readonly<Record<string, unknown>>, url: string | null): string {
  const platform = stringValue(row.platform)
  if (platform) return platform

  if (!url) return 'generic'
  return parseExternalReferenceUrl(url)?.provider ?? 'generic'
}

function privacyFor(row: Readonly<Record<string, unknown>>): SavedViewVisualPreviewPrivacy {
  const privacyClass = stringValue(row.privacyClass)?.toLowerCase()
  const visibility = stringValue(row.visibility)?.toLowerCase()

  if (privacyClass === 'public' || visibility === 'public') return 'public'
  if (privacyClass === 'shared' || visibility === 'shared') return 'shared'
  if (privacyClass === 'private' || visibility === 'private') return 'private'
  return 'unknown'
}

function subtitleFor(input: {
  row: Readonly<Record<string, unknown>>
  kind: SavedViewVisualPreviewKind
  platform: string
  timestamp?: string
}): string | undefined {
  const parts = [
    stringValue(input.row.contentKind),
    stringValue(input.row.interactionKind),
    stringValue(input.row.messageKind),
    stringValue(input.row.collectionKind),
    stringValue(input.row.actorKind),
    input.platform !== 'generic' ? input.platform : null,
    input.timestamp ? new Date(input.timestamp).toLocaleDateString() : null
  ].filter((part): part is string => Boolean(part))

  if (parts.length === 0) return undefined

  return truncate([...new Set(parts)].join(' / '), MAX_SUBTITLE_LENGTH)
}

function creatorFor(
  row: Readonly<Record<string, unknown>>
): SavedViewVisualPreviewCreator | undefined {
  const label =
    stringValue(row.actorHandle) ??
    stringValue(row.targetAuthorHandle) ??
    stringValue(row.senderHandle) ??
    stringValue(row.handle) ??
    stringValue(row.observedBy)
  if (!label) return undefined

  const id =
    stringValue(row.authorActor) ??
    stringValue(row.targetAuthorActor) ??
    stringValue(row.senderActor) ??
    stringValue(row.actor) ??
    undefined
  const url = urlFromUnknown(row.profileUrl) ?? undefined

  return {
    ...(id ? { id } : {}),
    label,
    ...(url ? { url } : {})
  }
}

function thumbnailFromMetadata(
  row: Readonly<Record<string, unknown>>,
  url: string | null
): string | undefined {
  const metadata = parseJsonObject(row.metadataJson)
  const metadataUrl =
    urlFromUnknown(metadata?.thumbnailUrl) ??
    urlFromUnknown(metadata?.thumbnail) ??
    urlFromUnknown(metadata?.imageUrl) ??
    urlFromUnknown(metadata?.image) ??
    urlFromUnknown(metadata?.mediaUrl)

  if (metadataUrl) return metadataUrl

  const descriptor = url ? parseExternalReferenceUrl(url) : null
  if (descriptor?.provider === 'youtube' && descriptor.refId) {
    return `https://img.youtube.com/vi/${descriptor.refId}/hqdefault.jpg`
  }

  return undefined
}

function metricsFor(row: Readonly<Record<string, unknown>>): Record<string, number> {
  return Object.fromEntries(
    NUMBER_METRIC_FIELDS.flatMap((field) => {
      const value = numberValue(row[field])
      return value === null ? [] : [[field, value] as const]
    })
  )
}

function relationshipsFor(
  row: Readonly<Record<string, unknown>>
): SavedViewVisualPreviewRelationship[] {
  return RELATIONSHIP_FIELDS.flatMap(([field, kind]) => {
    const targetNodeId = stringValue(row[field])
    return targetNodeId ? [{ kind, targetNodeId }] : []
  })
}

function titleFor(
  row: Readonly<Record<string, unknown>>,
  kind: SavedViewVisualPreviewKind,
  url: string | null
): string {
  const direct = firstStringField(row, TITLE_FIELDS)
  if (direct) return truncate(direct.replace(/\s+/g, ' '), MAX_TITLE_LENGTH)

  const descriptor = url ? parseExternalReferenceUrl(url) : null
  if (descriptor?.title) return truncate(descriptor.title, MAX_TITLE_LENGTH)

  const id = stringValue(row.id)
  return id ? `${kind} ${id.slice(0, 8)}` : kind
}

function sourceFor(
  row: Readonly<Record<string, unknown>>,
  query?: Pick<SavedViewQueryResult, 'queryId' | 'rowRole' | 'schemaName'> | null
): SavedViewVisualPreviewModel['source'] {
  const sourceRecordId = stringValue(row.sourceRecordId)
  const importRunId = stringValue(row.importRunId)

  return {
    ...(query?.queryId ? { queryId: query.queryId } : {}),
    ...(query?.rowRole ? { rowRole: query.rowRole } : {}),
    ...(query?.schemaName ? { schemaName: query.schemaName } : {}),
    ...(sourceRecordId ? { sourceRecordId } : {}),
    ...(importRunId ? { importRunId } : {})
  }
}

export function deriveSavedViewVisualPreview(
  row: Readonly<Record<string, unknown>>,
  query?: Pick<SavedViewQueryResult, 'queryId' | 'rowRole' | 'schemaId' | 'schemaName'> | null
): SavedViewVisualPreviewModel {
  const url = firstUrlField(row) ?? firstExternalRefUrl(row)
  const descriptor = url ? parseExternalReferenceUrl(url) : null
  const timestamp = timestampFor(row)
  const kind = visualKindFor(row, query)
  const platform = platformFor(row, url)
  const title = titleFor(row, kind, url)

  return {
    id: `${query?.queryId ?? 'query'}:${stringValue(row.id) ?? title}`,
    sourceNodeId: stringValue(row.id) ?? title,
    sourceSchemaId: stringValue(row.schemaId) ?? query?.schemaId ?? '',
    kind,
    platform,
    title,
    ...(subtitleFor({ row, kind, platform, timestamp: timestamp.timestamp })
      ? {
          subtitle: subtitleFor({ row, kind, platform, timestamp: timestamp.timestamp })
        }
      : {}),
    ...(creatorFor(row) ? { creator: creatorFor(row) } : {}),
    ...timestamp,
    ...(url ? { url } : {}),
    ...(thumbnailFromMetadata(row, url) ? { thumbnailUrl: thumbnailFromMetadata(row, url) } : {}),
    ...(descriptor?.embedUrl ? { embedUrl: descriptor.embedUrl } : {}),
    ...(descriptor?.provider ? { provider: descriptor.provider } : {}),
    privacy: privacyFor(row),
    metrics: metricsFor(row),
    relationships: relationshipsFor(row),
    source: sourceFor(row, query)
  }
}

export function deriveSavedViewVisualPreviews(
  rows: readonly Readonly<Record<string, unknown>>[],
  query?: Pick<SavedViewQueryResult, 'queryId' | 'rowRole' | 'schemaId' | 'schemaName'> | null
): SavedViewVisualPreviewModel[] {
  return rows.map((row) => deriveSavedViewVisualPreview(row, query))
}

export function createSavedViewVisualPreviewFingerprint(input: {
  descriptor?: SavedViewDescriptor | string | null
  query?: Pick<SavedViewQueryResult, 'queryId' | 'schemaId'> | null
  rows: readonly Readonly<Record<string, unknown>>[]
}): string {
  const descriptorKey =
    typeof input.descriptor === 'string'
      ? input.descriptor
      : input.descriptor
        ? JSON.stringify(input.descriptor)
        : ''

  const rowKey = input.rows
    .map((row, index) => {
      const id = stringValue(row.id) ?? String(index)
      const version =
        stringValue(row.updatedAt) ??
        stringValue(row.importedAt) ??
        stringValue(row.createdAt) ??
        String(numberValue(row.updatedAt) ?? numberValue(row.importedAt) ?? index)
      return `${id}:${version}`
    })
    .join('|')

  return [
    descriptorKey,
    input.query?.queryId ?? '',
    input.query?.schemaId ?? '',
    input.rows.length,
    rowKey
  ].join('::')
}

export function deriveSavedViewTimelineBuckets(
  previews: readonly SavedViewVisualPreviewModel[]
): SavedViewVisualTimelineBucket[] {
  const buckets = previews.reduce<Map<number, SavedViewVisualPreviewModel[]>>(
    (current, preview) => {
      if (preview.timestampMs === undefined) return current

      const date = new Date(preview.timestampMs)
      const startMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
      current.set(startMs, [...(current.get(startMs) ?? []), preview])
      return current
    },
    new Map()
  )

  return [...buckets.entries()]
    .sort(([left], [right]) => right - left)
    .map(([startMs, bucketPreviews]) => ({
      key: `month:${startMs}`,
      label: new Date(startMs).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
      }),
      startMs,
      count: bucketPreviews.length,
      previews: bucketPreviews
    }))
}

export function createSavedViewCanvasProjectionNodes(
  previews: readonly SavedViewVisualPreviewModel[],
  options: { limit?: number; groupBy?: 'platform' | 'kind' | 'creator' | 'privacy' } = {}
): SavedViewCanvasProjectionNode[] {
  const limit = options.limit ?? 120
  const groupBy = options.groupBy ?? 'platform'

  return previews.slice(0, limit).map((preview) => ({
    id: preview.sourceNodeId,
    schemaId: preview.sourceSchemaId,
    kind: canvasNodeKindFor(preview.kind),
    title: preview.title,
    ...(preview.subtitle ? { subtitle: preview.subtitle } : {}),
    ...(preview.platform ? { platform: preview.platform } : {}),
    privacyClass: preview.privacy,
    groupKey: groupKeyFor(preview, groupBy)
  }))
}

function canvasNodeKindFor(
  kind: SavedViewVisualPreviewKind
): SavedViewCanvasProjectionNode['kind'] {
  switch (kind) {
    case 'actor':
      return 'actor'
    case 'content':
    case 'reference':
      return 'content'
    case 'interaction':
      return 'interaction'
    case 'message':
      return 'message'
    case 'collection':
      return 'collection'
    case 'record':
      return 'source-record'
  }
}

function groupKeyFor(
  preview: SavedViewVisualPreviewModel,
  groupBy: NonNullable<Parameters<typeof createSavedViewCanvasProjectionNodes>[1]>['groupBy']
): string {
  switch (groupBy) {
    case 'kind':
      return preview.kind
    case 'creator':
      return preview.creator?.label ?? 'unknown creator'
    case 'privacy':
      return preview.privacy
    case 'platform':
    default:
      return preview.platform
  }
}

export function isSavedViewVisualPreviewEmbeddable(preview: SavedViewVisualPreviewModel): boolean {
  return Boolean(preview.embedUrl && preview.url && preview.privacy === 'public')
}

export function hasSavedViewVisualPreviewSensitiveData(
  preview: SavedViewVisualPreviewModel
): boolean {
  return preview.privacy === 'private' || preview.privacy === 'shared'
}

export function savedViewVisualPreviewIsSelfActor(row: Readonly<Record<string, unknown>>): boolean {
  return booleanValue(row.isSelf) === true
}
