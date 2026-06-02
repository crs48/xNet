/**
 * Shared query descriptor helpers for @xnetjs/data-bridge
 */

import type { QueryDescriptor, QueryOptions } from './types'
import type {
  NodeQueryDescriptor,
  NodeQueryOptions,
  NodeState,
  PropertyBuilder,
  SchemaIRI,
  NodeQueryCursor
} from '@xnetjs/data'
import {
  applyNodeQueryDescriptor,
  createNodeQueryDescriptor,
  decodeNodeQueryCursor,
  encodeNodeQueryCursor,
  matchesNodeQueryDescriptor,
  nodeQueryDescriptorNeedsBoundedReload,
  nodeQueryDescriptorToOptions,
  serializeNodeQueryDescriptor,
  sortNodeQueryResults
} from '@xnetjs/data'

export type QueryResultDelta =
  | { kind: 'noop' }
  | { kind: 'reload' }
  | { kind: 'set'; data: NodeState[] }

function toNodeDescriptor(descriptor: QueryDescriptor): NodeQueryDescriptor {
  return descriptor as NodeQueryDescriptor
}

export function createQueryDescriptor<P extends Record<string, PropertyBuilder>>(
  schemaId: SchemaIRI,
  options?: QueryOptions<P>
): QueryDescriptor {
  return createNodeQueryDescriptor(
    schemaId,
    options as NodeQueryOptions<P> | undefined
  ) as QueryDescriptor
}

export function queryDescriptorToOptions<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
>(descriptor: QueryDescriptor): QueryOptions<P> {
  return nodeQueryDescriptorToOptions<P>(toNodeDescriptor(descriptor)) as QueryOptions<P>
}

export function serializeQueryDescriptor(descriptor: QueryDescriptor): string {
  return serializeNodeQueryDescriptor(toNodeDescriptor(descriptor))
}

export function encodeQueryCursor(descriptor: QueryDescriptor, node: NodeState): string {
  return encodeNodeQueryCursor(toNodeDescriptor(descriptor), node)
}

export function decodeQueryCursor(cursor: string): NodeQueryCursor | null {
  return decodeNodeQueryCursor(cursor)
}

export function matchesQueryDescriptor(
  descriptor: QueryDescriptor,
  node: NodeState | null | undefined
): boolean {
  return matchesNodeQueryDescriptor(toNodeDescriptor(descriptor), node)
}

export function filterQueryNodes(nodes: NodeState[], descriptor: QueryDescriptor): NodeState[] {
  return nodes.filter((node) => matchesQueryDescriptor(descriptor, node))
}

export function sortQueryNodes(nodes: NodeState[], descriptor: QueryDescriptor): NodeState[] {
  return sortNodeQueryResults(nodes, toNodeDescriptor(descriptor))
}

export function applyQueryDescriptor(nodes: NodeState[], descriptor: QueryDescriptor): NodeState[] {
  return applyNodeQueryDescriptor(nodes, toNodeDescriptor(descriptor))
}

export function queryDescriptorNeedsBoundedReload(descriptor: QueryDescriptor): boolean {
  return nodeQueryDescriptorNeedsBoundedReload(toNodeDescriptor(descriptor))
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
