/**
 * Shared query descriptor helpers for @xnetjs/data-bridge
 */
import type { QueryDescriptor, QueryOptions, SortDirection, SystemOrderField } from './types'
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
    offset: options?.offset
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

  return true
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
