/**
 * Shared NodeStore query descriptor semantics.
 */

import type { NodeState } from './types'
import type { SchemaIRI } from '../schema/node'
import type { InferCreateProps, PropertyBuilder } from '../schema/types'

export type SortDirection = 'asc' | 'desc'

export type SystemOrderField = 'createdAt' | 'updatedAt'

export type NodeQuerySpatialPoint = {
  x: number
  y: number
}

export type NodeQuerySpatialRect = NodeQuerySpatialPoint & {
  width: number
  height: number
}

export type NodeQuerySpatialPointFields = {
  x: string
  y: string
}

export type NodeQuerySpatialRectFields = NodeQuerySpatialPointFields & {
  width?: string
  height?: string
}

export type NodeQuerySpatialWindow = {
  kind: 'window'
  rect: NodeQuerySpatialRect
  fields: NodeQuerySpatialRectFields
  overscan?: number
}

export type NodeQuerySpatialRadius = {
  kind: 'radius'
  center: NodeQuerySpatialPoint
  radius: number
  fields: NodeQuerySpatialPointFields
}

export type NodeQuerySpatialFilter = NodeQuerySpatialWindow | NodeQuerySpatialRadius

export type NodeQuerySearchField = 'title' | 'content'

export type NodeQuerySearchFilter = {
  text: string
  fields?: NodeQuerySearchField[]
}

export type NodeQueryMaterializedViewOptions = {
  viewId: string
  maxAgeMs?: number
  forceRefresh?: boolean
}

export type NodeQueryPageCountMode = 'exact' | 'estimate' | 'none'

export type NodeQueryPageOptions = {
  first: number
  after?: string
  count?: NodeQueryPageCountMode
}

export type NodeQueryCursorOrderEntry = {
  field: string
  direction: SortDirection
  value: unknown
}

export type NodeQueryCursor = {
  version: 1
  schemaId: SchemaIRI
  order: NodeQueryCursorOrderEntry[]
  nodeId: string
}

export interface NodeQueryOptions<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> {
  nodeId?: string
  where?: Partial<InferCreateProps<P>>
  includeDeleted?: boolean
  orderBy?: { [K in keyof InferCreateProps<P> | SystemOrderField]?: SortDirection }
  limit?: number
  offset?: number
  page?: NodeQueryPageOptions
  spatial?: NodeQuerySpatialFilter
  search?: string | NodeQuerySearchFilter
  materializedView?: string | NodeQueryMaterializedViewOptions
}

export interface NodeQueryDescriptor {
  schemaId: SchemaIRI
  nodeId?: string
  where?: Record<string, unknown>
  includeDeleted: boolean
  orderBy?: Record<string, SortDirection>
  limit?: number
  offset?: number
  after?: string
  count?: NodeQueryPageCountMode
  spatial?: NodeQuerySpatialFilter
  search?: NodeQuerySearchFilter
  materializedView?: NodeQueryMaterializedViewOptions
  /**
   * Authorization fingerprint stamped by `NodeStore` when a materialized view
   * is read under an active read-authorization evaluator (exploration 0226).
   * It is NOT part of the descriptor hash (it is stripped by
   * `withoutNodeQueryMaterializedView`) — a change is reported as a distinct
   * `'authz-changed'` refresh reason rather than `'descriptor-changed'`. Set
   * internally by the store, never by callers.
   */
  authFingerprint?: string
}

export interface NodeQueryPlanMetadata {
  strategy: 'storage-query' | 'list-fallback' | 'auth-pushdown-candidates' | 'draft-overlay'
  candidateNodeCount: number
  hydratedNodeCount: number
  returnedNodeCount: number
  durationMs: number
  sql?: string
  params?: unknown[]
  postFilterReason?: string
  descriptorHash?: string
  adaptiveIndexNames?: string[]
  candidateQueryDurationMs?: number
  usedIndexNames?: string[]
  fullTableScan?: boolean
  queryPlanDetails?: string[]
  availableIndexCount?: number
  adaptiveIndexCount?: number
  diagnosticsError?: string
  storageCapabilities?: NodeQueryStorageCapabilitiesMetadata
  candidateAccelerators?: string[]
  spatialIndexKey?: string
  fullTextSearchQuery?: string
  materializedViewId?: string
  materializedCacheHit?: boolean
  materializedRefreshReason?:
    | 'missing'
    | 'descriptor-changed'
    | 'authz-changed'
    | 'invalidated'
    | 'expired'
    | 'force-refresh'
  materializedGeneratedAt?: number
  materializedInvalidatedAt?: number
  materializedRowCount?: number
  parityCheck?: NodeQueryParityCheckMetadata
}

