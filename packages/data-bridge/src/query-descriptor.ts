/**
 * Shared query descriptor helpers for @xnetjs/data-bridge
 */
import type {
  QueryDescriptor,
  QueryOptions,
  QuerySpatialFilter,
  QuerySpatialPoint,
  QuerySpatialRect,
  SortDirection,
  SystemOrderField
} from './types'
import type { NodeState, PropertyBuilder, InferCreateProps, SchemaIRI } from '@xnetjs/data'

export type QueryResultDelta =
  | { kind: 'noop' }
  | { kind: 'reload' }
  | { kind: 'set'; data: NodeState[] }

function sortRecord<T>(record?: Record<string, T>): Record<string, T> | undefined {
  if (!record) return undefined

  const entries = Object.entries(record).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) return undefined

  return Object.fromEntries(entries)
}

function normalizeSpatialPoint(point: QuerySpatialPoint): QuerySpatialPoint {
  return {
    x: point.x,
    y: point.y
  }
}

function normalizeSpatialRect(rect: QuerySpatialRect): QuerySpatialRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height
  }
}

function normalizeSpatialFilter(spatial?: QuerySpatialFilter): QuerySpatialFilter | undefined {
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

function matchesSpatialFilter(descriptor: QueryDescriptor, node: NodeState): boolean {
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

export function createQueryDescriptor<P extends Record<string, PropertyBuilder>>(
  schemaId: SchemaIRI,
  options?: QueryOptions<P>
): QueryDescriptor {
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

export function queryDescriptorToOptions<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
>(descriptor: QueryDescriptor): QueryOptions<P> {
  const options: QueryOptions<P> = {}

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
    options.orderBy = descriptor.orderBy as QueryOptions<P>['orderBy']
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

export function serializeQueryDescriptor(descriptor: QueryDescriptor): string {
  return JSON.stringify(descriptor)
}

export function matchesQueryDescriptor(
  descriptor: QueryDescriptor,
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

export function filterQueryNodes(nodes: NodeState[], descriptor: QueryDescriptor): NodeState[] {
  return nodes.filter((node) => matchesQueryDescriptor(descriptor, node))
}

export function sortQueryNodes(nodes: NodeState[], descriptor: QueryDescriptor): NodeState[] {
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

export function applyQueryDescriptor(nodes: NodeState[], descriptor: QueryDescriptor): NodeState[] {
  const filtered = filterQueryNodes(nodes, descriptor)
  const sorted = sortQueryNodes(filtered, descriptor)
  const offset = descriptor.offset ?? 0

  if (descriptor.limit === undefined) {
    return sorted.slice(offset)
  }

  return sorted.slice(offset, offset + descriptor.limit)
}

export function queryDescriptorNeedsBoundedReload(descriptor: QueryDescriptor): boolean {
  return descriptor.limit !== undefined || (descriptor.offset ?? 0) > 0
}

export function applyNodeChangeToQueryResult(input: {
  descriptor: QueryDescriptor
  currentData: NodeState[]
  nodeId: string
  nextNode: NodeState | null
}): QueryResultDelta {
  const { descriptor, currentData, nodeId, nextNode } = input
  const currentIndex = currentData.findIndex((node) => node.id === nodeId)
  const currentContains = currentIndex >= 0
  const nextMatches = matchesQueryDescriptor(descriptor, nextNode)

  if (queryDescriptorNeedsBoundedReload(descriptor)) {
    return currentContains || nextMatches ? { kind: 'reload' } : { kind: 'noop' }
  }

  if (!currentContains && !nextMatches) {
    return { kind: 'noop' }
  }

  if (currentContains && !nextMatches) {
    return {
      kind: 'set',
      data: currentData.filter((node) => node.id !== nodeId)
    }
  }

  if (!nextNode) {
    return { kind: 'noop' }
  }

  const nextData = currentContains
    ? currentData.map((node) => (node.id === nodeId ? nextNode : node))
    : [...currentData, nextNode]

  return {
    kind: 'set',
    data: applyQueryDescriptor(nextData, descriptor)
  }
}
