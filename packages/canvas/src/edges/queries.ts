/**
 * Semantic edge query helpers for canvas relationship grids.
 */

import type {
  CanvasEdge,
  CanvasEdgeRelationshipDirection,
  CanvasEdgeRelationshipKind,
  CanvasObjectAnchorPlacement
} from '../types'
import { getCanvasEdgeSourceObjectId, getCanvasEdgeTargetObjectId } from './bindings'
import {
  type CanvasSemanticRelationshipRecord,
  createCanvasSemanticRelationshipRecord,
  normalizeCanvasEdgeRelationship
} from './relationships'

export type CanvasSemanticEdgeQuerySortField =
  | 'id'
  | 'label'
  | 'relationship-kind'
  | 'source-object-id'
  | 'target-object-id'
  | 'schema-id'

export type CanvasSemanticEdgeQuerySort = {
  field: CanvasSemanticEdgeQuerySortField
  direction?: 'asc' | 'desc'
}

export type CanvasSemanticEdgeEndpointFilter = {
  objectIds?: readonly string[]
  anchorIds?: readonly string[]
  pageNumbers?: readonly number[]
  pageIds?: readonly string[]
  blockAnchorIds?: readonly string[]
  placements?: readonly CanvasObjectAnchorPlacement[]
}

export type CanvasSemanticEdgeQueryFilter = {
  relationshipKinds?: readonly CanvasEdgeRelationshipKind[]
  directions?: readonly CanvasEdgeRelationshipDirection[]
  source?: CanvasSemanticEdgeEndpointFilter
  target?: CanvasSemanticEdgeEndpointFilter
  connectedObjectIds?: readonly string[]
  schemaIds?: readonly string[]
  sourceRoles?: readonly string[]
  targetRoles?: readonly string[]
  labels?: readonly string[]
  query?: string
  relationshipPropertyEquals?: Record<string, string | number | boolean | null>
  includeUndirectedEndpointSwaps?: boolean
}

export type CanvasSemanticEdgeQuery = {
  id: string
  name: string
  description?: string
  filter: CanvasSemanticEdgeQueryFilter
  sort?: CanvasSemanticEdgeQuerySort
  limit?: number
}

export type CreateCanvasSemanticEdgeQueryInput = {
  id?: string
  name?: string
  description?: string
  filter?: CanvasSemanticEdgeQueryFilter
  sort?: CanvasSemanticEdgeQuerySort
  limit?: number
}

export type CanvasSemanticEdgeQueryRow = CanvasSemanticRelationshipRecord & {
  edgeId: string
  sourceAnchorId?: string
  targetAnchorId?: string
  sourcePageNumber?: number
  targetPageNumber?: number
  sourcePageId?: string
  targetPageId?: string
  sourceBlockAnchorId?: string
  targetBlockAnchorId?: string
  sourcePlacement?: CanvasObjectAnchorPlacement
  targetPlacement?: CanvasObjectAnchorPlacement
}

export type CanvasSemanticEdgeQueryResult = {
  query: CanvasSemanticEdgeQuery
  rows: readonly CanvasSemanticEdgeQueryRow[]
  totalEdgeCount: number
  matchedEdgeCount: number
  returnedEdgeCount: number
  relationshipKindCounts: Readonly<Partial<Record<CanvasEdgeRelationshipKind, number>>>
  schemaIdCounts: Readonly<Record<string, number>>
}

type NormalizedEndpoint = {
  objectId: string | null
  anchorId?: string
  pageNumber?: number
  pageId?: string
  blockAnchorId?: string
  placement?: CanvasObjectAnchorPlacement
}

type EdgeEndpointPair = {
  source: NormalizedEndpoint
  target: NormalizedEndpoint
}

const DEFAULT_QUERY_NAME = 'Semantic edges'

function normalizeQueryId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `canvas-semantic-edge-query:${slug || 'untitled'}`
}

function normalizeString(value: string): string {
  return value.trim()
}

function normalizeStringList(values: readonly string[] | undefined): string[] | undefined {
  if (!values || values.length === 0) {
    return undefined
  }

  const normalized = Array.from(
    new Set(values.map(normalizeString).filter((value) => value.length > 0))
  ).sort((left, right) => left.localeCompare(right))

  return normalized.length > 0 ? normalized : undefined
}