export interface NodeQueryStorageCapabilitiesMetadata {
  fullTextSearch: boolean
  rtree: boolean
}

export interface NodeQueryParityCheckMetadata {
  strategy: 'exact' | 'skipped'
  valid?: boolean
  reason?: string
  comparedNodeCount?: number
  expectedNodeCount?: number
  missingNodeIds?: string[]
  extraNodeIds?: string[]
  orderMismatch?: boolean
}

export interface NodeQueryResult {
  nodes: NodeState[]
  plan: NodeQueryPlanMetadata
  totalCount?: number
}

function sortRecord<T>(record?: Record<string, T>): Record<string, T> | undefined {
  if (!record) return undefined

  const entries = Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) return undefined

  return Object.fromEntries(entries)
}

function normalizeSpatialPoint(point: NodeQuerySpatialPoint): NodeQuerySpatialPoint {
  return {
    x: point.x,
    y: point.y
  }
}

function normalizeSpatialRect(rect: NodeQuerySpatialRect): NodeQuerySpatialRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  }
}

function normalizeSpatialFilter(
  spatial?: NodeQuerySpatialFilter
): NodeQuerySpatialFilter | undefined {
  if (!spatial) {
    return undefined
  }

  if (spatial.kind === 'window') {
    const overscan = spatial.overscan ?? 0

    return {
      kind: 'window',
      rect: normalizeSpatialRect(spatial.rect),
      fields: {
        x: spatial.fields.x,
        y: spatial.fields.y,
        width: spatial.fields.width,
        height: spatial.fields.height
      },
      ...(overscan !== 0 ? { overscan } : {})
    }
  }

  return {
    kind: 'radius',
    center: normalizeSpatialPoint(spatial.center),
    radius: spatial.radius,
    fields: {
      x: spatial.fields.x,
      y: spatial.fields.y
    }
  }
}

function normalizeSearchFilter(
  search?: string | NodeQuerySearchFilter
): NodeQuerySearchFilter | undefined {
  if (typeof search === 'string') {
    const text = search.trim()
    return text.length > 0 ? { text } : undefined
  }

  if (!search) {
    return undefined
  }

  const text = search.text.trim()
  if (text.length === 0) {
    return undefined
  }

  const fields = search.fields
    ? [...new Set(search.fields)].filter((field) => field === 'title' || field === 'content').sort()
    : undefined

  return {
    text,
    ...(fields && fields.length > 0 ? { fields } : {})
  }
}

function normalizeMaterializedViewOptions(
  materializedView?: string | NodeQueryMaterializedViewOptions
): NodeQueryMaterializedViewOptions | undefined {
  if (typeof materializedView === 'string') {
    const viewId = materializedView.trim()
    return viewId.length > 0 ? { viewId } : undefined
  }

  if (!materializedView) {
    return undefined
  }

  const viewId = materializedView.viewId.trim()
  if (viewId.length === 0) {
    return undefined
  }

  const maxAgeMs =
    materializedView.maxAgeMs !== undefined &&
    Number.isFinite(materializedView.maxAgeMs) &&
    materializedView.maxAgeMs >= 0
      ? materializedView.maxAgeMs
      : undefined

  return {
    viewId,
    ...(maxAgeMs !== undefined ? { maxAgeMs } : {}),
    ...(materializedView.forceRefresh ? { forceRefresh: true } : {})
  }
}

const NODE_QUERY_CURSOR_PREFIX = 'xnet-query-cursor:'

