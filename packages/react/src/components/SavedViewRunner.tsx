/**
 * @xnetjs/react - Generic saved view execution surface.
 */

import type {
  SavedViewQueryResult,
  SavedViewSchemaRegistry,
  UseSavedViewOptions,
  UseSavedViewResult
} from '../hooks/useSavedView'
import type {
  QueryASTNodeQuery,
  QueryASTOrderBy,
  QueryASTPredicate,
  SavedViewDescriptor,
  SavedViewFeedDensity,
  SavedViewFeedLayout,
  SavedViewPresentationHint
} from '@xnetjs/data'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode, JSX } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Columns3,
  ExternalLink,
  FileSearch,
  Filter,
  GalleryVerticalEnd,
  GitBranch,
  Image,
  Info,
  LayoutGrid,
  Link,
  Loader2,
  MessageSquare,
  Network,
  Play,
  RefreshCw,
  Search,
  Save,
  Shield,
  Table,
  UserRound,
  X
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useSavedView } from '../hooks/useSavedView'
import { SavedViewVisualFeed, type SavedViewFeedEnrichmentAdapter } from './SavedViewVisualFeed'
import {
  createSavedViewCanvasProjectionNodes,
  deriveCachedSavedViewVisualPreviews,
  deriveSavedViewTimelineBuckets,
  hasSavedViewVisualPreviewSensitiveData,
  isSavedViewVisualPreviewEmbeddable,
  type SavedViewCanvasProjectionNode,
  type SavedViewVisualPreviewKind,
  type SavedViewVisualPreviewModel,
  type SavedViewVisualTimelineBucket,
  type SavedViewVisualWorkspaceLayout
} from './savedViewVisualPreview'

export type SavedViewRunnerProps = {
  descriptor?: SavedViewDescriptor | string | null
  registry: SavedViewSchemaRegistry
  title?: string | null
  description?: string | null
  fallbackId?: string | null
  resetKey?: string | null
  className?: string
  emptyLabel?: string
  pageSizes?: readonly number[]
  initialPageSize?: number
  options?: Omit<UseSavedViewOptions, 'queryOverrides' | 'search'>
  onSaveLens?: (draft: SavedViewLensDraft) => void | Promise<void>
  saveLensLabel?: string
  onOpenVisualCanvasProjection?: (
    request: SavedViewVisualCanvasProjectionRequest
  ) => void | Promise<void>
  feedEnrichment?: SavedViewFeedEnrichmentAdapter
  /**
   * Optional per-item wrapper for the visual renderers (cards mode), keyed by a
   * preview's source node id. The host uses it to route each item through its
   * moderation render gate without this package depending on it. Default: no-op
   * (content rendered unwrapped, exactly as before).
   */
  wrapItem?: (nodeId: string, content: ReactNode) => ReactNode
}

export type SavedViewResultTableProps = {
  query: SavedViewQueryResult | null
  columns: readonly string[]
  expandedRowId: string | null
  onToggleRow: (rowId: string) => void
  loadingLabel?: string
  emptyLabel?: string
  formatValue?: (input: {
    column: string
    value: unknown
    row: Record<string, unknown>
  }) => ReactNode
}

export type SavedViewFacetSelection = Record<string, readonly string[]>

export type SavedViewFacetValueSummary = {
  valueKey: string
  label: string
  count: number
}

export type SavedViewFacetSummary = {
  field: string
  values: SavedViewFacetValueSummary[]
  totalValues: number
}

export type SavedViewDateBucketInterval = 'day' | 'month' | 'year'

export type SavedViewDateBucketSummary = {
  bucketKey: string
  label: string
  startMs: number
  endMs: number
  count: number
}

export type SavedViewDateBucketFieldSummary = {
  field: string
  interval: SavedViewDateBucketInterval
  buckets: SavedViewDateBucketSummary[]
  minMs: number
  maxMs: number
  totalRows: number
}

export type SavedViewDateBrushSelection = {
  field: string | null
  bucketKeys: readonly string[]
}

export type SavedViewInspectorItemKind = 'field' | 'relation' | 'source' | 'import'

export type SavedViewInspectorItem = {
  key: string
  label: string
  value: unknown
  formatted: string
  kind: SavedViewInspectorItemKind
}

export type SavedViewRowInspectorModel = {
  rowId: string
  schemaId: string
  rowRole: string | null
  fields: SavedViewInspectorItem[]
  relations: SavedViewInspectorItem[]
  sourceRecords: SavedViewInspectorItem[]
  importRuns: SavedViewInspectorItem[]
  rawJson: string
}

export type SavedViewPrivacyChipTone = 'safe' | 'neutral' | 'warning'

export type SavedViewPrivacyChip = {
  privacyClass: string
  label: string
  count: number
  tone: SavedViewPrivacyChipTone
}

export type SavedViewAggregationCacheIdentity = {
  queryId?: string | null
  schemaId?: string | null
}

export type SavedViewSortDirection = 'asc' | 'desc'

export type SavedViewLensDraft = {
  title: string
  description: string
  descriptor: SavedViewDescriptor
  queryId: string
  sourceTitle: string
  stateSummary: {
    facetFields: string[]
    dateField: string | null
    dateBucketCount: number
    sortField: string | null
    sortDirection: SavedViewSortDirection | null
    pageSize: number
  }
}

export type SavedViewGraphLensSelection = {
  queryId: string
  rowId: string
}

export type SavedViewGraphLensNode = SavedViewGraphLensSelection & {
  label: string
  detail: string
  rowRole: string
  schemaId: string
  privacyClass: string | null
  sourceRecordId: string | null
}

export type SavedViewPresentationMode = 'table' | 'cards' | 'timeline' | 'canvas' | 'graph' | 'feed'

export type { SavedViewFeedDensity, SavedViewFeedLayout } from '@xnetjs/data'

type SavedViewPresentationModeOption = {
  mode: SavedViewPresentationMode
  label: string
  description: string
  icon: LucideIcon
  enabled: boolean
}

export type SavedViewVisualLayoutId =
  | 'grid'
  | 'timeline'
  | 'creator-clusters'
  | 'platform-lanes'
  | 'content-type-lanes'
  | 'date-bands'
  | 'collection-board'
  | 'graph'

export type SavedViewVisualLayoutOption = {
  id: SavedViewVisualLayoutId
  label: string
  description: string
  icon: LucideIcon
  enabled: boolean
  workspaceLayout: SavedViewVisualWorkspaceLayout
  projectionGroupBy: 'platform' | 'kind' | 'creator' | 'privacy'
}

export type SavedViewVisualCanvasProjectionRequest = {
  id: string
  title: string
  description?: string | null
  descriptor?: SavedViewDescriptor | string | null
  sourceQueryId?: string | null
  sourceSchemaId?: string | null
  layout: {
    id: SavedViewVisualLayoutId
    label: string
    workspaceLayout: SavedViewVisualWorkspaceLayout
    projectionGroupBy: SavedViewVisualLayoutOption['projectionGroupBy']
  }
  nodes: SavedViewCanvasProjectionNode[]
  sourceNodeIds: string[]
  omittedNodeCount: number
  previewCount: number
}

type SortDirection = SavedViewSortDirection

const DEFAULT_PAGE_SIZE = 25
const DEFAULT_PAGE_SIZES = [10, 25, 50, 100] as const
const DEFAULT_VISUAL_GRID_COLUMNS = 3
const VISUAL_GRID_ROW_HEIGHT = 318
const VISUAL_GRID_OVERSCAN = 4
const VISUAL_CANVAS_PROJECTION_LIMIT = 120
const VISUAL_GRAPH_EDGE_LIMIT = 96
const TIMELINE_PREVIEW_LIMIT_PER_BUCKET = 18
const MAX_FACET_FIELDS = 5
const MAX_FACET_VALUES = 8
const MAX_FACET_DISTINCT_VALUES = 16
const MAX_DATE_BUCKET_FIELDS = 4
const MAX_DATE_BUCKETS = 18
const MAX_GRAPH_LENS_NODES_PER_QUERY = 6
const MAX_AGGREGATION_CACHE_ENTRIES = 48
const DAY_MS = 86_400_000
const SYSTEM_COLUMNS = new Set([
  'deleted',
  'createdBy',
  'updatedBy',
  '_migrationInfo',
  '_migratedFrom',
  '_unknown',
  '_unknownSchema',
  '_schemaVersion'
])
const PREFERRED_COLUMNS = [
  'title',
  'displayName',
  'handle',
  'platform',
  'contentKind',
  'interactionKind',
  'messageKind',
  'collectionKind',
  'privacyClass',
  'visibility',
  'publishedAt',
  'observedAt',
  'sentAt',
  'importedAt',
  'createdAt',
  'updatedAt',
  'id'
]
const PREFERRED_FACET_COLUMNS = [
  'platform',
  'contentKind',
  'interactionKind',
  'messageKind',
  'collectionKind',
  'privacyClass',
  'visibility',
  'rowRole',
  'schemaName'
]
const PREFERRED_DATE_COLUMNS = [
  'publishedAt',
  'observedAt',
  'sentAt',
  'importedAt',
  'createdAt',
  'updatedAt'
]
const LOW_SIGNAL_FACET_COLUMNS = new Set([
  'id',
  'schemaId',
  'title',
  'body',
  'text',
  'content',
  'url',
  'uri',
  'sourceUrl',
  'externalId',
  'createdAt',
  'updatedAt',
  'publishedAt',
  'observedAt',
  'sentAt',
  'importedAt'
])
const INSPECTOR_PRIMARY_FIELDS = [
  'title',
  'displayName',
  'handle',
  'platform',
  'contentKind',
  'interactionKind',
  'messageKind',
  'collectionKind',
  'privacyClass',
  'visibility'
]
const INSPECTOR_SYSTEM_FIELDS = new Set([...SYSTEM_COLUMNS, 'id', 'schemaId'])
const NON_SENSITIVE_PRIVACY_CLASSES = new Set(['public', 'unknown'])
const savedViewFacetSummaryCache = new Map<string, SavedViewFacetSummary[]>()
const savedViewDateBucketSummaryCache = new Map<string, SavedViewDateBucketFieldSummary[]>()