function normalizeNumberList(values: readonly number[] | undefined): number[] | undefined {
  if (!values || values.length === 0) {
    return undefined
  }

  const normalized = Array.from(
    new Set(values.filter((value) => Number.isInteger(value) && value > 0))
  ).sort((left, right) => left - right)

  return normalized.length > 0 ? normalized : undefined
}

function normalizeRelationshipKindList(
  values: readonly CanvasEdgeRelationshipKind[] | undefined
): CanvasEdgeRelationshipKind[] | undefined {
  return normalizeStringList(values) as CanvasEdgeRelationshipKind[] | undefined
}

function normalizeRelationshipDirectionList(
  values: readonly CanvasEdgeRelationshipDirection[] | undefined
): CanvasEdgeRelationshipDirection[] | undefined {
  const normalized = values?.filter(
    (value): value is CanvasEdgeRelationshipDirection =>
      value === 'directed' || value === 'undirected'
  )

  return normalizeStringList(normalized) as CanvasEdgeRelationshipDirection[] | undefined
}

function normalizePlacementList(
  values: readonly CanvasObjectAnchorPlacement[] | undefined
): CanvasObjectAnchorPlacement[] | undefined {
  return normalizeStringList(values) as CanvasObjectAnchorPlacement[] | undefined
}

function normalizeEndpointFilter(
  filter: CanvasSemanticEdgeEndpointFilter | undefined
): CanvasSemanticEdgeEndpointFilter | undefined {
  if (!filter) {
    return undefined
  }

  const objectIds = normalizeStringList(filter.objectIds)
  const anchorIds = normalizeStringList(filter.anchorIds)
  const pageNumbers = normalizeNumberList(filter.pageNumbers)
  const pageIds = normalizeStringList(filter.pageIds)
  const blockAnchorIds = normalizeStringList(filter.blockAnchorIds)
  const placements = normalizePlacementList(filter.placements)

  if (!objectIds && !anchorIds && !pageNumbers && !pageIds && !blockAnchorIds && !placements) {
    return undefined
  }

  return {
    ...(objectIds ? { objectIds } : {}),
    ...(anchorIds ? { anchorIds } : {}),
    ...(pageNumbers ? { pageNumbers } : {}),
    ...(pageIds ? { pageIds } : {}),
    ...(blockAnchorIds ? { blockAnchorIds } : {}),
    ...(placements ? { placements } : {})
  }
}

