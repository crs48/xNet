/**
 * Query-backed canvas frame helpers.
 */

import type { CanvasViewportSnapshot } from '../ingestion'
import type { CanvasNode, CanvasNodeProperties, Point } from '../types'
import type {
  QueryASTNodeQuery,
  QueryASTOperator,
  QueryASTPredicate,
  SavedViewDescriptor
} from '@xnetjs/data'
import { getCanvasContainerRole } from '../selection/scene-operations'
import { createCanvasFrameVariantNode, createCanvasFrameVariantProperties } from './frame-variants'

export type CanvasQueryFrameSource = 'database' | 'schema' | 'search' | 'plugin' | 'custom'

export type CanvasQueryFrameRefreshMode = 'manual' | 'on-open' | 'live'

export type CanvasQueryFrameRefreshTrigger = 'manual' | 'open' | 'result-change'

export type CanvasQueryFrameMaterialization = 'virtual' | 'pinned-cards' | 'synced-cards'

export type CanvasQueryFrameExecutionStatus = 'idle' | 'loading' | 'success' | 'error'

export type CanvasQueryFrameFilterOperator =
  | 'equals'
  | 'not-equals'
  | 'contains'
  | 'greater-than'
  | 'greater-than-or-equal'
  | 'less-than'
  | 'less-than-or-equal'
  | 'in'
  | 'exists'

export type CanvasQueryFrameFilter = {
  field: string
  operator: CanvasQueryFrameFilterOperator
  value?: unknown
}

export type CanvasQueryFrameSort = {
  field: string
  direction: 'asc' | 'desc'
}

export type CanvasQueryFrameDefinition = {
  id: string
  source: CanvasQueryFrameSource
  label: string
  schemaId?: string
  databaseId?: string
  viewId?: string
  pluginId?: string
  queryText?: string
  filters: readonly CanvasQueryFrameFilter[]
  sorts: readonly CanvasQueryFrameSort[]
  limit: number
  refreshMode: CanvasQueryFrameRefreshMode
  materialization: CanvasQueryFrameMaterialization
  resultCardKind?: string
}

export type CanvasQueryFrameResultSummary = {
  totalCount: number
  visibleCount: number
  stale: boolean
  status: CanvasQueryFrameExecutionStatus
  sourceVersion?: string
  contentHash?: string
  lastUpdatedAt?: string
  errorMessage?: string
}

export type CanvasQueryFrameExecutionSnapshot = {
  status?: CanvasQueryFrameExecutionStatus | null
  loading?: boolean | null
  totalCount?: number | null
  visibleCount?: number | null
  sourceVersion?: string | null
  contentHash?: string | null
  errorMessage?: string | null
}

export type CanvasQueryFrameResultCard = {
  id: string
  title: string
  subtitle?: string
  eyebrow?: string
  description?: string
  sourceNodeId?: string
  schemaId?: string
  href?: string
  badges: readonly string[]
}

export type CanvasQueryFrameResultPreview = {
  cards: readonly CanvasQueryFrameResultCard[]
  overflowCount: number
}

export type ShouldRefreshCanvasQueryFrameResultInput = {
  refreshMode: CanvasQueryFrameRefreshMode
  trigger: CanvasQueryFrameRefreshTrigger
  currentSummary: CanvasQueryFrameResultSummary
  nextSummary: CanvasQueryFrameResultSummary
  currentPreview: CanvasQueryFrameResultPreview
  nextPreview: CanvasQueryFrameResultPreview
}

export type CreateCanvasQueryFrameResultPreviewInput = {
  cards?: readonly Partial<CanvasQueryFrameResultCard>[] | null
  overflowCount?: number | null
}

export type CanvasQueryFrameProperties = CanvasNodeProperties & {
  containerRole: 'frame'
  frameVariant: 'query'
  frameIntent: 'query'
  queryMode: 'saved-query'
  queryText: string
  queryDefinition: CanvasQueryFrameDefinition
  queryResultSummary: CanvasQueryFrameResultSummary
  queryResultPreview: CanvasQueryFrameResultPreview
}