type NodeQueryOrderEntry = {
  field: string
  direction: SortDirection
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function decodeBase64Url(value: string): string {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}

function isSortDirection(value: unknown): value is SortDirection {
  return value === 'asc' || value === 'desc'
}

function isNodeQueryCursor(value: unknown): value is NodeQueryCursor {
  if (!value || typeof value !== 'object') return false

  const cursor = value as Partial<NodeQueryCursor>
  return (
    cursor.version === 1 &&
    typeof cursor.schemaId === 'string' &&
    typeof cursor.nodeId === 'string' &&
    Array.isArray(cursor.order) &&
    cursor.order.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        typeof entry.field === 'string' &&
        isSortDirection(entry.direction)
    )
  )
}

function getExplicitOrderEntries(descriptor: NodeQueryDescriptor): NodeQueryOrderEntry[] {
  return Object.entries(descriptor.orderBy ?? {})
    .filter((entry): entry is [string, SortDirection] => isSortDirection(entry[1]))
    .map(([field, direction]) => ({ field, direction }))
}

function getCursorOrderEntries(descriptor: NodeQueryDescriptor): NodeQueryOrderEntry[] {
  const entries = getExplicitOrderEntries(descriptor)
  return entries.length > 0 ? entries : [{ field: 'updatedAt', direction: 'desc' }]
}

function getSortOrderEntries(descriptor: NodeQueryDescriptor): NodeQueryOrderEntry[] {
  const entries = getExplicitOrderEntries(descriptor)
  if (entries.length === 0) {
    return descriptor.after
      ? [...getCursorOrderEntries(descriptor), { field: 'nodeId', direction: 'asc' }]
      : []
  }

  return [...entries, { field: 'nodeId', direction: 'asc' }]
}

function getOrderValue(node: NodeState, field: string): unknown {
  if (field === 'nodeId') return node.id
  if (field === 'createdAt' || field === 'updatedAt') return node[field]

  return node.properties[field]
}

function compareOrderValues(
  leftValue: unknown,
  rightValue: unknown,
  direction: SortDirection
): number {
  if (leftValue === rightValue) return 0
  if (leftValue == null) return direction === 'asc' ? 1 : -1
  if (rightValue == null) return direction === 'asc' ? -1 : 1

  const comparison = leftValue < rightValue ? -1 : 1
  return direction === 'asc' ? comparison : -comparison
}

function compareNodeToCursor(node: NodeState, cursor: NodeQueryCursor): number {
  for (const entry of cursor.order) {
    const comparison = compareOrderValues(
      getOrderValue(node, entry.field),
      entry.value,
      entry.direction
    )
    if (comparison !== 0) return comparison
  }

  return compareOrderValues(node.id, cursor.nodeId, 'asc')
}

function filterAfterCursor(nodes: NodeState[], descriptor: NodeQueryDescriptor): NodeState[] {
  if (!descriptor.after) return nodes

  const cursor = decodeNodeQueryCursor(descriptor.after)
  if (!cursor || cursor.schemaId !== descriptor.schemaId) return nodes

  return nodes.filter((node) => compareNodeToCursor(node, cursor) > 0)
}

export function encodeNodeQueryCursor(descriptor: NodeQueryDescriptor, node: NodeState): string {
  const cursor: NodeQueryCursor = {
    version: 1,
    schemaId: descriptor.schemaId,
    order: getCursorOrderEntries(descriptor).map((entry) => ({
      field: entry.field,
      direction: entry.direction,
      value: getOrderValue(node, entry.field)
    })),
    nodeId: node.id
  }

  return `${NODE_QUERY_CURSOR_PREFIX}${encodeBase64Url(JSON.stringify(cursor))}`
}

export function decodeNodeQueryCursor(cursor: string): NodeQueryCursor | null {
  if (!cursor.startsWith(NODE_QUERY_CURSOR_PREFIX)) return null

  try {
    const payload = JSON.parse(decodeBase64Url(cursor.slice(NODE_QUERY_CURSOR_PREFIX.length)))
    return isNodeQueryCursor(payload) ? payload : null
  } catch {
    return null
  }
}

export function getNodeQuerySearchTokens(search: NodeQuerySearchFilter): string[] {
  return tokenizeSearchText(search.text)
}

function tokenizeSearchText(text: string): string[] {
  const tokens = text.toLocaleLowerCase().match(/[\p{L}\p{N}_]+/gu)

  return [...new Set(tokens ?? [])]
}