function classNames(values: readonly (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}

function queryRowCount(query: SavedViewQueryResult | null): string {
  if (!query) return '-'
  return metricValueLabel(query.totalCount ?? query.data.length)
}

function metricValueLabel(value: number | null): string {
  return value === null ? '-' : value.toLocaleString()
}

function descriptorKeyFor(descriptor: SavedViewDescriptor | string | null | undefined): string {
  if (!descriptor) return ''
  return typeof descriptor === 'string' ? descriptor : JSON.stringify(descriptor)
}

/**
 * Derive a stable display column list from flattened schema query rows.
 */
export function deriveSavedViewColumns(rows: readonly Record<string, unknown>[]): string[] {
  const discovered = rows
    .flatMap((row) => Object.keys(row))
    .filter((key) => !SYSTEM_COLUMNS.has(key))
  const unique = [...new Set(discovered)]
  const preferred = PREFERRED_COLUMNS.filter((column) => unique.includes(column))
  const rest = unique
    .filter((column) => !preferred.includes(column))
    .sort((left, right) => left.localeCompare(right))

  return [...preferred, ...rest]
}

/**
 * Format primitive and structured cell values for read-only schema query tables.
 */
export function formatSavedViewCellValue(column: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number' && column.endsWith('At') && value > 1_000_000_000_000) {
    return new Date(value).toLocaleString()
  }
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length} items`
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Compute low-cardinality facets over loaded schema query rows.
 */
export function deriveSavedViewFacetSummaries(
  rows: readonly Record<string, unknown>[],
  columns: readonly string[]
): SavedViewFacetSummary[] {
  const candidateColumns = columns
    .filter((column) => !LOW_SIGNAL_FACET_COLUMNS.has(column))
    .map((column) => ({
      column,
      score: PREFERRED_FACET_COLUMNS.includes(column)
        ? PREFERRED_FACET_COLUMNS.indexOf(column)
        : PREFERRED_FACET_COLUMNS.length + column.length
    }))
    .sort((left, right) => left.score - right.score || left.column.localeCompare(right.column))
    .map((candidate) => candidate.column)

  return candidateColumns
    .flatMap((field) => {
      const counts = rows.reduce<Map<string, SavedViewFacetValueSummary>>((current, row) => {
        const value = row[field]
        if (!isFacetScalarValue(value)) return current

        const valueKey = facetValueKey(value)
        const previous = current.get(valueKey)
        current.set(valueKey, {
          valueKey,
          label: facetValueLabel(value),
          count: (previous?.count ?? 0) + 1
        })

        return current
      }, new Map())
      const values = [...counts.values()].sort(
        (left, right) => right.count - left.count || left.label.localeCompare(right.label)
      )

      if (values.length === 0 || values.length > MAX_FACET_DISTINCT_VALUES) return []

      return [
        {
          field,
          values: values.slice(0, MAX_FACET_VALUES),
          totalValues: values.length
        }
      ]
    })
    .slice(0, MAX_FACET_FIELDS)
}

function primitiveCacheValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return value === null || value === undefined ? '' : JSON.stringify(value)
}

function rowAggregationFingerprint(row: Record<string, unknown>, index: number): string {
  const id = primitiveCacheValue(row.id)
  const version =
    primitiveCacheValue(row.updatedAt) ||
    primitiveCacheValue(row.importedAt) ||
    primitiveCacheValue(row.createdAt)

  return id ? `${id}:${version}` : `${index}:${JSON.stringify(row)}`
}

export function createSavedViewAggregationCacheKey(input: {
  rows: readonly Record<string, unknown>[]
  columns: readonly string[]
  identity?: SavedViewAggregationCacheIdentity | null
  kind: 'facets' | 'date-buckets'
}): string {
  const rowFingerprint = input.rows
    .map((row, index) => rowAggregationFingerprint(row, index))
    .join('|')

  return [
    input.kind,
    input.identity?.queryId ?? '',
    input.identity?.schemaId ?? '',
    input.columns.join(','),
    input.rows.length,
    rowFingerprint
  ].join('::')
}

function readAggregationCache<T>(cache: Map<string, T>, key: string): T | null {
  const cached = cache.get(key)
  if (!cached) return null

  cache.delete(key)
  cache.set(key, cached)
  return cached
}

function writeAggregationCache<T>(cache: Map<string, T>, key: string, value: T): T {
  cache.set(key, value)

  while (cache.size > MAX_AGGREGATION_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    cache.delete(oldestKey)
  }

  return value
}

export function deriveCachedSavedViewFacetSummaries(input: {
  rows: readonly Record<string, unknown>[]
  columns: readonly string[]
  identity?: SavedViewAggregationCacheIdentity | null
}): SavedViewFacetSummary[] {
  const key = createSavedViewAggregationCacheKey({
    rows: input.rows,
    columns: input.columns,
    identity: input.identity,
    kind: 'facets'
  })
  const cached = readAggregationCache(savedViewFacetSummaryCache, key)
  if (cached) return cached

  return writeAggregationCache(
    savedViewFacetSummaryCache,
    key,
    deriveSavedViewFacetSummaries(input.rows, input.columns)
  )
}

/**
 * Filter loaded schema query rows by facet value keys.
 */
export function filterSavedViewRowsByFacets<T extends Record<string, unknown>>(
  rows: readonly T[],
  selection: SavedViewFacetSelection
): T[] {
  const activeEntries = Object.entries(selection).filter(([, values]) => values.length > 0)
  if (activeEntries.length === 0) return [...rows]

  return rows.filter((row) =>
    activeEntries.every(([field, values]) => values.includes(facetValueKey(row[field])))
  )
}

/**
 * Compute date buckets over loaded schema query rows.
 */
export function deriveSavedViewDateBucketSummaries(
  rows: readonly Record<string, unknown>[],
  columns: readonly string[]
): SavedViewDateBucketFieldSummary[] {
  const candidateColumns = columns
    .filter((column) => isDateColumnName(column))
    .map((column) => ({
      column,
      score: PREFERRED_DATE_COLUMNS.includes(column)
        ? PREFERRED_DATE_COLUMNS.indexOf(column)
        : PREFERRED_DATE_COLUMNS.length + column.length
    }))
    .sort((left, right) => left.score - right.score || left.column.localeCompare(right.column))
    .map((candidate) => candidate.column)

  return candidateColumns
    .flatMap((field) => {
      const timestamps = rows.flatMap((row) => {
        const timestamp = parseSavedViewDateValue(row[field])
        return timestamp === null ? [] : [timestamp]
      })

      if (timestamps.length === 0) return []

      const minMs = Math.min(...timestamps)
      const maxMs = Math.max(...timestamps)
      const interval = intervalForDateRange(minMs, maxMs)
      const counts = timestamps.reduce<Map<number, number>>((current, timestamp) => {
        const bucketStart = dateBucketStartMs(timestamp, interval)
        current.set(bucketStart, (current.get(bucketStart) ?? 0) + 1)
        return current
      }, new Map())
      const buckets = [...counts.entries()]
        .sort(([left], [right]) => left - right)
        .slice(0, MAX_DATE_BUCKETS)
        .map(([startMs, count]) => ({
          bucketKey: dateBucketKey(interval, startMs),
          label: dateBucketLabel(startMs, interval),
          startMs,
          endMs: dateBucketEndMs(startMs, interval),
          count
        }))

      if (buckets.length === 0) return []

      return [
        {
          field,
          interval,
          buckets,
          minMs,
          maxMs,
          totalRows: timestamps.length
        }
      ]
    })
    .slice(0, MAX_DATE_BUCKET_FIELDS)
}

export function deriveCachedSavedViewDateBucketSummaries(input: {
  rows: readonly Record<string, unknown>[]
  columns: readonly string[]
  identity?: SavedViewAggregationCacheIdentity | null
}): SavedViewDateBucketFieldSummary[] {
  const key = createSavedViewAggregationCacheKey({
    rows: input.rows,
    columns: input.columns,
    identity: input.identity,
    kind: 'date-buckets'
  })
  const cached = readAggregationCache(savedViewDateBucketSummaryCache, key)
  if (cached) return cached

  return writeAggregationCache(
    savedViewDateBucketSummaryCache,
    key,
    deriveSavedViewDateBucketSummaries(input.rows, input.columns)
  )
}

/**
 * Filter loaded schema query rows by a selected date bucket brush.
 */
export function filterSavedViewRowsByDateBrush<T extends Record<string, unknown>>(
  rows: readonly T[],
  selection: SavedViewDateBrushSelection
): T[] {
  if (!selection.field || selection.bucketKeys.length === 0) return [...rows]

  const interval = intervalFromDateBucketKey(selection.bucketKeys[0])
  if (!interval) return [...rows]

  return rows.filter((row) => {
    const timestamp = parseSavedViewDateValue(row[selection.field ?? ''])
    if (timestamp === null) return false

    return selection.bucketKeys.includes(
      dateBucketKey(interval, dateBucketStartMs(timestamp, interval))
    )
  })
}

/**
 * Build a generic row inspector model from a flattened saved-view result row.
 */
export function deriveSavedViewRowInspector(
  row: Record<string, unknown>,
  query?: SavedViewQueryResult | null
): SavedViewRowInspectorModel {
  const items = Object.entries(row).flatMap(([key, value]) => {
    if (value === undefined || INSPECTOR_SYSTEM_FIELDS.has(key)) return []

    const kind = inspectorItemKind(key)
    return [
      {
        key,
        label: key,
        value,
        formatted: formatSavedViewInspectorValue(key, value),
        kind
      }
    ]
  })

  const sortItems = (values: SavedViewInspectorItem[]): SavedViewInspectorItem[] =>
    [...values].sort((left, right) => {
      const leftPriority = inspectorFieldPriority(left.key)
      const rightPriority = inspectorFieldPriority(right.key)
      return leftPriority - rightPriority || left.key.localeCompare(right.key)
    })

  return {
    rowId: typeof row.id === 'string' ? row.id : '',
    schemaId: typeof row.schemaId === 'string' ? row.schemaId : (query?.schemaId ?? ''),
    rowRole: query?.rowRole ?? query?.schemaName ?? null,
    fields: sortItems(items.filter((item) => item.kind === 'field')),
    relations: sortItems(items.filter((item) => item.kind === 'relation')),
    sourceRecords: sortItems(items.filter((item) => item.kind === 'source')),
    importRuns: sortItems(items.filter((item) => item.kind === 'import')),
    rawJson: JSON.stringify(row, null, 2)
  }
}

/**
 * Derive privacy class chips for the active saved-view result.
 */
export function deriveSavedViewPrivacyChips(
  query: SavedViewQueryResult | null
): SavedViewPrivacyChip[] {
  if (!query) return []

  return Object.entries(query.privacy.counts)
    .filter(([, count]) => count > 0)
    .sort(
      ([leftClass, leftCount], [rightClass, rightCount]) =>
        privacyClassPriority(leftClass) - privacyClassPriority(rightClass) ||
        rightCount - leftCount ||
        leftClass.localeCompare(rightClass)
    )
    .map(([privacyClass, count]) => ({
      privacyClass,
      label: formatPrivacyClassLabel(privacyClass),
      count,
      tone: isSensitivePrivacyClass(privacyClass)
        ? 'warning'
        : privacyClass === 'public'
          ? 'safe'
          : 'neutral'
    }))
}

/**
 * Return a user-facing warning when loaded rows contain non-public data.
 */
export function getSavedViewSensitiveResultWarning(
  query: SavedViewQueryResult | null
): string | null {
  const sensitiveCount = query?.privacy.sensitiveCount ?? 0
  if (sensitiveCount === 0) return null

  return `${sensitiveCount.toLocaleString()} loaded ${pluralize(
    sensitiveCount,
    'row'
  )} include non-public privacy classes.`
}

/**
 * Derive selectable source-backed nodes for a query-set graph lens.
 */
export function deriveSavedViewGraphLensNodes(
  query: SavedViewQueryResult,
  queryId = query.queryId,
  limit = MAX_GRAPH_LENS_NODES_PER_QUERY
): SavedViewGraphLensNode[] {
  return query.data.slice(0, limit).map((row) => {
    const record = row as Record<string, unknown>
    const label = graphLensNodeLabel(record)
    const sourceRecordId = scalarString(record.sourceRecordId)

    return {
      queryId,
      rowId: row.id,
      label,
      detail: graphLensNodeDetail(record, query, sourceRecordId),
      rowRole: query.rowRole,
      schemaId: row.schemaId,
      privacyClass: scalarString(record.privacyClass),
      sourceRecordId
    }
  })
}

/**
 * Build a persisted saved-view descriptor from the current table control state.
 */
export function createSavedViewLensDraft(input: {
  descriptor: SavedViewDescriptor
  queryId: string
  query: SavedViewQueryResult
  facetSelection: SavedViewFacetSelection
  dateBrushSelection: SavedViewDateBrushSelection
  sortField: string
  sortDirection: SavedViewSortDirection
  pageSize: number
  title?: string | null
  description?: string | null
}): SavedViewLensDraft | null {
  const sourceQuery = nodeQueryForSavedLens(input.descriptor.query, input.queryId)
  if (!sourceQuery) return null

  const facetPredicates = facetPredicatesForSavedLens(input.query.data, input.facetSelection)
  const datePredicate = datePredicateForSavedLens(input.dateBrushSelection)
  const addedPredicates = [...facetPredicates, ...(datePredicate ? [datePredicate] : [])]
  const predicate = mergeSavedViewPredicates(sourceQuery.predicate, addedPredicates)
  const orderBy = input.sortField
    ? [{ field: input.sortField, direction: input.sortDirection }]
    : sourceQuery.orderBy
  const nextQuery: QueryASTNodeQuery = {
    ...sourceQuery,
    ...(predicate ? { predicate } : {}),
    ...(orderBy && orderBy.length > 0 ? { orderBy } : {}),
    page: {
      ...(sourceQuery.page ?? {}),
      first: input.pageSize,
      offset: 0,
      count: sourceQuery.page?.count ?? 'estimate'
    }
  }
  const sourceTitle = input.title ?? input.descriptor.title
  const summary = savedLensSummary({
    facetFields: Object.entries(input.facetSelection)
      .filter(([, values]) => values.length > 0)
      .map(([field]) => field),
    dateBrushSelection: input.dateBrushSelection,
    sortField: input.sortField,
    pageSize: input.pageSize
  })
  const title = `${sourceTitle} Lens`
  const sourceDescription = input.description ?? input.descriptor.description
  const description =
    summary.length > 0
      ? `Saved from ${sourceTitle} with ${summary.join(', ')}.`
      : `Saved from ${sourceTitle}.`
  const fullDescription = sourceDescription
    ? `${description} Source view: ${sourceDescription}`
    : description
  const descriptor: SavedViewDescriptor = {
    version: input.descriptor.version,
    title,
    description: fullDescription,
    scope: input.descriptor.scope ?? 'workspace',
    query: nextQuery
  }

  return {
    title,
    description: fullDescription,
    descriptor,
    queryId: input.queryId,
    sourceTitle,
    stateSummary: {
      facetFields: Object.entries(input.facetSelection)
        .filter(([, values]) => values.length > 0)
        .map(([field]) => field),
      dateField: input.dateBrushSelection.field,
      dateBucketCount: input.dateBrushSelection.bucketKeys.length,
      sortField: input.sortField || null,
      sortDirection: input.sortField ? input.sortDirection : null,
      pageSize: input.pageSize
    }
  }
}

export function SavedViewRunner({
  descriptor,
  registry,
  title,
  description,
  fallbackId,
  resetKey,
  className,
  emptyLabel = 'No saved view selected.',
  pageSizes = DEFAULT_PAGE_SIZES,
  initialPageSize = DEFAULT_PAGE_SIZE,
  options: baseOptions,
  onSaveLens,
  saveLensLabel = 'Save lens',
  onOpenVisualCanvasProjection,
  feedEnrichment,
  wrapItem
}: SavedViewRunnerProps): JSX.Element {
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [sortField, setSortField] = useState('')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [pageOffset, setPageOffset] = useState(0)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [visibleColumns, setVisibleColumns] = useState<string[]>([])
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)
  const [facetSelection, setFacetSelection] = useState<Record<string, string[]>>({})
  const [dateBrushSelection, setDateBrushSelection] = useState<SavedViewDateBrushSelection>({
    field: null,
    bucketKeys: []
  })
  const [presentationMode, setPresentationMode] = useState<SavedViewPresentationMode>('table')
  const [visualLayoutId, setVisualLayoutId] = useState<SavedViewVisualLayoutId>('platform-lanes')
  const [feedLayout, setFeedLayout] = useState<SavedViewFeedLayout>('grid')
  const [feedDensity, setFeedDensity] = useState<SavedViewFeedDensity>('cozy')
  const [appliedPresentationHintKey, setAppliedPresentationHintKey] = useState<string | null>(null)
  const [activeEmbedPreviewId, setActiveEmbedPreviewId] = useState<string | null>(null)
  const [saveLensState, setSaveLensState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveLensError, setSaveLensError] = useState<string | null>(null)
  const descriptorKey = useMemo(() => descriptorKeyFor(descriptor), [descriptor])
  const orderBy = useMemo<QueryASTOrderBy[] | undefined>(
    () => (sortField ? [{ field: sortField, direction: sortDirection }] : undefined),
    [sortDirection, sortField]
  )
  const options = useMemo<UseSavedViewOptions>(
    () => ({
      ...baseOptions,
      search: searchText.trim() || undefined,
      queryOverrides: activeQueryId
        ? {
            [activeQueryId]: {
              orderBy,
              page: {
                first: pageSize,
                offset: pageOffset,
                count: 'estimate'
              }
            }
          }
        : undefined
    }),
    [activeQueryId, baseOptions, orderBy, pageOffset, pageSize, searchText]
  )
  const result = useSavedView(descriptor, registry, options)
  const resolvedActiveQueryId =
    activeQueryId && result.queries[activeQueryId] ? activeQueryId : result.primaryQueryId
  const activeQuery = resolvedActiveQueryId ? result.queries[resolvedActiveQueryId] : null
  const availableColumns = useMemo(
    () => deriveSavedViewColumns((activeQuery?.data ?? []) as Record<string, unknown>[]),
    [activeQuery?.data]
  )
  const facetSummaries = useMemo(
    () =>
      deriveCachedSavedViewFacetSummaries({
        rows: (activeQuery?.data ?? []) as Record<string, unknown>[],
        columns: availableColumns,
        identity: {
          queryId: activeQuery?.queryId,
          schemaId: activeQuery?.schemaId
        }
      }),
    [activeQuery?.data, activeQuery?.queryId, activeQuery?.schemaId, availableColumns]
  )
  const facetFilteredRows = useMemo(
    () =>
      filterSavedViewRowsByFacets(
        (activeQuery?.data ?? []) as Record<string, unknown>[],
        facetSelection
      ),
    [activeQuery?.data, facetSelection]
  )
  const dateBucketSummaries = useMemo(
    () =>
      deriveCachedSavedViewDateBucketSummaries({
        rows: facetFilteredRows,
        columns: availableColumns,
        identity: {
          queryId: activeQuery?.queryId,
          schemaId: activeQuery?.schemaId
        }
      }),
    [activeQuery?.queryId, activeQuery?.schemaId, availableColumns, facetFilteredRows]
  )
  const filteredRows = useMemo(
    () =>
      filterSavedViewRowsByDateBrush(
        facetFilteredRows,
        dateBrushSelection
      ) as SavedViewQueryResult['data'],
    [dateBrushSelection, facetFilteredRows]
  )
  const displayedQuery = useMemo<SavedViewQueryResult | null>(
    () => (activeQuery ? { ...activeQuery, data: filteredRows } : null),
    [activeQuery, filteredRows]
  )
  const visualPreviews = useMemo(
    () =>
      deriveCachedSavedViewVisualPreviews({
        descriptor: result.descriptor ?? descriptor,
        query: activeQuery
          ? {
              queryId: activeQuery.queryId,
              rowRole: activeQuery.rowRole,
              schemaId: activeQuery.schemaId,
              schemaName: activeQuery.schemaName
            }
          : null,
        rows: filteredRows as Record<string, unknown>[]
      }),
    [activeQuery, descriptor, filteredRows, result.descriptor]
  )
  const timelineBuckets = useMemo(
    () => deriveSavedViewTimelineBuckets(visualPreviews),
    [visualPreviews]
  )
  const feedPreviews = useMemo(
    () => arrangeSavedViewVisualPreviews(visualPreviews, 'timeline'),
    [visualPreviews]
  )
  const presentationHint = useMemo<SavedViewPresentationHint | null>(() => {
    const resolved =
      result.descriptor ?? (descriptor && typeof descriptor === 'object' ? descriptor : null)
    return resolved?.presentation ?? null
  }, [descriptor, result.descriptor])
  const relationshipCount = useMemo(
    () => visualPreviews.reduce((count, preview) => count + preview.relationships.length, 0),
    [visualPreviews]
  )
  const visualLayoutOptions = useMemo(
    () =>
      createSavedViewVisualLayoutOptions({
        previewCount: visualPreviews.length,
        timelineBucketCount: timelineBuckets.length,
        relationshipCount,
        resultKind: result.kind
      }),
    [relationshipCount, result.kind, timelineBuckets.length, visualPreviews.length]
  )
  const activeVisualLayout =
    visualLayoutOptions.find((option) => option.id === visualLayoutId) ?? visualLayoutOptions[0]
  const arrangedVisualPreviews = useMemo(
    () => arrangeSavedViewVisualPreviews(visualPreviews, activeVisualLayout?.id ?? 'grid'),
    [activeVisualLayout?.id, visualPreviews]
  )
  const visualCanvasProjectionNodes = useMemo(
    () =>
      createSavedViewCanvasProjectionNodes(arrangedVisualPreviews, {
        limit: VISUAL_CANVAS_PROJECTION_LIMIT,
        groupBy: activeVisualLayout?.projectionGroupBy ?? 'platform'
      }),
    [activeVisualLayout?.projectionGroupBy, arrangedVisualPreviews]
  )
  const visualGraphEdges = useMemo(
    () => deriveSavedViewVisualGraphEdges(arrangedVisualPreviews),
    [arrangedVisualPreviews]
  )
  const presentationModeOptions = useMemo(
    () =>
      createSavedViewPresentationModeOptions({
        resultKind: result.kind,
        previewCount: visualPreviews.length,
        timelineBucketCount: timelineBuckets.length,
        relationshipCount
      }),
    [relationshipCount, result.kind, timelineBuckets.length, visualPreviews.length]
  )
  const inspectedRow = useMemo<Record<string, unknown> | null>(() => {
    if (!expandedRowId) return null

    const row = displayedQuery?.data.find((candidate) => candidate.id === expandedRowId)
    return row ? (row as Record<string, unknown>) : null
  }, [displayedQuery?.data, expandedRowId])
  const activeFacetCount = useMemo(
    () => Object.values(facetSelection).reduce((sum, values) => sum + values.length, 0),
    [facetSelection]
  )
  const activeDateBucketCount = dateBrushSelection.bucketKeys.length
  const resetIdentity = resetKey ?? descriptorKey
  const canSaveLens = Boolean(
    onSaveLens && result.descriptor && activeQuery && resolvedActiveQueryId
  )

  useEffect(() => {
    setActiveQueryId(null)
    setSearchText('')
    setSortField('')
    setSortDirection('asc')
    setPageOffset(0)
    setPageSize(initialPageSize)
    setExpandedRowId(null)
    setVisibleColumns([])
    setFacetSelection({})
    setDateBrushSelection({ field: null, bucketKeys: [] })
    setPresentationMode('table')
    setVisualLayoutId('platform-lanes')
    setFeedLayout('grid')
    setFeedDensity('cozy')
    setAppliedPresentationHintKey(null)
    setActiveEmbedPreviewId(null)
    setSaveLensState('idle')
    setSaveLensError(null)
  }, [initialPageSize, resetIdentity])

  useEffect(() => {
    if (!presentationHint || appliedPresentationHintKey === resetIdentity) return

    const hintedMode = presentationHint.mode
    if (hintedMode) {
      const option = presentationModeOptions.find((candidate) => candidate.mode === hintedMode)
      if (!option?.enabled) return
      setPresentationMode(hintedMode)
    }
    if (presentationHint.feedLayout) setFeedLayout(presentationHint.feedLayout)
    if (presentationHint.feedDensity) setFeedDensity(presentationHint.feedDensity)
    setAppliedPresentationHintKey(resetIdentity)
  }, [appliedPresentationHintKey, presentationHint, presentationModeOptions, resetIdentity])

  useEffect(() => {
    if (!result.primaryQueryId) return
    if (!activeQueryId || !result.queryIds.includes(activeQueryId)) {
      setActiveQueryId(result.primaryQueryId)
    }
  }, [activeQueryId, result.primaryQueryId, result.queryIds])

  useEffect(() => {
    setPageOffset(0)
  }, [activeQueryId, pageSize, searchText, sortDirection, sortField])

  useEffect(() => {
    setExpandedRowId(null)
    setActiveEmbedPreviewId(null)
  }, [pageSize, searchText, sortDirection, sortField])

  useEffect(() => {
    setFacetSelection({})
    setDateBrushSelection({ field: null, bucketKeys: [] })
    setActiveEmbedPreviewId(null)
    setSaveLensState('idle')
    setSaveLensError(null)
  }, [activeQueryId, searchText, sortDirection, sortField])

  useEffect(() => {
    setSaveLensState('idle')
    setSaveLensError(null)
  }, [dateBrushSelection, facetSelection])

  useEffect(() => {
    const activeOption = presentationModeOptions.find((option) => option.mode === presentationMode)
    if (!activeOption?.enabled) {
      setPresentationMode('table')
    }
  }, [presentationMode, presentationModeOptions])

  useEffect(() => {
    const activeOption = visualLayoutOptions.find((option) => option.id === visualLayoutId)
    const fallbackOption =
      visualLayoutOptions.find((option) => option.enabled) ?? visualLayoutOptions[0]
    if (!activeOption?.enabled && fallbackOption) {
      setVisualLayoutId(fallbackOption.id)
    }
  }, [visualLayoutId, visualLayoutOptions])

  useEffect(() => {
    if (!activeEmbedPreviewId) return
    if (!visualPreviews.some((preview) => preview.id === activeEmbedPreviewId)) {
      setActiveEmbedPreviewId(null)
    }
  }, [activeEmbedPreviewId, visualPreviews])

  useEffect(() => {
    setVisibleColumns((current) => {
      const kept = current.filter((column) => availableColumns.includes(column))
      if (kept.length > 0) return kept
      return availableColumns.slice(0, Math.min(8, availableColumns.length))
    })
  }, [availableColumns])

  useEffect(() => {
    setFacetSelection((current) => {
      const validFields = new Set(facetSummaries.map((facet) => facet.field))
      const validValues = new Map(
        facetSummaries.map((facet) => [
          facet.field,
          new Set(facet.values.map((value) => value.valueKey))
        ])
      )
      const nextEntries = Object.entries(current)
        .filter(([field]) => validFields.has(field))
        .flatMap(([field, values]) => {
          const allowedValues = validValues.get(field)
          const kept = allowedValues ? values.filter((valueKey) => allowedValues.has(valueKey)) : []
          return kept.length > 0 ? [[field, kept] as const] : []
        })
      const next = Object.fromEntries(nextEntries)

      return sameFacetSelection(current, next) ? current : next
    })
  }, [facetSummaries])

  useEffect(() => {
    setDateBrushSelection((current) => {
      if (!current.field) return current

      const summary = dateBucketSummaries.find((candidate) => candidate.field === current.field)
      if (!summary) return { field: null, bucketKeys: [] }

      const validBucketKeys = new Set(summary.buckets.map((bucket) => bucket.bucketKey))
      const nextBucketKeys = current.bucketKeys.filter((bucketKey) =>
        validBucketKeys.has(bucketKey)
      )
      const next = {
        field: nextBucketKeys.length > 0 ? current.field : null,
        bucketKeys: nextBucketKeys
      }

      return sameDateBrushSelection(current, next) ? current : next
    })
  }, [dateBucketSummaries])

  useEffect(() => {
    if (!expandedRowId) return
    if (!filteredRows.some((row) => row.id === expandedRowId)) {
      setExpandedRowId(null)
    }
  }, [expandedRowId, filteredRows])

  async function handleSaveLens(): Promise<void> {
    if (!onSaveLens || !result.descriptor || !activeQuery || !resolvedActiveQueryId) return

    const draft = createSavedViewLensDraft({
      descriptor: result.descriptor,
      queryId: resolvedActiveQueryId,
      query: activeQuery,
      facetSelection,
      dateBrushSelection,
      sortField,
      sortDirection,
      pageSize,
      title: title ?? result.title,
      description: description ?? result.description
    })

    if (!draft) {
      setSaveLensState('error')
      setSaveLensError('The active query cannot be saved as a lens.')
      return
    }

    setSaveLensState('saving')
    setSaveLensError(null)

    try {
      await onSaveLens(draft)
      setSaveLensState('saved')
    } catch (error) {
      setSaveLensState('error')
      setSaveLensError(error instanceof Error ? error.message : String(error))
    }
  }

  if (!descriptor) {
    return (
      <section
        className={classNames([
          'mt-6 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground',
          className
        ])}
      >
        {emptyLabel}
      </section>
    )
  }

  return (
    <section
      className={classNames(['mt-6 space-y-3 rounded-md border border-border p-4', className])}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Table size={14} />
            <span>{result.kind === 'query-set' ? 'Query set' : 'Query'}</span>
          </div>
          <h2 className="mt-1 truncate text-base font-semibold">
            {title ?? result.title ?? 'Untitled view'}
          </h2>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {description ?? result.description ?? fallbackId ?? descriptorKey}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <SavedViewPrivacyChips query={activeQuery} />
          {onSaveLens ? (
            <button
              type="button"
              disabled={!canSaveLens || saveLensState === 'saving'}
              onClick={() => void handleSaveLens()}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saveLensState === 'saving' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Save size={13} />
              )}
              {saveLensLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={result.reload}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 transition-colors hover:bg-accent"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      <SavedViewDiagnostics result={result} query={activeQuery} />
      <SavedViewSensitiveResultWarning query={activeQuery} />
      {saveLensState === 'saved' ? (
        <SavedViewStatusBanner tone="success" message="Lens saved." />
      ) : null}
      {saveLensError ? <SavedViewStatusBanner tone="error" message={saveLensError} /> : null}

      {result.queryIds.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {result.queryIds.map((queryId) => {
            const query = result.queries[queryId]
            const active = queryId === resolvedActiveQueryId

            return (
              <button
                key={queryId}
                type="button"
                onClick={() => setActiveQueryId(queryId)}
                className={classNames([
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:bg-accent'
                ])}
              >
                {queryId}
                <span className="ml-2 opacity-70">{queryRowCount(query)}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      {result.kind === 'query-set' ? (
        <SavedViewGraphLensPanel
          queries={result.queries}
          queryIds={result.queryIds}
          selected={
            expandedRowId && resolvedActiveQueryId
              ? { queryId: resolvedActiveQueryId, rowId: expandedRowId }
              : null
          }
          onSelect={({ queryId, rowId }) => {
            setActiveQueryId(queryId)
            setPageOffset(0)
            setExpandedRowId(rowId)
          }}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.currentTarget.value)}
            className="min-w-0 flex-1 bg-transparent outline-none"
            placeholder="Search"
          />
        </label>
        <select
          value={sortField}
          onChange={(event) => setSortField(event.currentTarget.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="">Sort</option>
          {availableColumns.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
          className="rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
        >
          {sortDirection}
        </button>
        <select
          value={pageSize}
          onChange={(event) => setPageSize(Number(event.currentTarget.value))}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {pageSizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent">
            <Columns3 size={14} />
            Columns
          </summary>
          <div className="absolute right-0 z-10 mt-2 max-h-72 w-64 overflow-auto rounded-md border border-border bg-background p-2 shadow-lg">
            {availableColumns.map((column) => (
              <label key={column} className="flex items-center gap-2 rounded px-2 py-1 text-sm">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(column)}
                  onChange={(event) => {
                    setVisibleColumns((current) =>
                      event.currentTarget.checked
                        ? [...new Set([...current, column])]
                        : current.filter((item) => item !== column)
                    )
                  }}
                />
                <span className="min-w-0 truncate">{column}</span>
              </label>
            ))}
          </div>
        </details>
      </div>

      <SavedViewFacetShelf
        summaries={facetSummaries}
        selection={facetSelection}
        onToggleValue={(field, valueKey) =>
          setFacetSelection((current) => toggleFacetSelection(current, field, valueKey))
        }
        onClearField={(field) =>
          setFacetSelection((current) => omitFacetSelectionField(current, field))
        }
        onClearAll={() => setFacetSelection({})}
      />

      <SavedViewTimelineBrush
        summaries={dateBucketSummaries}
        selection={dateBrushSelection}
        onSelectField={(field) => setDateBrushSelection({ field, bucketKeys: [] })}
        onToggleBucket={(field, bucketKey) =>
          setDateBrushSelection((current) => toggleDateBrushSelection(current, field, bucketKey))
        }
        onClear={() => setDateBrushSelection({ field: null, bucketKeys: [] })}
      />

      <SavedViewPresentationModeSwitcher
        modes={presentationModeOptions}
        activeMode={presentationMode}
        onSelectMode={setPresentationMode}
      />
      {presentationMode !== 'table' && presentationMode !== 'feed' && activeVisualLayout ? (
        <SavedViewVisualLayoutSettings
          options={visualLayoutOptions}
          activeLayoutId={activeVisualLayout.id}
          onSelectLayout={setVisualLayoutId}
        />
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        {presentationMode === 'feed' ? (
          <SavedViewVisualFeed
            previews={feedPreviews}
            layout={feedLayout}
            density={feedDensity}
            enrichment={feedEnrichment}
            wrapItem={wrapItem}
            onSelectLayout={setFeedLayout}
            onSelectDensity={setFeedDensity}
            selectedSourceNodeId={expandedRowId}
            activeEmbedPreviewId={activeEmbedPreviewId}
            onSelectPreview={(preview) =>
              setExpandedRowId((current) =>
                current === preview.sourceNodeId ? null : preview.sourceNodeId
              )
            }
            onToggleLiveEmbed={(preview) =>
              setActiveEmbedPreviewId((current) => (current === preview.id ? null : preview.id))
            }
          />
        ) : presentationMode === 'cards' ? (
          <SavedViewVisualGrid
            previews={arrangedVisualPreviews}
            selectedSourceNodeId={expandedRowId}
            activeEmbedPreviewId={activeEmbedPreviewId}
            wrapItem={wrapItem}
            onSelectPreview={(preview) =>
              setExpandedRowId((current) =>
                current === preview.sourceNodeId ? null : preview.sourceNodeId
              )
            }
            onToggleLiveEmbed={(preview) =>
              setActiveEmbedPreviewId((current) => (current === preview.id ? null : preview.id))
            }
          />
        ) : presentationMode === 'timeline' ? (
          <SavedViewVisualTimeline
            buckets={timelineBuckets}
            selectedSourceNodeId={expandedRowId}
            activeEmbedPreviewId={activeEmbedPreviewId}
            onSelectPreview={(preview) =>
              setExpandedRowId((current) =>
                current === preview.sourceNodeId ? null : preview.sourceNodeId
              )
            }
            onToggleLiveEmbed={(preview) =>
              setActiveEmbedPreviewId((current) => (current === preview.id ? null : preview.id))
            }
          />
        ) : presentationMode === 'canvas' ? (
          <SavedViewVisualCanvasProjectionPanel
            previews={arrangedVisualPreviews}
            projectionNodes={visualCanvasProjectionNodes}
            layout={activeVisualLayout}
            descriptor={result.descriptor ?? descriptor}
            title={title ?? result.title ?? 'Visual saved view'}
            description={description ?? result.description ?? null}
            sourceQueryId={activeQuery?.queryId ?? resolvedActiveQueryId}
            sourceSchemaId={activeQuery?.schemaId ?? null}
            onOpenProjection={onOpenVisualCanvasProjection}
          />
        ) : presentationMode === 'graph' ? (
          <SavedViewVisualGraphPanel
            previews={arrangedVisualPreviews}
            edges={visualGraphEdges}
            selectedSourceNodeId={expandedRowId}
            onSelectSourceNode={(sourceNodeId) =>
              setExpandedRowId((current) => (current === sourceNodeId ? null : sourceNodeId))
            }
          />
        ) : (
          <SavedViewResultTable
            query={displayedQuery}
            columns={visibleColumns}
            expandedRowId={expandedRowId}
            onToggleRow={(rowId) =>
              setExpandedRowId((current) => (current === rowId ? null : rowId))
            }
          />
        )}
        <SavedViewRowInspector row={inspectedRow} query={activeQuery} />
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <div className="text-muted-foreground">
          {activeQuery
            ? activeFacetCount + activeDateBucketCount > 0
              ? `${filteredRows.length.toLocaleString()} visible of ${activeQuery.data.length.toLocaleString()} loaded`
              : `${activeQuery.data.length.toLocaleString()} loaded`
            : '0 loaded'}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pageOffset === 0}
            onClick={() => setPageOffset((current) => Math.max(0, current - pageSize))}
            className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            Previous
          </button>
          <span className="text-muted-foreground">{pageOffset + 1}</span>
          <button
            type="button"
            disabled={!activeQuery?.hasMore}
            onClick={() => setPageOffset((current) => current + pageSize)}
            className="rounded-md border border-border px-3 py-1.5 transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )
}

export function SavedViewGraphLensPanel({
  queries,
  queryIds,
  selected,
  onSelect
}: {
  queries: Record<string, SavedViewQueryResult>
  queryIds: readonly string[]
  selected: SavedViewGraphLensSelection | null
  onSelect: (selection: SavedViewGraphLensSelection) => void
}): JSX.Element | null {
  const groups = queryIds
    .map((queryId) => {
      const query = queries[queryId]
      return query ? { query, nodes: deriveSavedViewGraphLensNodes(query, queryId) } : null
    })
    .filter((group): group is { query: SavedViewQueryResult; nodes: SavedViewGraphLensNode[] } =>
      Boolean(group && group.nodes.length > 0)
    )

  if (groups.length === 0) return null

  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <Network size={14} className="text-muted-foreground" />
          <span>Graph Lens</span>
          <span className="text-xs font-normal text-muted-foreground">source records</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {groups.length.toLocaleString()} roles
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map(({ query, nodes }) => (
          <section
            key={query.queryId}
            className="min-w-0 rounded-md border border-border bg-background p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {query.rowRole}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {shortSchemaId(query.schemaId)}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{queryRowCount(query)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {nodes.map((node) => {
                const active = selected?.queryId === node.queryId && selected.rowId === node.rowId

                return (
                  <button
                    key={`${node.queryId}:${node.rowId}`}
                    type="button"
                    onClick={() => onSelect({ queryId: node.queryId, rowId: node.rowId })}
                    aria-label={`Inspect ${node.label}`}
                    className={classNames([
                      'max-w-full rounded-md border px-2 py-1 text-left text-xs transition-colors',
                      active
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border hover:bg-accent'
                    ])}
                  >
                    <span className="block max-w-48 truncate font-medium">{node.label}</span>
                    <span className="block max-w-48 truncate opacity-70">{node.detail}</span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function createSavedViewPresentationModeOptions(input: {
  resultKind: UseSavedViewResult['kind']
  previewCount: number
  timelineBucketCount: number
  relationshipCount: number
}): SavedViewPresentationModeOption[] {
  return [
    {
      mode: 'table',
      label: 'Table',
      description: 'Inspect rows and fields',
      icon: Table,
      enabled: true
    },
    {
      mode: 'feed',
      label: 'Feed',
      description: 'Browse content as a media feed with list and grid layouts',
      icon: GalleryVerticalEnd,
      enabled: input.previewCount > 0
    },
    {
      mode: 'cards',
      label: 'Cards',
      description: 'Browse visual previews',
      icon: LayoutGrid,
      enabled: input.previewCount > 0
    },
    {
      mode: 'timeline',
      label: 'Timeline',
      description: 'Group visible records by month',
      icon: CalendarDays,
      enabled: input.timelineBucketCount > 0
    },
    {
      mode: 'canvas',
      label: 'Canvas',
      description: 'Preview a bounded source-backed canvas projection',
      icon: Network,
      enabled: input.previewCount > 0
    },
    {
      mode: 'graph',
      label: 'Graph',
      description: 'Surface relationships, clusters, and sampled edges',
      icon: GitBranch,
      enabled:
        input.previewCount > 0 && (input.relationshipCount > 0 || input.resultKind === 'query-set')
    }
  ]
}

function SavedViewPresentationModeSwitcher({
  modes,
  activeMode,
  onSelectMode
}: {
  modes: SavedViewPresentationModeOption[]
  activeMode: SavedViewPresentationMode
  onSelectMode: (mode: SavedViewPresentationMode) => void
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/20 p-2">
      <div className="flex flex-wrap gap-1">
        {modes.map((mode) => {
          const active = activeMode === mode.mode
          const Icon = mode.icon

          return (
            <button
              key={mode.mode}
              type="button"
              disabled={!mode.enabled}
              onClick={() => onSelectMode(mode.mode)}
              title={mode.description}
              className={classNames([
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-background hover:text-foreground',
                !mode.enabled && 'cursor-not-allowed opacity-45 hover:bg-transparent'
              ])}
            >
              <Icon size={14} />
              {mode.label}
            </button>
          )
        })}
      </div>
      <span className="px-2 text-xs text-muted-foreground">
        Switch the same saved view between queryable and visual layouts.
      </span>
    </div>
  )
}

function createSavedViewVisualLayoutOptions(input: {
  previewCount: number
  timelineBucketCount: number
  relationshipCount: number
  resultKind: UseSavedViewResult['kind']
}): SavedViewVisualLayoutOption[] {
  const hasPreviews = input.previewCount > 0
  const hasTimeline = input.timelineBucketCount > 0
  const hasGraph = input.relationshipCount > 0 || input.resultKind === 'query-set'

  return [
    {
      id: 'grid',
      label: 'Grid',
      description: 'Dense preview cards sorted by title and recency.',
      icon: LayoutGrid,
      enabled: hasPreviews,
      workspaceLayout: { kind: 'grid', groupBy: 'kind', sortBy: 'timestamp' },
      projectionGroupBy: 'kind'
    },
    {
      id: 'timeline',
      label: 'Timeline',
      description: 'Chronological buckets for timestamped records.',
      icon: CalendarDays,
      enabled: hasTimeline,
      workspaceLayout: { kind: 'timeline', timeField: 'timestamp', laneBy: 'platform' },
      projectionGroupBy: 'platform'
    },
    {
      id: 'creator-clusters',
      label: 'Creators',
      description: 'Cluster records by the person or account behind them.',
      icon: UserRound,
      enabled: hasPreviews,
      workspaceLayout: { kind: 'cluster', groupBy: 'creator', sizeBy: 'count' },
      projectionGroupBy: 'creator'
    },
    {
      id: 'platform-lanes',
      label: 'Platforms',
      description: 'Lane records by source platform.',
      icon: Columns3,
      enabled: hasPreviews,
      workspaceLayout: { kind: 'cluster', groupBy: 'platform', sizeBy: 'count' },
      projectionGroupBy: 'platform'
    },
    {
      id: 'content-type-lanes',
      label: 'Types',
      description: 'Lane records by content, actor, message, or collection type.',
      icon: FileSearch,
      enabled: hasPreviews,
      workspaceLayout: { kind: 'cluster', groupBy: 'kind', sizeBy: 'count' },
      projectionGroupBy: 'kind'
    },
    {
      id: 'date-bands',
      label: 'Dates',
      description: 'Band timestamped records by date before projecting.',
      icon: CalendarDays,
      enabled: hasTimeline,
      workspaceLayout: { kind: 'timeline', timeField: 'timestamp', laneBy: 'kind' },
      projectionGroupBy: 'kind'
    },
    {
      id: 'collection-board',
      label: 'Board',
      description: 'Group collection records and collection-like items together.',
      icon: Columns3,
      enabled: hasPreviews,
      workspaceLayout: { kind: 'collection-board', collectionField: 'collection' },
      projectionGroupBy: 'kind'
    },
    {
      id: 'graph',
      label: 'Graph',
      description: 'Sample bounded relationship edges for graph inspection.',
      icon: GitBranch,
      enabled: hasPreviews && hasGraph,
      workspaceLayout: { kind: 'graph', algorithm: 'layered' },
      projectionGroupBy: 'creator'
    }
  ]
}

function SavedViewVisualLayoutSettings({
  options,
  activeLayoutId,
  onSelectLayout
}: {
  options: SavedViewVisualLayoutOption[]
  activeLayoutId: SavedViewVisualLayoutId
  onSelectLayout: (layoutId: SavedViewVisualLayoutId) => void
}): JSX.Element {
  return (
    <div className="rounded-md border border-border bg-background p-2">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Layout
        </div>
        <div className="text-xs text-muted-foreground">
          Affects visual ordering and projection lanes.
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => {
          const active = activeLayoutId === option.id
          const Icon = option.icon

          return (
            <button
              key={option.id}
              type="button"
              disabled={!option.enabled}
              onClick={() => onSelectLayout(option.id)}
              title={option.description}
              className={classNames([
                'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                active
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                !option.enabled && 'cursor-not-allowed opacity-45 hover:bg-transparent'
              ])}
            >
              <Icon size={13} />
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function compareMaybeNumberDescending(left?: number, right?: number): number {
  if (left === undefined && right === undefined) return 0
  if (left === undefined) return 1
  if (right === undefined) return -1
  return right - left
}

function previewGroupValue(
  preview: SavedViewVisualPreviewModel,
  layoutId: SavedViewVisualLayoutId
): string {
  switch (layoutId) {
    case 'creator-clusters':
    case 'graph':
      return preview.creator?.label ?? 'unknown creator'
    case 'content-type-lanes':
    case 'collection-board':
    case 'grid':
      return preview.kind
    case 'date-bands':
    case 'timeline':
      return preview.timestamp ? new Date(preview.timestamp).toISOString().slice(0, 7) : 'undated'
    case 'platform-lanes':
    default:
      return preview.platform
  }
}

function arrangeSavedViewVisualPreviews(
  previews: readonly SavedViewVisualPreviewModel[],
  layoutId: SavedViewVisualLayoutId
): SavedViewVisualPreviewModel[] {
  return [...previews].sort((left, right) => {
    if (layoutId === 'timeline' || layoutId === 'date-bands') {
      return (
        compareMaybeNumberDescending(left.timestampMs, right.timestampMs) ||
        left.title.localeCompare(right.title)
      )
    }

    if (layoutId === 'graph') {
      return (
        right.relationships.length - left.relationships.length ||
        previewGroupValue(left, layoutId).localeCompare(previewGroupValue(right, layoutId)) ||
        left.title.localeCompare(right.title)
      )
    }

    return (
      previewGroupValue(left, layoutId).localeCompare(previewGroupValue(right, layoutId)) ||
      compareMaybeNumberDescending(left.timestampMs, right.timestampMs) ||
      left.title.localeCompare(right.title)
    )
  })
}

function chunkVisualPreviews(
  previews: readonly SavedViewVisualPreviewModel[],
  columnCount = DEFAULT_VISUAL_GRID_COLUMNS
): SavedViewVisualPreviewModel[][] {
  const rows: SavedViewVisualPreviewModel[][] = []

  for (let index = 0; index < previews.length; index += columnCount) {
    rows.push(previews.slice(index, index + columnCount))
  }

  return rows
}

function SavedViewVisualGrid({
  previews,
  selectedSourceNodeId,
  activeEmbedPreviewId,
  wrapItem,
  onSelectPreview,
  onToggleLiveEmbed
}: {
  previews: SavedViewVisualPreviewModel[]
  selectedSourceNodeId: string | null
  activeEmbedPreviewId: string | null
  wrapItem?: (nodeId: string, content: ReactNode) => ReactNode
  onSelectPreview: (preview: SavedViewVisualPreviewModel) => void
  onToggleLiveEmbed: (preview: SavedViewVisualPreviewModel) => void
}): JSX.Element {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const rows = useMemo(() => chunkVisualPreviews(previews), [previews])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => VISUAL_GRID_ROW_HEIGHT,
    initialRect: { width: 1024, height: 640 },
    overscan: VISUAL_GRID_OVERSCAN
  })
  const virtualRows = virtualizer.getVirtualItems()
  const renderedRows =
    virtualRows.length > 0
      ? virtualRows.map((virtualRow) => ({
          key: virtualRow.key,
          index: virtualRow.index,
          start: virtualRow.start
        }))
      : rows.slice(0, VISUAL_GRID_OVERSCAN).map((_, index) => ({
          key: `initial-${index}`,
          index,
          start: index * VISUAL_GRID_ROW_HEIGHT
        }))

  if (previews.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        No visual previews for these loaded rows.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <LayoutGrid size={14} className="text-muted-foreground" />
          <span>Visual Cards</span>
          <span className="text-xs font-normal text-muted-foreground">
            {previews.length.toLocaleString()} previews
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          Live embeds mount only after activation.
        </span>
      </div>
      <div ref={parentRef} className="h-[640px] overflow-auto">
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {renderedRows.map((virtualRow) => (
            <SavedViewVisualGridRow
              key={virtualRow.key}
              start={virtualRow.start}
              previews={rows[virtualRow.index] ?? []}
              selectedSourceNodeId={selectedSourceNodeId}
              activeEmbedPreviewId={activeEmbedPreviewId}
              wrapItem={wrapItem}
              onSelectPreview={onSelectPreview}
              onToggleLiveEmbed={onToggleLiveEmbed}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function SavedViewVisualGridRow({
  start,
  previews,
  selectedSourceNodeId,
  activeEmbedPreviewId,
  wrapItem,
  onSelectPreview,
  onToggleLiveEmbed
}: {
  start: number
  previews: SavedViewVisualPreviewModel[]
  selectedSourceNodeId: string | null
  activeEmbedPreviewId: string | null
  wrapItem?: (nodeId: string, content: ReactNode) => ReactNode
  onSelectPreview: (preview: SavedViewVisualPreviewModel) => void
  onToggleLiveEmbed: (preview: SavedViewVisualPreviewModel) => void
}): JSX.Element {
  return (
    <div
      className="absolute left-0 top-0 grid w-full gap-3 p-3 md:grid-cols-2 xl:grid-cols-3"
      style={{ transform: `translateY(${start}px)` }}
    >
      {previews.map((preview) => {
        const card = (
          <SavedViewVisualPreviewCard
            key={preview.id}
            preview={preview}
            selected={selectedSourceNodeId === preview.sourceNodeId}
            live={activeEmbedPreviewId === preview.id}
            onSelect={() => onSelectPreview(preview)}
            onToggleLiveEmbed={() => onToggleLiveEmbed(preview)}
          />
        )
        return wrapItem ? (
          <Fragment key={preview.id}>{wrapItem(preview.sourceNodeId, card)}</Fragment>
        ) : (
          card
        )
      })}
    </div>
  )
}

function SavedViewVisualTimeline({
  buckets,
  selectedSourceNodeId,
  activeEmbedPreviewId,
  onSelectPreview,
  onToggleLiveEmbed
}: {
  buckets: SavedViewVisualTimelineBucket[]
  selectedSourceNodeId: string | null
  activeEmbedPreviewId: string | null
  onSelectPreview: (preview: SavedViewVisualPreviewModel) => void
  onToggleLiveEmbed: (preview: SavedViewVisualPreviewModel) => void
}): JSX.Element {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: buckets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 390,
    initialRect: { width: 1024, height: 640 },
    overscan: 2
  })
  const virtualRows = virtualizer.getVirtualItems()
  const renderedRows =
    virtualRows.length > 0
      ? virtualRows.map((virtualRow) => ({
          key: virtualRow.key,
          index: virtualRow.index,
          start: virtualRow.start
        }))
      : buckets.slice(0, 3).map((_, index) => ({
          key: `initial-${index}`,
          index,
          start: index * 390
        }))

  if (buckets.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        No timestamped rows for a visual timeline.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays size={14} className="text-muted-foreground" />
          <span>Visual Timeline</span>
          <span className="text-xs font-normal text-muted-foreground">
            {buckets.length.toLocaleString()} buckets
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          Showing up to {TIMELINE_PREVIEW_LIMIT_PER_BUCKET} previews per bucket.
        </span>
      </div>
      <div ref={parentRef} className="h-[640px] overflow-auto">
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {renderedRows.map((virtualRow) => {
            const bucket = buckets[virtualRow.index]
            if (!bucket) return null

            return (
              <section
                key={virtualRow.key}
                className="absolute left-0 top-0 w-full p-3"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="rounded-md border border-border bg-secondary/20 p-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">{bucket.label}</h3>
                      <p className="text-xs text-muted-foreground">
                        {bucket.count.toLocaleString()} records
                      </p>
                    </div>
                    <div className="h-2 min-w-24 flex-1 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground"
                        style={{
                          width: `${Math.max(
                            6,
                            Math.min(
                              100,
                              (bucket.count / Math.max(...buckets.map((b) => b.count))) * 100
                            )
                          )}%`
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {bucket.previews.slice(0, TIMELINE_PREVIEW_LIMIT_PER_BUCKET).map((preview) => (
                      <SavedViewVisualPreviewCard
                        key={preview.id}
                        preview={preview}
                        selected={selectedSourceNodeId === preview.sourceNodeId}
                        live={activeEmbedPreviewId === preview.id}
                        compact
                        onSelect={() => onSelectPreview(preview)}
                        onToggleLiveEmbed={() => onToggleLiveEmbed(preview)}
                      />
                    ))}
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function createSavedViewVisualCanvasProjectionRequest(input: {
  descriptor?: SavedViewDescriptor | string | null
  title: string
  description?: string | null
  sourceQueryId?: string | null
  sourceSchemaId?: string | null
  layout: SavedViewVisualLayoutOption
  previews: readonly SavedViewVisualPreviewModel[]
  nodes: readonly SavedViewCanvasProjectionNode[]
}): SavedViewVisualCanvasProjectionRequest {
  const id = ['saved-view-visual-projection', input.sourceQueryId ?? 'query', input.layout.id].join(
    ':'
  )

  return {
    id,
    title: `${input.title} - ${input.layout.label}`,
    ...(input.description ? { description: input.description } : {}),
    ...(input.descriptor ? { descriptor: input.descriptor } : {}),
    ...(input.sourceQueryId ? { sourceQueryId: input.sourceQueryId } : {}),
    ...(input.sourceSchemaId ? { sourceSchemaId: input.sourceSchemaId } : {}),
    layout: {
      id: input.layout.id,
      label: input.layout.label,
      workspaceLayout: input.layout.workspaceLayout,
      projectionGroupBy: input.layout.projectionGroupBy
    },
    nodes: [...input.nodes],
    sourceNodeIds: input.nodes.map((node) => node.id),
    omittedNodeCount: Math.max(0, input.previews.length - input.nodes.length),
    previewCount: input.previews.length
  }
}

function groupCanvasProjectionNodes(
  nodes: readonly SavedViewCanvasProjectionNode[]
): Array<{ key: string; nodes: SavedViewCanvasProjectionNode[] }> {
  const groups = nodes.reduce<Map<string, SavedViewCanvasProjectionNode[]>>((current, node) => {
    const key = node.groupKey ?? 'ungrouped'
    current.set(key, [...(current.get(key) ?? []), node])
    return current
  }, new Map())

  return [...groups.entries()]
    .map(([key, groupNodes]) => ({ key, nodes: groupNodes }))
    .sort(
      (left, right) => right.nodes.length - left.nodes.length || left.key.localeCompare(right.key)
    )
}

function SavedViewVisualCanvasProjectionPanel({
  previews,
  projectionNodes,
  layout,
  descriptor,
  title,
  description,
  sourceQueryId,
  sourceSchemaId,
  onOpenProjection
}: {
  previews: SavedViewVisualPreviewModel[]
  projectionNodes: SavedViewCanvasProjectionNode[]
  layout: SavedViewVisualLayoutOption
  descriptor?: SavedViewDescriptor | string | null
  title: string
  description?: string | null
  sourceQueryId?: string | null
  sourceSchemaId?: string | null
  onOpenProjection?: (request: SavedViewVisualCanvasProjectionRequest) => void | Promise<void>
}): JSX.Element {
  const groups = useMemo(() => groupCanvasProjectionNodes(projectionNodes), [projectionNodes])
  const omittedNodeCount = Math.max(0, previews.length - projectionNodes.length)

  if (previews.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        No rows are available for a canvas projection.
      </div>
    )
  }

  const request = createSavedViewVisualCanvasProjectionRequest({
    descriptor,
    title,
    description,
    sourceQueryId,
    sourceSchemaId,
    layout,
    previews,
    nodes: projectionNodes
  })

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Network size={14} className="text-muted-foreground" />
          <span>Canvas Projection</span>
          <span className="text-xs font-normal text-muted-foreground">{layout.label}</span>
        </div>
        <button
          type="button"
          disabled={!onOpenProjection || projectionNodes.length === 0}
          onClick={() => void onOpenProjection?.(request)}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Network size={12} />
          Open as canvas
        </button>
      </div>

      <div className="space-y-3 p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <ProjectionMetric label="Source rows" value={previews.length} />
          <ProjectionMetric label="Projected nodes" value={projectionNodes.length} />
          <ProjectionMetric label="Omitted" value={omittedNodeCount} />
        </div>

        <div className="rounded-md border border-border bg-secondary/20 p-3 text-sm text-muted-foreground">
          Projection nodes keep the canonical source node IDs, schema IDs, privacy classes, and
          grouping keys from the saved view. Canvas rendering can materialize these as source-backed
          cards without duplicating the imported records.
        </div>

        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <section key={group.key} className="min-w-0 rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-semibold">{formatGroupLabel(group.key)}</h3>
                <span className="text-xs text-muted-foreground">{group.nodes.length}</span>
              </div>
              <div className="space-y-1.5">
                {group.nodes.slice(0, 8).map((node) => (
                  <div
                    key={node.id}
                    className="min-w-0 rounded-md bg-secondary px-2 py-1.5 text-xs"
                  >
                    <div className="truncate font-medium">{node.title}</div>
                    <div className="truncate text-muted-foreground">
                      {node.kind} / {shortSchemaId(node.schemaId)}
                    </div>
                  </div>
                ))}
                {group.nodes.length > 8 ? (
                  <div className="text-xs text-muted-foreground">
                    +{(group.nodes.length - 8).toLocaleString()} more in this lane
                  </div>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProjectionMetric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value.toLocaleString()}</div>
    </div>
  )
}

type SavedViewVisualGraphEdge = {
  id: string
  kind: string
  sourceNodeId: string
  targetNodeId: string
  sourceTitle: string
  targetTitle: string
  targetVisible: boolean
}

function deriveSavedViewVisualGraphEdges(
  previews: readonly SavedViewVisualPreviewModel[]
): SavedViewVisualGraphEdge[] {
  const previewBySourceNodeId = new Map(previews.map((preview) => [preview.sourceNodeId, preview]))

  return previews.flatMap((preview) =>
    preview.relationships.map((relationship, index) => {
      const target = previewBySourceNodeId.get(relationship.targetNodeId)

      return {
        id: `${preview.id}:${relationship.kind}:${relationship.targetNodeId}:${index}`,
        kind: relationship.kind,
        sourceNodeId: preview.sourceNodeId,
        targetNodeId: relationship.targetNodeId,
        sourceTitle: preview.title,
        targetTitle: target?.title ?? relationship.label ?? relationship.targetNodeId,
        targetVisible: Boolean(target)
      }
    })
  )
}

function SavedViewVisualGraphPanel({
  previews,
  edges,
  selectedSourceNodeId,
  onSelectSourceNode
}: {
  previews: SavedViewVisualPreviewModel[]
  edges: SavedViewVisualGraphEdge[]
  selectedSourceNodeId: string | null
  onSelectSourceNode: (sourceNodeId: string) => void
}): JSX.Element {
  const groups = useMemo(
    () =>
      groupCanvasProjectionNodes(
        createSavedViewCanvasProjectionNodes(previews, {
          limit: VISUAL_CANVAS_PROJECTION_LIMIT,
          groupBy: 'creator'
        })
      ),
    [previews]
  )
  const visibleEdges = edges.slice(0, VISUAL_GRAPH_EDGE_LIMIT)

  if (previews.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        No visual rows are available for graph analysis.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitBranch size={14} className="text-muted-foreground" />
          <span>Graph Summary</span>
          <span className="text-xs font-normal text-muted-foreground">
            {edges.length.toLocaleString()} relationships
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          Bounded to {VISUAL_GRAPH_EDGE_LIMIT.toLocaleString()} rendered edges.
        </span>
      </div>

      <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section className="min-w-0 rounded-md border border-border p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Clusters</h3>
            <span className="text-xs text-muted-foreground">{groups.length}</span>
          </div>
          <div className="space-y-2">
            {groups.slice(0, 12).map((group) => (
              <div key={group.key} className="min-w-0 rounded-md bg-secondary/60 p-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{formatGroupLabel(group.key)}</span>
                  <span className="text-muted-foreground">{group.nodes.length}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-foreground"
                    style={{
                      width: `${Math.max(
                        8,
                        (group.nodes.length /
                          Math.max(...groups.map((item) => item.nodes.length), 1)) *
                          100
                      )}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="min-w-0 rounded-md border border-border p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Relationships</h3>
            <span className="text-xs text-muted-foreground">
              {visibleEdges.length.toLocaleString()} shown
            </span>
          </div>
          {visibleEdges.length > 0 ? (
            <div className="space-y-2">
              {visibleEdges.map((edge) => (
                <button
                  key={edge.id}
                  type="button"
                  onClick={() => onSelectSourceNode(edge.sourceNodeId)}
                  className={classNames([
                    'grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition-colors hover:bg-accent',
                    selectedSourceNodeId === edge.sourceNodeId
                      ? 'border-foreground'
                      : 'border-border'
                  ])}
                >
                  <span className="truncate font-medium">{edge.sourceTitle}</span>
                  <span className="rounded-md bg-secondary px-2 py-1 text-muted-foreground">
                    {edge.kind}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {edge.targetVisible ? edge.targetTitle : `${edge.targetTitle} (external)`}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No explicit relationship fields are loaded in this view. Try a graph-lens saved view
              or a layout grouped by creator/platform to explore clusters.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function formatGroupLabel(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ')
}

function SavedViewVisualPreviewCard({
  preview,
  selected,
  live,
  compact = false,
  onSelect,
  onToggleLiveEmbed
}: {
  preview: SavedViewVisualPreviewModel
  selected: boolean
  live: boolean
  compact?: boolean
  onSelect: () => void
  onToggleLiveEmbed: () => void
}): JSX.Element {
  const embeddable = isSavedViewVisualPreviewEmbeddable(preview)
  const sensitive = hasSavedViewVisualPreviewSensitiveData(preview)
  const Icon = iconForVisualPreviewKind(preview.kind)
  const timestampLabel = preview.timestamp ? new Date(preview.timestamp).toLocaleString() : null
  const metricEntries = Object.entries(preview.metrics).slice(0, 2)

  return (
    <article
      tabIndex={0}
      aria-label={`Preview ${preview.title}`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={classNames([
        'min-w-0 overflow-hidden rounded-md border bg-background shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        selected ? 'border-foreground' : 'border-border hover:border-foreground/40'
      ])}
      style={{ contentVisibility: 'auto', containIntrinsicSize: compact ? '220px' : '300px' }}
    >
      {live && embeddable ? (
        <div className="aspect-video border-b border-border bg-black">
          <iframe
            title={preview.title}
            src={preview.embedUrl}
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
            className="h-full w-full"
          />
        </div>
      ) : preview.thumbnailUrl && preview.privacy === 'public' ? (
        <button
          type="button"
          onClick={onSelect}
          className="group relative block aspect-video w-full overflow-hidden border-b border-border bg-muted text-left"
          aria-label={`Inspect ${preview.title}`}
        >
          <img
            src={preview.thumbnailUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
          />
          <span className="absolute left-2 top-2 rounded-md bg-background/90 px-2 py-1 text-xs font-medium">
            {providerLabel(preview)}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={onSelect}
          className="flex aspect-video w-full items-center justify-center border-b border-border bg-secondary/40 text-muted-foreground"
          aria-label={`Inspect ${preview.title}`}
        >
          <div className="flex flex-col items-center gap-2">
            <Icon size={compact ? 20 : 28} />
            <span className="max-w-[14rem] truncate text-xs">{providerLabel(preview)}</span>
          </div>
        </button>
      )}

      <div className="space-y-3 p-3">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={onSelect}
            className="min-w-0 flex-1 text-left"
            aria-label={`Inspect ${preview.title}`}
          >
            <h3 className="line-clamp-2 text-sm font-semibold leading-5">{preview.title}</h3>
            {preview.subtitle ? (
              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{preview.subtitle}</p>
            ) : null}
          </button>
          <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
            {preview.kind}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
          {preview.creator ? (
            <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary px-2 py-1">
              <UserRound size={11} />
              <span className="truncate">{preview.creator.label}</span>
            </span>
          ) : null}
          {timestampLabel ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1">
              <CalendarDays size={11} />
              {timestampLabel}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1">
            <Shield size={11} />
            {preview.privacy}
          </span>
          {metricEntries.map(([metric, value]) => (
            <span key={metric} className="rounded-md bg-secondary px-2 py-1">
              {metric}: {value.toLocaleString()}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSelect}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent"
          >
            <FileSearch size={12} />
            Inspect
          </button>
          {preview.url ? (
            <a
              href={preview.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent"
            >
              <ExternalLink size={12} />
              Open
            </a>
          ) : null}
          {embeddable ? (
            <button
              type="button"
              onClick={onToggleLiveEmbed}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent"
            >
              {live ? <Image size={12} /> : <Play size={12} />}
              {live ? 'Preview' : 'Live'}
            </button>
          ) : sensitive ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-1 text-xs text-muted-foreground">
              <Shield size={12} />
              Local preview
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function iconForVisualPreviewKind(kind: SavedViewVisualPreviewKind): LucideIcon {
  switch (kind) {
    case 'actor':
      return UserRound
    case 'message':
      return MessageSquare
    case 'reference':
      return Link
    case 'interaction':
      return GitBranch
    case 'collection':
      return Columns3
    case 'content':
      return Image
    case 'record':
      return FileSearch
  }
}

function providerLabel(preview: SavedViewVisualPreviewModel): string {
  if (preview.provider && preview.provider !== 'generic') return preview.provider
  return preview.platform
}

function SavedViewFacetShelf({
  summaries,
  selection,
  onToggleValue,
  onClearField,
  onClearAll
}: {
  summaries: SavedViewFacetSummary[]
  selection: SavedViewFacetSelection
  onToggleValue: (field: string, valueKey: string) => void
  onClearField: (field: string) => void
  onClearAll: () => void
}): JSX.Element | null {
  const activeCount = Object.values(selection).reduce((sum, values) => sum + values.length, 0)

  if (summaries.length === 0) return null

  return (
    <div className="rounded-md border border-border bg-secondary/20 p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Filter size={14} className="text-muted-foreground" />
          <span>Facets</span>
          <span className="text-xs font-normal text-muted-foreground">loaded rows</span>
        </div>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X size={12} />
            Clear facets
          </button>
        ) : null}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {summaries.map((facet) => {
          const selectedValues = selection[facet.field] ?? []

          return (
            <div key={facet.field} className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-medium text-muted-foreground">
                  {facet.field}
                </span>
                {selectedValues.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onClearField(facet.field)}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Clear
                  </button>
                ) : (
                  <span className="text-muted-foreground">{facet.totalValues} values</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {facet.values.map((value) => {
                  const selected = selectedValues.includes(value.valueKey)

                  return (
                    <button
                      key={value.valueKey}
                      type="button"
                      onClick={() => onToggleValue(facet.field, value.valueKey)}
                      className={classNames([
                        'max-w-full rounded-md border px-2 py-1 text-xs transition-colors',
                        selected
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border bg-background hover:bg-accent'
                      ])}
                    >
                      <span className="inline-block max-w-40 truncate align-bottom">
                        {value.label}
                      </span>
                      <span className="ml-1 opacity-70">{value.count.toLocaleString()}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SavedViewTimelineBrush({
  summaries,
  selection,
  onSelectField,
  onToggleBucket,
  onClear
}: {
  summaries: SavedViewDateBucketFieldSummary[]
  selection: SavedViewDateBrushSelection
  onSelectField: (field: string) => void
  onToggleBucket: (field: string, bucketKey: string) => void
  onClear: () => void
}): JSX.Element | null {
  if (summaries.length === 0) return null

  const activeSummary =
    summaries.find((summary) => summary.field === selection.field) ?? summaries[0]
  const selectedBucketKeys = selection.field === activeSummary.field ? selection.bucketKeys : []
  const maxCount = Math.max(...activeSummary.buckets.map((bucket) => bucket.count), 1)

  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <CalendarDays size={14} className="text-muted-foreground" />
          <span>Timeline</span>
          <span className="text-xs font-normal text-muted-foreground">
            {activeSummary.interval} buckets
          </span>
        </div>
        <div className="flex items-center gap-2">
          {summaries.length > 1 ? (
            <select
              value={activeSummary.field}
              onChange={(event) => onSelectField(event.currentTarget.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {summaries.map((summary) => (
                <option key={summary.field} value={summary.field}>
                  {summary.field}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-muted-foreground">{activeSummary.field}</span>
          )}
          {selectedBucketKeys.length > 0 ? (
            <button
              type="button"
              onClick={onClear}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={12} />
              Clear
            </button>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="flex min-h-[92px] items-end gap-2">
          {activeSummary.buckets.map((bucket) => {
            const selected = selectedBucketKeys.includes(bucket.bucketKey)
            const height = Math.max(10, Math.round((bucket.count / maxCount) * 56))

            return (
              <button
                key={bucket.bucketKey}
                type="button"
                onClick={() => onToggleBucket(activeSummary.field, bucket.bucketKey)}
                className={classNames([
                  'flex min-w-[72px] flex-col items-center gap-1 rounded-md border px-2 py-2 text-xs transition-colors',
                  selected
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:bg-accent'
                ])}
              >
                <span
                  className={classNames([
                    'block w-full rounded-sm',
                    selected ? 'bg-background/80' : 'bg-foreground/70'
                  ])}
                  style={{ height }}
                  aria-hidden="true"
                />
                <span className="w-full truncate text-center">{bucket.label}</span>
                <span className="opacity-70">{bucket.count.toLocaleString()}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SavedViewRowInspector({
  row,
  query
}: {
  row: Record<string, unknown> | null
  query: SavedViewQueryResult | null
}): JSX.Element {
  if (!row) {
    return (
      <aside className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
          <Info size={14} />
          Inspector
        </div>
        Expand a row to inspect its fields, relations, source records, and import metadata.
      </aside>
    )
  }

  const model = deriveSavedViewRowInspector(row, query)

  return (
    <aside className="min-w-0 rounded-md border border-border bg-secondary/20 p-4">
      <div className="mb-4 min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Info size={14} className="text-muted-foreground" />
          <span>Inspector</span>
        </div>
        <div className="mt-2 min-w-0 space-y-1 text-xs text-muted-foreground">
          {model.rowRole ? <div>{model.rowRole}</div> : null}
          <div className="truncate">{shortSchemaId(model.schemaId)}</div>
          <div className="truncate font-mono">{model.rowId}</div>
        </div>
      </div>

      <div className="space-y-4">
        <SavedViewInspectorSection
          title="Fields"
          icon={Table}
          items={model.fields}
          emptyLabel="No scalar fields."
        />
        <SavedViewInspectorSection
          title="Relations"
          icon={GitBranch}
          items={model.relations}
          emptyLabel="No relation-like fields."
        />
        <SavedViewInspectorSection
          title="Source Records"
          icon={FileSearch}
          items={model.sourceRecords}
          emptyLabel="No source metadata."
        />
        <SavedViewInspectorSection
          title="Import Runs"
          icon={RefreshCw}
          items={model.importRuns}
          emptyLabel="No import metadata."
        />
        <details className="rounded-md border border-border bg-background">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium">
            Raw JSON
          </summary>
          <pre className="max-h-80 overflow-auto border-t border-border p-3 text-xs">
            {model.rawJson}
          </pre>
        </details>
      </div>
    </aside>
  )
}

function SavedViewInspectorSection({
  title,
  icon: Icon,
  items,
  emptyLabel
}: {
  title: string
  icon: LucideIcon
  items: SavedViewInspectorItem[]
  emptyLabel: string
}): JSX.Element {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon size={13} />
        {title}
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <dl className="space-y-2">
          {items.map((item) => (
            <div key={item.key} className="rounded-md border border-border bg-background p-2">
              <dt className="truncate text-xs font-medium text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 break-words text-sm">{item.formatted}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

export function SavedViewResultTable({
  query,
  columns,
  expandedRowId,
  onToggleRow,
  loadingLabel = 'Loading',
  emptyLabel = 'No rows.',
  formatValue
}: SavedViewResultTableProps): JSX.Element {
  if (!query || query.loading) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
        <Loader2 size={16} className="mr-2 animate-spin" />
        {loadingLabel}
      </div>
    )
  }

  if (query.data.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-secondary text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-9 px-3 py-2 font-medium" />
              {columns.map((column) => (
                <th key={column} className="min-w-[140px] px-3 py-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {query.data.map((row) => {
              const record = row as Record<string, unknown>
              const expanded = expandedRowId === row.id

              return (
                <Fragment key={row.id}>
                  <tr className="border-t border-border">
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        onClick={() => onToggleRow(row.id)}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label={expanded ? 'Collapse row' : 'Expand row'}
                      >
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </td>
                    {columns.map((column) => (
                      <td key={column} className="max-w-[260px] px-3 py-2 align-top">
                        <div className="truncate">
                          {formatValue
                            ? formatValue({ column, value: record[column], row: record })
                            : formatSavedViewCellValue(column, record[column])}
                        </div>
                      </td>
                    ))}
                  </tr>
                  {expanded ? (
                    <tr className="border-t border-border bg-secondary/30">
                      <td colSpan={columns.length + 1} className="px-3 py-3">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{shortSchemaId(row.schemaId)}</span>
                          <span>{row.id}</span>
                        </div>
                        <pre className="max-h-80 overflow-auto rounded-md bg-background p-3 text-xs">
                          {JSON.stringify(record, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SavedViewDiagnostics({
  result,
  query
}: {
  result: UseSavedViewResult
  query: SavedViewQueryResult | null
}): JSX.Element | null {
  const blockers = [...new Set([...result.blockers, ...(query?.blockers ?? [])])]
  const warnings = [...new Set([...result.warnings, ...(query?.warnings ?? [])])]

  if (blockers.length === 0 && warnings.length === 0 && !result.error && !query?.error) {
    return null
  }

  return (
    <div className="space-y-2">
      {result.error || query?.error ? (
        <SavedViewStatusBanner
          tone="error"
          message={(query?.error ?? result.error)?.message ?? 'Error'}
        />
      ) : null}
      {blockers.map((blocker) => (
        <SavedViewStatusBanner key={blocker} tone="error" message={blocker} />
      ))}
      {warnings.map((warning) => (
        <SavedViewStatusBanner key={warning} tone="warning" message={warning} />
      ))}
    </div>
  )
}

function SavedViewPrivacyChips({
  query
}: {
  query: SavedViewQueryResult | null
}): JSX.Element | null {
  const chips = deriveSavedViewPrivacyChips(query)
  const sensitiveCount = query?.privacy.sensitiveCount ?? 0
  if (chips.length === 0) return null

  return (
    <>
      {sensitiveCount > 0 ? (
        <span
          className={classNames([
            'flex items-center gap-1 rounded-md border px-2 py-1',
            privacyChipClassName('warning')
          ])}
        >
          <Shield size={13} />
          {sensitiveCount.toLocaleString()} sensitive
        </span>
      ) : null}
      {chips.map((chip) => (
        <span
          key={chip.privacyClass}
          className={classNames(['rounded-md border px-2 py-1', privacyChipClassName(chip.tone)])}
        >
          {chip.label}: {chip.count.toLocaleString()}
        </span>
      ))}
    </>
  )
}

function SavedViewSensitiveResultWarning({
  query
}: {
  query: SavedViewQueryResult | null
}): JSX.Element | null {
  const message = getSavedViewSensitiveResultWarning(query)
  if (!message) return null

  return <SavedViewStatusBanner tone="warning" message={message} />
}

function SavedViewStatusBanner({
  message,
  tone
}: {
  message: string
  tone: 'error' | 'success' | 'warning'
}): JSX.Element {
  const toneClassName = {
    error: 'border-destructive/40 bg-destructive/10 text-destructive',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }[tone]

  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${toneClassName}`}>
      <Shield size={15} />
      <span className="min-w-0 truncate">{message}</span>
    </div>
  )
}

function shortSchemaId(schemaId: string): string {
  return schemaId.split('/').at(-1) ?? schemaId
}

function privacyChipClassName(tone: SavedViewPrivacyChipTone): string {
  return {
    safe: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    neutral: 'border-border bg-background text-muted-foreground',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }[tone]
}

function isSensitivePrivacyClass(privacyClass: string): boolean {
  return !NON_SENSITIVE_PRIVACY_CLASSES.has(privacyClass)
}

function privacyClassPriority(privacyClass: string): number {
  if (privacyClass === 'public') return 0
  if (privacyClass === 'unknown') return 2
  return 1
}

function formatPrivacyClassLabel(privacyClass: string): string {
  return privacyClass
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural
}

function nodeQueryForSavedLens(
  query: SavedViewDescriptor['query'],
  queryId: string
): QueryASTNodeQuery | null {
  if (query.kind === 'node') return query
  return query.queries[queryId] ?? null
}

function facetPredicatesForSavedLens(
  rows: readonly Record<string, unknown>[],
  selection: SavedViewFacetSelection
): QueryASTPredicate[] {
  return Object.entries(selection).flatMap(([field, valueKeys]) => {
    if (valueKeys.length === 0) return []

    const valuesByKey = rows.reduce<Map<string, unknown>>((current, row) => {
      const value = row[field]
      if (isFacetScalarValue(value) && !current.has(facetValueKey(value))) {
        current.set(facetValueKey(value), value)
      }
      return current
    }, new Map())
    const values = valueKeys.flatMap((valueKey) =>
      valuesByKey.has(valueKey) ? [valuesByKey.get(valueKey)] : []
    )

    return values.length > 0 ? [{ kind: 'comparison', field, op: 'in', values }] : []
  })
}

function datePredicateForSavedLens(
  selection: SavedViewDateBrushSelection
): QueryASTPredicate | null {
  if (!selection.field || selection.bucketKeys.length === 0) return null

  const predicates = selection.bucketKeys.flatMap((bucketKey) => {
    const [interval, start] = bucketKey.split(':')
    const startMs = Number(start)
    if (
      !Number.isFinite(startMs) ||
      (interval !== 'day' && interval !== 'month' && interval !== 'year')
    ) {
      return []
    }

    return [
      {
        kind: 'comparison',
        field: selection.field ?? '',
        op: 'between',
        values: [startMs, dateBucketEndMs(startMs, interval) - 1]
      } satisfies QueryASTPredicate
    ]
  })

  if (predicates.length === 0) return null
  return predicates.length === 1 ? predicates[0] : { kind: 'or', predicates }
}

function scalarString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function graphLensNodeLabel(row: Record<string, unknown>): string {
  return (
    scalarString(row.displayName) ??
    scalarString(row.title) ??
    scalarString(row.handle) ??
    scalarString(row.name) ??
    scalarString(row.id) ??
    'Untitled record'
  )
}

function graphLensNodeDetail(
  row: Record<string, unknown>,
  query: SavedViewQueryResult,
  sourceRecordId: string | null
): string {
  const parts = [
    scalarString(row.platform),
    scalarString(row.privacyClass),
    sourceRecordId ? `source ${sourceRecordId}` : null
  ].filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join(' / ') : query.rowRole
}

function mergeSavedViewPredicates(
  base: QueryASTPredicate | undefined,
  added: readonly QueryASTPredicate[]
): QueryASTPredicate | undefined {
  const predicates = [base, ...added].filter((predicate): predicate is QueryASTPredicate =>
    Boolean(predicate)
  )

  if (predicates.length === 0) return undefined
  return predicates.length === 1 ? predicates[0] : { kind: 'and', predicates }
}

function savedLensSummary(input: {
  facetFields: string[]
  dateBrushSelection: SavedViewDateBrushSelection
  sortField: string
  pageSize: number
}): string[] {
  return [
    ...input.facetFields.map((field) => `${field} facets`),
    ...(input.dateBrushSelection.field && input.dateBrushSelection.bucketKeys.length > 0
      ? [
          `${input.dateBrushSelection.bucketKeys.length} timeline ${pluralize(input.dateBrushSelection.bucketKeys.length, 'bucket')}`
        ]
      : []),
    ...(input.sortField ? [`${input.sortField} sort`] : []),
    `${input.pageSize.toLocaleString()} rows per page`
  ]
}

function isFacetScalarValue(value: unknown): value is string | number | boolean | null | undefined {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function facetValueKey(value: unknown): string {
  if (value === null || value === undefined || value === '') return '__empty__'
  if (typeof value === 'number') return `number:${value}`
  if (typeof value === 'boolean') return `boolean:${value}`
  return `string:${String(value)}`
}

function facetValueLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Empty'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  return String(value)
}

function toggleFacetSelection(
  selection: Record<string, string[]>,
  field: string,
  valueKey: string
): Record<string, string[]> {
  const currentValues = selection[field] ?? []
  const nextValues = currentValues.includes(valueKey)
    ? currentValues.filter((current) => current !== valueKey)
    : [...currentValues, valueKey]

  if (nextValues.length === 0) {
    return omitFacetSelectionField(selection, field)
  }

  return { ...selection, [field]: nextValues }
}

function omitFacetSelectionField(
  selection: Record<string, string[]>,
  field: string
): Record<string, string[]> {
  return Object.fromEntries(Object.entries(selection).filter(([key]) => key !== field))
}

function sameFacetSelection(
  left: Record<string, string[]>,
  right: Record<string, string[]>
): boolean {
  const leftEntries = Object.entries(left)
  const rightEntries = Object.entries(right)
  if (leftEntries.length !== rightEntries.length) return false

  return leftEntries.every(([field, values]) => {
    const rightValues = right[field]
    return (
      rightValues !== undefined &&
      values.length === rightValues.length &&
      values.every((value, index) => value === rightValues[index])
    )
  })
}

function isDateColumnName(column: string): boolean {
  return PREFERRED_DATE_COLUMNS.includes(column) || column.endsWith('At') || column.endsWith('Date')
}

function parseSavedViewDateValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1_000_000_000_000) return value
    if (value > 1_000_000_000) return value * 1000
    return null
  }

  if (typeof value !== 'string' || value.trim() === '') return null

  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

function intervalForDateRange(minMs: number, maxMs: number): SavedViewDateBucketInterval {
  const range = Math.max(0, maxMs - minMs)
  if (range <= DAY_MS * 45) return 'day'
  if (range <= DAY_MS * 730) return 'month'
  return 'year'
}

function dateBucketStartMs(timestamp: number, interval: SavedViewDateBucketInterval): number {
  const date = new Date(timestamp)

  if (interval === 'year') {
    return Date.UTC(date.getUTCFullYear(), 0, 1)
  }

  if (interval === 'month') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)
  }

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function dateBucketEndMs(startMs: number, interval: SavedViewDateBucketInterval): number {
  const date = new Date(startMs)

  if (interval === 'year') {
    return Date.UTC(date.getUTCFullYear() + 1, 0, 1)
  }

  if (interval === 'month') {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
  }

  return startMs + DAY_MS
}

function dateBucketKey(interval: SavedViewDateBucketInterval, startMs: number): string {
  return `${interval}:${startMs}`
}

function intervalFromDateBucketKey(value: string): SavedViewDateBucketInterval | null {
  const [interval] = value.split(':')
  return interval === 'day' || interval === 'month' || interval === 'year' ? interval : null
}

function dateBucketLabel(startMs: number, interval: SavedViewDateBucketInterval): string {
  const date = new Date(startMs)

  if (interval === 'year') {
    return String(date.getUTCFullYear())
  }

  if (interval === 'month') {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    })
  }

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  })
}

function toggleDateBrushSelection(
  selection: SavedViewDateBrushSelection,
  field: string,
  bucketKey: string
): SavedViewDateBrushSelection {
  const currentBucketKeys = selection.field === field ? selection.bucketKeys : []
  const nextBucketKeys = currentBucketKeys.includes(bucketKey)
    ? currentBucketKeys.filter((current) => current !== bucketKey)
    : [...currentBucketKeys, bucketKey]

  return {
    field: nextBucketKeys.length > 0 ? field : null,
    bucketKeys: nextBucketKeys
  }
}

function sameDateBrushSelection(
  left: SavedViewDateBrushSelection,
  right: SavedViewDateBrushSelection
): boolean {
  return (
    left.field === right.field &&
    left.bucketKeys.length === right.bucketKeys.length &&
    left.bucketKeys.every((bucketKey, index) => bucketKey === right.bucketKeys[index])
  )
}

function inspectorItemKind(key: string): SavedViewInspectorItemKind {
  if (isImportInspectorField(key)) return 'import'
  if (isSourceInspectorField(key)) return 'source'
  if (isRelationInspectorField(key)) return 'relation'
  return 'field'
}

function isRelationInspectorField(key: string): boolean {
  if (key === 'id' || key === 'schemaId') return false
  const lower = key.toLowerCase()
  return (
    lower.endsWith('id') ||
    lower.endsWith('ids') ||
    lower.endsWith('did') ||
    lower.endsWith('dids') ||
    [
      'actor',
      'actors',
      'authoractor',
      'sourceactor',
      'targetactor',
      'conversation',
      'content',
      'collection',
      'parent',
      'replyto'
    ].includes(lower)
  )
}

function isSourceInspectorField(key: string): boolean {
  const lower = key.toLowerCase()
  return (
    lower.includes('source') ||
    lower.includes('external') ||
    lower.includes('archive') ||
    lower.includes('raw') ||
    lower.includes('permalink') ||
    lower.includes('url') ||
    lower.includes('path') ||
    lower === 'platform'
  )
}

function isImportInspectorField(key: string): boolean {
  const lower = key.toLowerCase()
  return (
    lower.includes('importrun') ||
    lower.includes('imported') ||
    lower === 'importid' ||
    lower === 'importsource'
  )
}

function inspectorFieldPriority(key: string): number {
  const primaryIndex = INSPECTOR_PRIMARY_FIELDS.indexOf(key)
  if (primaryIndex >= 0) return primaryIndex
  if (key === 'sourceRecordId') return 0
  if (key === 'sourceRecordKind') return 1
  if (key === 'importRunId') return 0
  if (key === 'importedAt') return 1
  return INSPECTOR_PRIMARY_FIELDS.length + key.length
}

function formatSavedViewInspectorValue(key: string, value: unknown): string {
  if (typeof value === 'number' && isDateColumnName(key)) {
    return new Date(value > 1_000_000_000_000 ? value : value * 1000).toLocaleString()
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.every((item) => isFacetScalarValue(item))) {
      return value.map((item) => facetValueLabel(item)).join(', ')
    }
    return JSON.stringify(value, null, 2)
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }

  return formatSavedViewCellValue(key, value)
}