function normalizePropertyEquals(
  propertyEquals: Record<string, string | number | boolean | null> | undefined
): Record<string, string | number | boolean | null> | undefined {
  if (!propertyEquals) {
    return undefined
  }

  const entries = Object.entries(propertyEquals)
    .map(([key, value]) => [key.trim(), value] as const)
    .filter(([key]) => key.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeFilter(
  filter: CanvasSemanticEdgeQueryFilter | undefined
): CanvasSemanticEdgeQueryFilter {
  if (!filter) {
    return {}
  }

  const relationshipKinds = normalizeRelationshipKindList(filter.relationshipKinds)
  const directions = normalizeRelationshipDirectionList(filter.directions)
  const source = normalizeEndpointFilter(filter.source)
  const target = normalizeEndpointFilter(filter.target)
  const connectedObjectIds = normalizeStringList(filter.connectedObjectIds)
  const schemaIds = normalizeStringList(filter.schemaIds)
  const sourceRoles = normalizeStringList(filter.sourceRoles)
  const targetRoles = normalizeStringList(filter.targetRoles)
  const labels = normalizeStringList(filter.labels)
  const query = filter.query?.trim()
  const relationshipPropertyEquals = normalizePropertyEquals(filter.relationshipPropertyEquals)

  return {
    ...(relationshipKinds ? { relationshipKinds } : {}),
    ...(directions ? { directions } : {}),
    ...(source ? { source } : {}),
    ...(target ? { target } : {}),
    ...(connectedObjectIds ? { connectedObjectIds } : {}),
    ...(schemaIds ? { schemaIds } : {}),
    ...(sourceRoles ? { sourceRoles } : {}),
    ...(targetRoles ? { targetRoles } : {}),
    ...(labels ? { labels } : {}),
    ...(query ? { query } : {}),
    ...(relationshipPropertyEquals ? { relationshipPropertyEquals } : {}),
    ...(filter.includeUndirectedEndpointSwaps ? { includeUndirectedEndpointSwaps: true } : {})
  }
}

function normalizeSort(
  sort: CanvasSemanticEdgeQuerySort | undefined
): CanvasSemanticEdgeQuerySort | undefined {
  if (!sort) {
    return undefined
  }

  return {
    field: sort.field,
    ...(sort.direction === 'desc' ? { direction: 'desc' as const } : {})
  }
}

function normalizeLimit(limit: number | undefined): number | undefined {
  return typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : undefined
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
}

function matchesOptionalStringSet(
  value: string | undefined | null,
  allowed: readonly string[] | undefined
): boolean {
  return (
    !allowed ||
    allowed.length === 0 ||
    (value !== undefined && value !== null && allowed.includes(value))
  )
}

function matchesOptionalNumberSet(
  value: number | undefined,
  allowed: readonly number[] | undefined
): boolean {
  return !allowed || allowed.length === 0 || (value !== undefined && allowed.includes(value))
}

function matchesEndpointFilter(
  endpoint: NormalizedEndpoint,
  filter: CanvasSemanticEdgeEndpointFilter | undefined
): boolean {
  if (!filter) {
    return true
  }

  return (
    matchesOptionalStringSet(endpoint.objectId, filter.objectIds) &&
    matchesOptionalStringSet(endpoint.anchorId, filter.anchorIds) &&
    matchesOptionalNumberSet(endpoint.pageNumber, filter.pageNumbers) &&
    matchesOptionalStringSet(endpoint.pageId, filter.pageIds) &&
    matchesOptionalStringSet(endpoint.blockAnchorId, filter.blockAnchorIds) &&
    matchesOptionalStringSet(endpoint.placement, filter.placements)
  )
}

function createEndpointPair(edge: CanvasEdge): EdgeEndpointPair {
  return {
    source: {
      objectId: getCanvasEdgeSourceObjectId(edge),
      ...(edge.source?.anchorId ? { anchorId: edge.source.anchorId } : {}),
      ...(edge.source?.pageNumber ? { pageNumber: edge.source.pageNumber } : {}),
      ...(edge.source?.pageId ? { pageId: edge.source.pageId } : {}),
      ...(edge.source?.blockAnchorId ? { blockAnchorId: edge.source.blockAnchorId } : {}),
      ...(edge.source?.placement ? { placement: edge.source.placement } : {})
    },
    target: {
      objectId: getCanvasEdgeTargetObjectId(edge),
      ...(edge.target?.anchorId ? { anchorId: edge.target.anchorId } : {}),
      ...(edge.target?.pageNumber ? { pageNumber: edge.target.pageNumber } : {}),
      ...(edge.target?.pageId ? { pageId: edge.target.pageId } : {}),
      ...(edge.target?.blockAnchorId ? { blockAnchorId: edge.target.blockAnchorId } : {}),
      ...(edge.target?.placement ? { placement: edge.target.placement } : {})
    }
  }
}

function matchesEndpointPair(
  pair: EdgeEndpointPair,
  filter: CanvasSemanticEdgeQueryFilter,
  relationshipDirection: CanvasEdgeRelationshipDirection | undefined
): boolean {
  const forward =
    matchesEndpointFilter(pair.source, filter.source) &&
    matchesEndpointFilter(pair.target, filter.target)

  if (forward) {
    return true
  }

  return (
    filter.includeUndirectedEndpointSwaps === true &&
    relationshipDirection === 'undirected' &&
    matchesEndpointFilter(pair.target, filter.source) &&
    matchesEndpointFilter(pair.source, filter.target)
  )
}

function matchesConnectedObjectIds(
  pair: EdgeEndpointPair,
  connectedObjectIds: readonly string[] | undefined
): boolean {
  if (!connectedObjectIds || connectedObjectIds.length === 0) {
    return true
  }

  return (
    (pair.source.objectId !== null && connectedObjectIds.includes(pair.source.objectId)) ||
    (pair.target.objectId !== null && connectedObjectIds.includes(pair.target.objectId))
  )
}

function getRelationshipSearchText(edge: CanvasEdge): string {
  const relationship = normalizeCanvasEdgeRelationship(edge.relationship)
  const propertyText = Object.values(relationship.properties ?? {})
    .filter(isScalar)
    .map((value) => String(value))
    .join(' ')

  return [
    edge.id,
    edge.label,
    getCanvasEdgeSourceObjectId(edge),
    getCanvasEdgeTargetObjectId(edge),
    relationship.kind,
    relationship.direction,
    relationship.label,
    relationship.sourceRole,
    relationship.targetRole,
    relationship.schemaId,
    propertyText
  ]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
}

function matchesRelationshipPropertyEquals(
  edge: CanvasEdge,
  propertyEquals: Record<string, string | number | boolean | null> | undefined
): boolean {
  if (!propertyEquals) {
    return true
  }

  const properties = normalizeCanvasEdgeRelationship(edge.relationship).properties ?? {}

  return Object.entries(propertyEquals).every(([key, expected]) => properties[key] === expected)
}

function toQueryInput(
  queryOrFilter: CanvasSemanticEdgeQuery | CanvasSemanticEdgeQueryFilter
): CanvasSemanticEdgeQuery {
  if ('filter' in queryOrFilter) {
    return queryOrFilter
  }

  return createCanvasSemanticEdgeQuery({ filter: queryOrFilter })
}

function createRow(edge: CanvasEdge): CanvasSemanticEdgeQueryRow | null {
  const record = createCanvasSemanticRelationshipRecord(edge)
  if (!record) {
    return null
  }

  return {
    ...record,
    edgeId: edge.id,
    ...(edge.source?.anchorId ? { sourceAnchorId: edge.source.anchorId } : {}),
    ...(edge.target?.anchorId ? { targetAnchorId: edge.target.anchorId } : {}),
    ...(edge.source?.pageNumber ? { sourcePageNumber: edge.source.pageNumber } : {}),
    ...(edge.target?.pageNumber ? { targetPageNumber: edge.target.pageNumber } : {}),
    ...(edge.source?.pageId ? { sourcePageId: edge.source.pageId } : {}),
    ...(edge.target?.pageId ? { targetPageId: edge.target.pageId } : {}),
    ...(edge.source?.blockAnchorId ? { sourceBlockAnchorId: edge.source.blockAnchorId } : {}),
    ...(edge.target?.blockAnchorId ? { targetBlockAnchorId: edge.target.blockAnchorId } : {}),
    ...(edge.source?.placement ? { sourcePlacement: edge.source.placement } : {}),
    ...(edge.target?.placement ? { targetPlacement: edge.target.placement } : {})
  }
}

function getSortValue(
  row: CanvasSemanticEdgeQueryRow,
  field: CanvasSemanticEdgeQuerySortField
): string {
  switch (field) {
    case 'label':
      return row.label ?? ''
    case 'relationship-kind':
      return row.kind
    case 'source-object-id':
      return row.sourceObjectId
    case 'target-object-id':
      return row.targetObjectId
    case 'schema-id':
      return row.schemaId ?? ''
    case 'id':
    default:
      return row.id
  }
}

function sortRows(
  rows: readonly CanvasSemanticEdgeQueryRow[],
  sort: CanvasSemanticEdgeQuerySort | undefined
): CanvasSemanticEdgeQueryRow[] {
  if (!sort) {
    return [...rows]
  }

  const directionMultiplier = sort.direction === 'desc' ? -1 : 1

  return [...rows].sort((left, right) => {
    const comparison =
      getSortValue(left, sort.field).localeCompare(getSortValue(right, sort.field)) ||
      left.id.localeCompare(right.id)

    return comparison * directionMultiplier
  })
}

function incrementCount<T extends string>(counts: Partial<Record<T, number>>, key: T): void {
  counts[key] = (counts[key] ?? 0) + 1
}

function createSchemaCounts(rows: readonly CanvasSemanticEdgeQueryRow[]): Record<string, number> {
  const counts: Record<string, number> = {}

  for (const row of rows) {
    if (row.schemaId) {
      counts[row.schemaId] = (counts[row.schemaId] ?? 0) + 1
    }
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  )
}

function createRelationshipKindCounts(
  rows: readonly CanvasSemanticEdgeQueryRow[]
): Partial<Record<CanvasEdgeRelationshipKind, number>> {
  const counts: Partial<Record<CanvasEdgeRelationshipKind, number>> = {}

  for (const row of rows) {
    incrementCount(counts, row.kind)
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))
  ) as Partial<Record<CanvasEdgeRelationshipKind, number>>
}

