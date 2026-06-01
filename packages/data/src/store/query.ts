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

export interface NodeQueryOptions<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> {
  nodeId?: string
  where?: Partial<InferCreateProps<P>>
  includeDeleted?: boolean
  orderBy?: { [K in keyof InferCreateProps<P> | SystemOrderField]?: SortDirection }
  limit?: number
  offset?: number
  spatial?: NodeQuerySpatialFilter
}

export interface NodeQueryDescriptor {
  schemaId: SchemaIRI
  nodeId?: string
  where?: Record<string, unknown>
  includeDeleted: boolean
  orderBy?: Record<string, SortDirection>
  limit?: number
  offset?: number
  spatial?: NodeQuerySpatialFilter
}

export interface NodeQueryPlanMetadata {
  strategy: 'storage-query' | 'list-fallback'
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
    limit: options?.limit,
    offset: options?.offset,
    spatial: normalizeSpatialFilter(options?.spatial)
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

  if (descriptor.spatial) {
    options.spatial = descriptor.spatial
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

  return matchesSpatialFilter(descriptor, node)
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
  if (!descriptor.orderBy) return nodes

  const entries = Object.entries(descriptor.orderBy) as [
    keyof NodeState['properties'] | SystemOrderField,
    SortDirection
  ][]
  if (entries.length === 0) return nodes

  return [...nodes].sort((left, right) => {
    for (const [key, direction] of entries) {
      const keyName = key as string
      let leftValue: unknown
      let rightValue: unknown

      if (keyName === 'createdAt' || keyName === 'updatedAt') {
        leftValue = left[keyName]
        rightValue = right[keyName]
      } else {
        leftValue = left.properties[keyName]
        rightValue = right.properties[keyName]
      }

      if (leftValue === rightValue) continue
      if (leftValue == null) return direction === 'asc' ? 1 : -1
      if (rightValue == null) return direction === 'asc' ? -1 : 1

      const comparison = leftValue < rightValue ? -1 : 1
      return direction === 'asc' ? comparison : -comparison
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
  const offset = descriptor.offset ?? 0

  if (descriptor.limit === undefined) {
    return sorted.slice(offset)
  }

  return sorted.slice(offset, offset + descriptor.limit)
}

export function nodeQueryDescriptorNeedsBoundedReload(descriptor: NodeQueryDescriptor): boolean {
  return descriptor.limit !== undefined || (descriptor.offset ?? 0) > 0
}

export function withoutNodeQueryPagination(descriptor: NodeQueryDescriptor): NodeQueryDescriptor {
  const next = { ...descriptor }
  delete next.limit
  delete next.offset
  return next
}