export type CreateCanvasQueryFrameDefinitionInput = {
  id?: string | null
  source: CanvasQueryFrameSource
  label?: string | null
  schemaId?: string | null
  databaseId?: string | null
  viewId?: string | null
  pluginId?: string | null
  queryText?: string | null
  filters?: readonly CanvasQueryFrameFilter[] | null
  sorts?: readonly CanvasQueryFrameSort[] | null
  limit?: number | null
  refreshMode?: CanvasQueryFrameRefreshMode | null
  materialization?: CanvasQueryFrameMaterialization | null
  resultCardKind?: string | null
}

export type CreateCanvasQueryFrameDefinitionFromSavedViewInput = {
  viewId: string
  descriptor: SavedViewDescriptor
  queryId?: string | null
  label?: string | null
  resultCardKind?: string | null
}

export type CreateCanvasQueryFramePropertiesInput = {
  query: CreateCanvasQueryFrameDefinitionInput
  title?: string | null
  properties?: CanvasNodeProperties
  resultSummary?: Partial<CanvasQueryFrameResultSummary> | null
  resultPreview?: CreateCanvasQueryFrameResultPreviewInput | null
}

export type CreateCanvasQueryFrameNodeInput = CreateCanvasQueryFramePropertiesInput & {
  viewport: CanvasViewportSnapshot
  canvasPoint?: Point | null
  spreadIndex?: number
}

const DEFAULT_QUERY_LIMIT = 50
const MAX_QUERY_LIMIT = 500
const MAX_QUERY_PREVIEW_CARDS = 8

const FILTER_OPERATORS: readonly CanvasQueryFrameFilterOperator[] = [
  'equals',
  'not-equals',
  'contains',
  'greater-than',
  'greater-than-or-equal',
  'less-than',
  'less-than-or-equal',
  'in',
  'exists'
]
const QUERY_AST_TO_FRAME_OPERATOR: Record<QueryASTOperator, CanvasQueryFrameFilterOperator | null> =
  {
    eq: 'equals',
    neq: 'not-equals',
    contains: 'contains',
    gt: 'greater-than',
    gte: 'greater-than-or-equal',
    lt: 'less-than',
    lte: 'less-than-or-equal',
    in: 'in',
    isNotNull: 'exists',
    startsWith: 'contains',
    between: null,
    isNull: null
  }

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function clampLimit(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_QUERY_LIMIT
  }

  return Math.max(1, Math.min(MAX_QUERY_LIMIT, Math.floor(value)))
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'results'
}

function createStableQueryId(input: CreateCanvasQueryFrameDefinitionInput, label: string): string {
  const sourceKey =
    normalizeString(input.databaseId) ??
    normalizeString(input.schemaId) ??
    normalizeString(input.viewId) ??
    normalizeString(input.pluginId) ??
    label

  return `canvas-query:${input.source}:${slugify(sourceKey)}`
}

function normalizeFilters(
  filters: readonly CanvasQueryFrameFilter[] | null | undefined
): readonly CanvasQueryFrameFilter[] {
  if (!filters) {
    return []
  }

  return filters
    .map((filter) => ({
      ...filter,
      field: normalizeString(filter.field) ?? '',
      operator: filter.operator
    }))
    .filter(
      (filter): filter is CanvasQueryFrameFilter =>
        filter.field.length > 0 && FILTER_OPERATORS.includes(filter.operator)
    )
}