export function createCanvasSemanticEdgeQuery(
  input: CreateCanvasSemanticEdgeQueryInput = {}
): CanvasSemanticEdgeQuery {
  const name = input.name?.trim() || DEFAULT_QUERY_NAME
  const filter = normalizeFilter(input.filter)
  const sort = normalizeSort(input.sort)
  const limit = normalizeLimit(input.limit)

  return {
    id: input.id?.trim() || normalizeQueryId(name),
    name,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    filter,
    ...(sort ? { sort } : {}),
    ...(limit ? { limit } : {})
  }
}

export function createCanvasSemanticEdgeQueryRows(
  edges: readonly CanvasEdge[]
): CanvasSemanticEdgeQueryRow[] {
  return edges.flatMap((edge) => {
    const row = createRow(edge)
    return row ? [row] : []
  })
}

export function canvasEdgeMatchesSemanticQuery(
  edge: CanvasEdge,
  queryOrFilter: CanvasSemanticEdgeQuery | CanvasSemanticEdgeQueryFilter
): boolean {
  const query = toQueryInput(queryOrFilter)
  const filter = query.filter
  const relationship = normalizeCanvasEdgeRelationship(edge.relationship)
  const pair = createEndpointPair(edge)
  const textQuery = filter.query?.toLowerCase()

  return (
    matchesOptionalStringSet(relationship.kind, filter.relationshipKinds) &&
    matchesOptionalStringSet(relationship.direction, filter.directions) &&
    matchesOptionalStringSet(relationship.schemaId, filter.schemaIds) &&
    matchesOptionalStringSet(relationship.sourceRole, filter.sourceRoles) &&
    matchesOptionalStringSet(relationship.targetRole, filter.targetRoles) &&
    matchesOptionalStringSet(relationship.label ?? edge.label, filter.labels) &&
    matchesEndpointPair(pair, filter, relationship.direction) &&
    matchesConnectedObjectIds(pair, filter.connectedObjectIds) &&
    (!textQuery || getRelationshipSearchText(edge).includes(textQuery)) &&
    matchesRelationshipPropertyEquals(edge, filter.relationshipPropertyEquals)
  )
}