function extractTipTapText(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return ''
  }

  const node = value as { text?: unknown; content?: unknown }
  const parts: string[] = []

  if (typeof node.text === 'string') {
    parts.push(node.text)
  }

  if (Array.isArray(node.content)) {
    parts.push(...node.content.map(extractTipTapText))
  }

  return parts.join(' ').trim()
}

function getSearchableText(
  node: NodeState,
  fields: readonly NodeQuerySearchField[] = ['title', 'content']
): string {
  const parts: string[] = []

  if (fields.includes('title') && typeof node.properties.title === 'string') {
    parts.push(node.properties.title)
  }

  if (fields.includes('content')) {
    const content = node.properties.content
    if (typeof content === 'string') {
      parts.push(content)
    } else {
      const richText = extractTipTapText(content)
      if (richText.length > 0) {
        parts.push(richText)
      }
    }

    const description = node.properties.description
    if (typeof description === 'string') {
      parts.push(description)
    }

    const body = node.properties.body
    if (typeof body === 'string') {
      parts.push(body)
    }
  }

  return parts.join(' ')
}

function getNumericProperty(
  properties: NodeState['properties'],
  key: string | undefined
): number | null {
  if (!key) {
    return null
  }

  const value = properties[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function matchesSpatialFilter(descriptor: NodeQueryDescriptor, node: NodeState): boolean {
  const spatial = descriptor.spatial
  if (!spatial) {
    return true
  }

  const x = getNumericProperty(node.properties, spatial.fields.x)
  const y = getNumericProperty(node.properties, spatial.fields.y)

  if (x === null || y === null) {
    return false
  }

  if (spatial.kind === 'radius') {
    const dx = x - spatial.center.x
    const dy = y - spatial.center.y

    return dx * dx + dy * dy <= spatial.radius * spatial.radius
  }

  const overscan = spatial.overscan ?? 0
  const left = spatial.rect.x - overscan
  const top = spatial.rect.y - overscan
  const right = spatial.rect.x + spatial.rect.width + overscan
  const bottom = spatial.rect.y + spatial.rect.height + overscan
  const width = getNumericProperty(node.properties, spatial.fields.width) ?? 0
  const height = getNumericProperty(node.properties, spatial.fields.height) ?? 0
  const nodeLeft = Math.min(x, x + width)
  const nodeTop = Math.min(y, y + height)
  const nodeRight = Math.max(x, x + width)
  const nodeBottom = Math.max(y, y + height)
  const isPointLike = width === 0 && height === 0

  if (isPointLike) {
    return x >= left && x <= right && y >= top && y <= bottom
  }

  return nodeRight >= left && nodeLeft <= right && nodeBottom >= top && nodeTop <= bottom
}

function matchesSearchFilter(descriptor: NodeQueryDescriptor, node: NodeState): boolean {
  const search = descriptor.search
  if (!search) {
    return true
  }

  const queryTokens = getNodeQuerySearchTokens(search)
  if (queryTokens.length === 0) {
    return false
  }

  const searchableTokens = tokenizeSearchText(
    getSearchableText(node, search.fields ?? ['title', 'content'])
  )
  if (searchableTokens.length === 0) {
    return false
  }

  return queryTokens.every((queryToken) =>
    searchableTokens.some((searchableToken) => searchableToken.startsWith(queryToken))
  )
}

export function createNodeQueryDescriptor<P extends Record<string, PropertyBuilder>>(
  schemaId: SchemaIRI,
  options?: NodeQueryOptions<P>
): NodeQueryDescriptor {
  return {
    schemaId,
    nodeId: options?.nodeId,
    where: sortRecord(options?.where as Record<string, unknown> | undefined),
    includeDeleted: options?.includeDeleted ?? false,
    orderBy: sortRecord(options?.orderBy as Record<string, SortDirection> | undefined),
    limit: options?.limit ?? options?.page?.first,
    offset: options?.offset,
    after: options?.page?.after,
    count: options?.page?.count,
    spatial: normalizeSpatialFilter(options?.spatial),
    search: normalizeSearchFilter(options?.search),
    materializedView: normalizeMaterializedViewOptions(options?.materializedView)
  }
}

export function nodeQueryDescriptorToOptions<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
>(descriptor: NodeQueryDescriptor): NodeQueryOptions<P> {
  const options: NodeQueryOptions<P> = {}

  if (descriptor.nodeId) {
    options.nodeId = descriptor.nodeId
  }

  if (descriptor.where) {
    options.where = descriptor.where as Partial<InferCreateProps<P>>
  }

  if (descriptor.includeDeleted) {
    options.includeDeleted = true
  }

  if (descriptor.orderBy) {
    options.orderBy = descriptor.orderBy as NodeQueryOptions<P>['orderBy']
  }

  if (descriptor.limit !== undefined) {
    options.limit = descriptor.limit
  }

  if (descriptor.offset !== undefined) {
    options.offset = descriptor.offset
  }

  if (descriptor.after || descriptor.count) {
    options.page = {
      first: descriptor.limit ?? 0,
      ...(descriptor.after ? { after: descriptor.after } : {}),
      ...(descriptor.count ? { count: descriptor.count } : {})
    }
  }

  if (descriptor.spatial) {
    options.spatial = descriptor.spatial
  }

  if (descriptor.search) {
    options.search = descriptor.search
  }

  if (descriptor.materializedView) {
    options.materializedView = descriptor.materializedView
  }

  return options
}

export function serializeNodeQueryDescriptor(descriptor: NodeQueryDescriptor): string {
  return JSON.stringify(descriptor)
}

export function matchesNodeQueryDescriptor(
  descriptor: NodeQueryDescriptor,
  node: NodeState | null | undefined
): boolean {
  if (!node) return false
  if (node.schemaId !== descriptor.schemaId) return false
  if (descriptor.nodeId && node.id !== descriptor.nodeId) return false
  if (!descriptor.includeDeleted && node.deleted) return false

  if (descriptor.where) {
    for (const [key, value] of Object.entries(descriptor.where)) {
      if (node.properties[key] !== value) {
        return false
      }
    }
  }

  return matchesSpatialFilter(descriptor, node) && matchesSearchFilter(descriptor, node)
}

export function filterNodeQueryResults(
  nodes: NodeState[],
  descriptor: NodeQueryDescriptor
): NodeState[] {
  return nodes.filter((node) => matchesNodeQueryDescriptor(descriptor, node))
}

export function sortNodeQueryResults(
  nodes: NodeState[],
  descriptor: NodeQueryDescriptor
): NodeState[] {
  const entries = getSortOrderEntries(descriptor)
  if (entries.length === 0) return nodes

  return [...nodes].sort((left, right) => {
    for (const entry of entries) {
      const comparison = compareOrderValues(
        getOrderValue(left, entry.field),
        getOrderValue(right, entry.field),
        entry.direction
      )
      if (comparison !== 0) {
        return comparison
      }
    }

    return 0
  })
}

export function applyNodeQueryDescriptor(
  nodes: NodeState[],
  descriptor: NodeQueryDescriptor
): NodeState[] {
  const filtered = filterNodeQueryResults(nodes, descriptor)
  const sorted = sortNodeQueryResults(filtered, descriptor)
  const afterCursor = filterAfterCursor(sorted, descriptor)
  const offset = descriptor.offset ?? 0

  if (descriptor.limit === undefined) {
    return afterCursor.slice(offset)
  }

  return afterCursor.slice(offset, offset + descriptor.limit)
}

export function nodeQueryDescriptorNeedsBoundedReload(descriptor: NodeQueryDescriptor): boolean {
  return (
    descriptor.limit !== undefined || (descriptor.offset ?? 0) > 0 || descriptor.after !== undefined
  )
}

export function withoutNodeQueryPagination(descriptor: NodeQueryDescriptor): NodeQueryDescriptor {
  const next = { ...descriptor }
  delete next.limit
  delete next.offset
  delete next.after
  delete next.count
  return next
}

export function withoutNodeQueryMaterializedView(
  descriptor: NodeQueryDescriptor
): NodeQueryDescriptor {
  const next = { ...descriptor }
  delete next.materializedView
  // The auth fingerprint is part of the materialized-view request, not the
  // query shape — exclude it from the descriptor hash so an authorization
  // change surfaces as 'authz-changed', never 'descriptor-changed'.
  delete next.authFingerprint
  return next
}