function normalizeSorts(
  sorts: readonly CanvasQueryFrameSort[] | null | undefined
): readonly CanvasQueryFrameSort[] {
  if (!sorts) {
    return []
  }

  return sorts
    .map((sort) => ({
      field: normalizeString(sort.field) ?? '',
      direction: sort.direction === 'desc' ? 'desc' : 'asc'
    }))
    .filter((sort): sort is CanvasQueryFrameSort => sort.field.length > 0)
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readQueryFrameSource(value: unknown): CanvasQueryFrameSource | null {
  return value === 'database' ||
    value === 'schema' ||
    value === 'search' ||
    value === 'plugin' ||
    value === 'custom'
    ? value
    : null
}

function readRefreshMode(value: unknown): CanvasQueryFrameRefreshMode | null {
  return value === 'manual' || value === 'on-open' || value === 'live' ? value : null
}

function readMaterialization(value: unknown): CanvasQueryFrameMaterialization | null {
  return value === 'virtual' || value === 'pinned-cards' || value === 'synced-cards' ? value : null
}

function readExecutionStatus(value: unknown): CanvasQueryFrameExecutionStatus | null {
  return value === 'idle' || value === 'loading' || value === 'success' || value === 'error'
    ? value
    : null
}

export function createCanvasQueryFrameDefinition(
  input: CreateCanvasQueryFrameDefinitionInput
): CanvasQueryFrameDefinition {
  const label =
    normalizeString(input.label) ??
    normalizeString(input.queryText) ??
    normalizeString(input.viewId) ??
    'Saved query'

  return {
    id: normalizeString(input.id) ?? createStableQueryId(input, label),
    source: input.source,
    label,
    schemaId: normalizeString(input.schemaId) ?? undefined,
    databaseId: normalizeString(input.databaseId) ?? undefined,
    viewId: normalizeString(input.viewId) ?? undefined,
    pluginId: normalizeString(input.pluginId) ?? undefined,
    queryText: normalizeString(input.queryText) ?? undefined,
    filters: normalizeFilters(input.filters),
    sorts: normalizeSorts(input.sorts),
    limit: clampLimit(input.limit),
    refreshMode: input.refreshMode ?? 'manual',
    materialization: input.materialization ?? 'virtual',
    resultCardKind: normalizeString(input.resultCardKind) ?? undefined
  }
}

export function createCanvasQueryFrameDefinitionFromSavedView(
  input: CreateCanvasQueryFrameDefinitionFromSavedViewInput
): CanvasQueryFrameDefinition {
  const nodeQuery = nodeQueryForSavedView(input.descriptor, input.queryId)
  const label = normalizeString(input.label) ?? input.descriptor.title
  const queryText = JSON.stringify(input.descriptor)

  return createCanvasQueryFrameDefinition({
    source: nodeQuery ? 'schema' : 'custom',
    label,
    viewId: input.viewId,
    schemaId: nodeQuery?.schemaId,
    queryText,
    filters: nodeQuery ? queryAstPredicateToFrameFilters(nodeQuery.predicate) : [],
    sorts: nodeQuery?.orderBy ?? [],
    limit: nodeQuery?.page?.first,
    refreshMode: 'manual',
    materialization: 'virtual',
    resultCardKind: normalizeString(input.resultCardKind) ?? 'saved-view.result-card'
  })
}

export function createCanvasQueryFrameResultSummary(
  input: Partial<CanvasQueryFrameResultSummary> | null = null
): CanvasQueryFrameResultSummary {
  const totalCount =
    typeof input?.totalCount === 'number' && Number.isFinite(input.totalCount)
      ? Math.max(0, Math.floor(input.totalCount))
      : 0
  const visibleCount =
    typeof input?.visibleCount === 'number' && Number.isFinite(input.visibleCount)
      ? Math.max(0, Math.floor(input.visibleCount))
      : totalCount

  return {
    totalCount,
    visibleCount: Math.min(visibleCount, totalCount),
    stale: input?.stale ?? false,
    status: readExecutionStatus(input?.status) ?? 'idle',
    sourceVersion: normalizeString(input?.sourceVersion) ?? undefined,
    contentHash: normalizeString(input?.contentHash) ?? undefined,
    lastUpdatedAt: normalizeString(input?.lastUpdatedAt) ?? undefined,
    errorMessage: normalizeString(input?.errorMessage) ?? undefined
  }
}

export function createCanvasQueryFrameResultSummaryFromExecution(input: {
  queries: readonly CanvasQueryFrameExecutionSnapshot[]
  now?: string | null
  sourceVersion?: string | null
  contentHash?: string | null
  errorMessage?: string | null
}): CanvasQueryFrameResultSummary {
  const status = queryExecutionStatus(input.queries)
  const visibleCount = input.queries.reduce(
    (total, query) => total + normalizeCount(query.visibleCount),
    0
  )
  const totalCount = input.queries.every((query) => typeof query.totalCount === 'number')
    ? input.queries.reduce((total, query) => total + normalizeCount(query.totalCount), 0)
    : visibleCount

  return createCanvasQueryFrameResultSummary({
    totalCount,
    visibleCount,
    status,
    stale: status === 'loading' || status === 'error',
    sourceVersion:
      normalizeString(input.sourceVersion) ??
      normalizeJoinedStrings(input.queries.map((query) => query.sourceVersion)),
    contentHash:
      normalizeString(input.contentHash) ??
      normalizeJoinedStrings(input.queries.map((query) => query.contentHash)),
    lastUpdatedAt: normalizeString(input.now) ?? undefined,
    errorMessage:
      normalizeString(input.errorMessage) ??
      normalizeString(
        input.queries.find((query) => normalizeString(query.errorMessage))?.errorMessage
      ) ??
      undefined
  })
}

export function createCanvasQueryFrameResultPreview(
  input: CreateCanvasQueryFrameResultPreviewInput | null = null
): CanvasQueryFrameResultPreview {
  const cards = Array.isArray(input?.cards)
    ? input.cards
        .map((card, index) => normalizeResultCard(card, index))
        .filter((card): card is CanvasQueryFrameResultCard => card !== null)
        .slice(0, MAX_QUERY_PREVIEW_CARDS)
    : []

  return {
    cards,
    overflowCount: normalizeCount(input?.overflowCount)
  }
}

function normalizeResultCard(
  value: Partial<CanvasQueryFrameResultCard>,
  index: number
): CanvasQueryFrameResultCard | null {
  const title = normalizeString(value.title)
  if (!title) return null

  const id =
    normalizeString(value.id) ??
    normalizeString(value.sourceNodeId) ??
    `query-result-card:${slugify(title)}:${index}`
  const badges = Array.isArray(value.badges)
    ? [...new Set(value.badges.flatMap((badge) => normalizeString(badge) ?? []))].slice(0, 4)
    : []

  return {
    id,
    title,
    subtitle: normalizeString(value.subtitle) ?? undefined,
    eyebrow: normalizeString(value.eyebrow) ?? undefined,
    description: normalizeString(value.description) ?? undefined,
    sourceNodeId: normalizeString(value.sourceNodeId) ?? undefined,
    schemaId: normalizeString(value.schemaId) ?? undefined,
    href: normalizeString(value.href) ?? undefined,
    badges
  }
}

function normalizeCount(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function normalizeJoinedStrings(
  values: readonly (string | null | undefined)[]
): string | undefined {
  const normalized = [...new Set(values.flatMap((value) => normalizeString(value) ?? []))]
  return normalized.length > 0 ? normalized.join('|') : undefined
}

function queryExecutionStatus(
  queries: readonly CanvasQueryFrameExecutionSnapshot[]
): CanvasQueryFrameExecutionStatus {
  if (queries.length === 0) return 'idle'
  if (queries.some((query) => query.status === 'error' || normalizeString(query.errorMessage))) {
    return 'error'
  }
  if (queries.some((query) => query.loading || query.status === 'loading')) {
    return 'loading'
  }
  return 'success'
}

export function canvasQueryFrameResultSummarySignatureMatches(
  current: CanvasQueryFrameResultSummary,
  next: CanvasQueryFrameResultSummary
): boolean {
  return (
    current.totalCount === next.totalCount &&
    current.visibleCount === next.visibleCount &&
    current.stale === next.stale &&
    current.status === next.status &&
    current.sourceVersion === next.sourceVersion &&
    current.contentHash === next.contentHash &&
    current.errorMessage === next.errorMessage
  )
}

export function canvasQueryFrameResultPreviewMatches(
  current: CanvasQueryFrameResultPreview,
  next: CanvasQueryFrameResultPreview
): boolean {
  return JSON.stringify(current) === JSON.stringify(next)
}

export function shouldRefreshCanvasQueryFrameResult({
  refreshMode,
  trigger,
  currentSummary,
  nextSummary,
  currentPreview,
  nextPreview
}: ShouldRefreshCanvasQueryFrameResultInput): boolean {
  if (trigger === 'manual') {
    return true
  }

  if (trigger === 'open') {
    return refreshMode === 'on-open' || refreshMode === 'live'
  }

  if (refreshMode !== 'live') {
    return false
  }

  return (
    !canvasQueryFrameResultSummarySignatureMatches(currentSummary, nextSummary) ||
    !canvasQueryFrameResultPreviewMatches(currentPreview, nextPreview)
  )
}

function nodeQueryForSavedView(
  descriptor: SavedViewDescriptor,
  queryId: string | null | undefined
): QueryASTNodeQuery | null {
  if (descriptor.query.kind === 'node') return descriptor.query

  if (queryId && descriptor.query.queries[queryId]) {
    return descriptor.query.queries[queryId]
  }

  return Object.values(descriptor.query.queries)[0] ?? null
}

function queryAstPredicateToFrameFilters(
  predicate: QueryASTPredicate | undefined
): CanvasQueryFrameFilter[] {
  if (!predicate) return []

  if (predicate.kind === 'and') {
    return predicate.predicates.flatMap(queryAstPredicateToFrameFilters)
  }

  if (predicate.kind !== 'comparison') {
    return []
  }

  if (predicate.op === 'between') {
    const [from, to] = predicate.values ?? []
    return [
      {
        field: predicate.field,
        operator: 'greater-than-or-equal',
        value: from
      },
      {
        field: predicate.field,
        operator: 'less-than-or-equal',
        value: to
      }
    ]
  }

  const operator = queryAstOperatorToFrameOperator(predicate.op)
  if (!operator) return []

  return [
    {
      field: predicate.field,
      operator,
      ...(predicate.op === 'in' ? { value: predicate.values ?? [] } : { value: predicate.value })
    }
  ]
}

function queryAstOperatorToFrameOperator(
  operator: QueryASTOperator
): CanvasQueryFrameFilterOperator | null {
  return QUERY_AST_TO_FRAME_OPERATOR[operator]
}

export function createCanvasQueryFrameProperties({
  query,
  title,
  properties,
  resultSummary,
  resultPreview
}: CreateCanvasQueryFramePropertiesInput): CanvasQueryFrameProperties {
  const queryDefinition = createCanvasQueryFrameDefinition(query)
  const queryResultSummary = createCanvasQueryFrameResultSummary(resultSummary)
  const queryResultPreview = createCanvasQueryFrameResultPreview(resultPreview)
  const frameTitle = normalizeString(title) ?? queryDefinition.label

  return {
    ...createCanvasFrameVariantProperties('query', {
      ...(properties ?? {}),
      title: frameTitle,
      queryMode: 'saved-query',
      queryText: queryDefinition.queryText ?? '',
      queryDefinition,
      queryResultSummary,
      queryResultPreview
    }),
    frameVariant: 'query',
    frameIntent: 'query',
    queryMode: 'saved-query',
    queryText: queryDefinition.queryText ?? '',
    queryDefinition,
    queryResultSummary,
    queryResultPreview
  }
}

export function createCanvasQueryFrameNode(input: CreateCanvasQueryFrameNodeInput): CanvasNode {
  const properties = createCanvasQueryFrameProperties(input)

  return createCanvasFrameVariantNode({
    variant: 'query',
    viewport: input.viewport,
    title: properties.title as string,
    canvasPoint: input.canvasPoint,
    spreadIndex: input.spreadIndex,
    properties
  })
}

export function isCanvasQueryFrameDefinition(value: unknown): value is CanvasQueryFrameDefinition {
  const record = readRecord(value)
  if (!record) {
    return false
  }

  return (
    typeof record.id === 'string' &&
    readQueryFrameSource(record.source) !== null &&
    typeof record.label === 'string' &&
    Array.isArray(record.filters) &&
    Array.isArray(record.sorts) &&
    typeof record.limit === 'number' &&
    readRefreshMode(record.refreshMode) !== null &&
    readMaterialization(record.materialization) !== null
  )
}

export function getCanvasQueryFrameDefinition(node: CanvasNode): CanvasQueryFrameDefinition | null {
  if (isCanvasQueryFrameDefinition(node.properties.queryDefinition)) {
    return node.properties.queryDefinition
  }

  if (node.properties.frameVariant !== 'query') {
    return null
  }

  const queryText = normalizeString(node.properties.queryText as string | null | undefined)
  const title =
    normalizeString(node.alias) ??
    normalizeString(node.properties.title as string | null | undefined) ??
    'Saved query'

  return createCanvasQueryFrameDefinition({
    source: 'custom',
    label: title,
    queryText
  })
}

export function getCanvasQueryFrameResultSummary(node: CanvasNode): CanvasQueryFrameResultSummary {
  const record = readRecord(node.properties.queryResultSummary)

  return createCanvasQueryFrameResultSummary({
    totalCount: typeof record?.totalCount === 'number' ? record.totalCount : undefined,
    visibleCount: typeof record?.visibleCount === 'number' ? record.visibleCount : undefined,
    stale: typeof record?.stale === 'boolean' ? record.stale : undefined,
    sourceVersion: typeof record?.sourceVersion === 'string' ? record.sourceVersion : undefined,
    contentHash: typeof record?.contentHash === 'string' ? record.contentHash : undefined,
    lastUpdatedAt: typeof record?.lastUpdatedAt === 'string' ? record.lastUpdatedAt : undefined,
    status: readExecutionStatus(record?.status) ?? undefined,
    errorMessage: typeof record?.errorMessage === 'string' ? record.errorMessage : undefined
  })
}

export function getCanvasQueryFrameResultPreview(node: CanvasNode): CanvasQueryFrameResultPreview {
  const record = readRecord(node.properties.queryResultPreview)

  return createCanvasQueryFrameResultPreview({
    cards: Array.isArray(record?.cards)
      ? record.cards.flatMap((card) => {
          const cardRecord = readRecord(card)
          return cardRecord ? [cardRecord as Partial<CanvasQueryFrameResultCard>] : []
        })
      : [],
    overflowCount: typeof record?.overflowCount === 'number' ? record.overflowCount : undefined
  })
}

export function isCanvasQueryFrameNode(node: CanvasNode): boolean {
  return (
    getCanvasContainerRole(node) === 'frame' &&
    node.properties.frameVariant === 'query' &&
    getCanvasQueryFrameDefinition(node) !== null
  )
}

export function updateCanvasQueryFrameResultSummary(
  node: CanvasNode,
  summary: Partial<CanvasQueryFrameResultSummary>
): CanvasNode {
  if (!isCanvasQueryFrameNode(node)) {
    return node
  }

  return {
    ...node,
    properties: {
      ...node.properties,
      queryResultSummary: createCanvasQueryFrameResultSummary(summary)
    }
  }
}

export function updateCanvasQueryFrameResultPreview(
  node: CanvasNode,
  preview: CreateCanvasQueryFrameResultPreviewInput
): CanvasNode {
  if (!isCanvasQueryFrameNode(node)) {
    return node
  }

  return {
    ...node,
    properties: {
      ...node.properties,
      queryResultPreview: createCanvasQueryFrameResultPreview(preview)
    }
  }
}

export function updateCanvasQueryFrameResults(
  node: CanvasNode,
  input: {
    summary: Partial<CanvasQueryFrameResultSummary>
    preview?: CreateCanvasQueryFrameResultPreviewInput | null
  }
): CanvasNode {
  if (!isCanvasQueryFrameNode(node)) {
    return node
  }

  return {
    ...node,
    properties: {
      ...node.properties,
      queryResultSummary: createCanvasQueryFrameResultSummary(input.summary),
      queryResultPreview: createCanvasQueryFrameResultPreview(input.preview)
    }
  }
}