export function filterCanvasEdgesBySemanticQuery(
  edges: readonly CanvasEdge[],
  queryOrFilter: CanvasSemanticEdgeQuery | CanvasSemanticEdgeQueryFilter
): CanvasEdge[] {
  return edges.filter((edge) => canvasEdgeMatchesSemanticQuery(edge, queryOrFilter))
}

export function runCanvasSemanticEdgeQuery(
  edges: readonly CanvasEdge[],
  queryOrFilter: CanvasSemanticEdgeQuery | CanvasSemanticEdgeQueryFilter
): CanvasSemanticEdgeQueryResult {
  const query = toQueryInput(queryOrFilter)
  const totalRows = createCanvasSemanticEdgeQueryRows(edges)
  const matchedRows = createCanvasSemanticEdgeQueryRows(
    filterCanvasEdgesBySemanticQuery(edges, query)
  )
  const sortedRows = sortRows(matchedRows, query.sort)
  const rows = query.limit ? sortedRows.slice(0, query.limit) : sortedRows

  return {
    query,
    rows,
    totalEdgeCount: totalRows.length,
    matchedEdgeCount: matchedRows.length,
    returnedEdgeCount: rows.length,
    relationshipKindCounts: createRelationshipKindCounts(matchedRows),
    schemaIdCounts: createSchemaCounts(matchedRows)
  }
}
