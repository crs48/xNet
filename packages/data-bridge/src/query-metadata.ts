/**
 * Shared query metadata helpers for bridge implementations.
 */

import type { QueryDescriptor, QueryMetadata, QueryPageCountMode, QuerySource } from './types'
import {
  encodeNodeQueryCursor,
  type NodeQueryDescriptor,
  type NodeQueryResult,
  type NodeState
} from '@xnetjs/data'

function getOffset(descriptor: QueryDescriptor): number {
  return descriptor.offset ?? 0
}

function getPageInfo(input: {
  descriptor: QueryDescriptor
  nodes: NodeState[]
  totalCount: number | null
  countMode: QueryPageCountMode
}) {
  const { descriptor, nodes, totalCount, countMode } = input
  const loadedCount = nodes.length
  const offset = getOffset(descriptor)
  const hasCursor = descriptor.after !== undefined
  const startCursor =
    loadedCount > 0
      ? encodeNodeQueryCursor(descriptor as NodeQueryDescriptor, nodes[0]!)
      : undefined
  const endCursor =
    loadedCount > 0
      ? encodeNodeQueryCursor(descriptor as NodeQueryDescriptor, nodes[loadedCount - 1]!)
      : undefined
  const hasPreviousPage = offset > 0 || hasCursor
  const hasMore =
    descriptor.limit !== undefined
      ? totalCount === null || hasCursor
        ? loadedCount >= descriptor.limit
        : offset + loadedCount < totalCount
      : false

  return {
    totalCount,
    countMode,
    hasMore,
    hasNextPage: hasMore,
    hasPreviousPage,
    ...(startCursor ? { startCursor } : {}),
    ...(endCursor ? { endCursor } : {}),
    loadedCount
  }
}

function getCountMetadata(
  descriptor: QueryDescriptor,
  nodes: NodeState[],
  result?: NodeQueryResult
): { totalCount: number | null; countMode: QueryPageCountMode } {
  if (descriptor.count === 'none') {
    return { totalCount: null, countMode: 'none' }
  }

  if (result?.plan.materializedRowCount !== undefined) {
    return { totalCount: result.plan.materializedRowCount, countMode: 'exact' }
  }

  if (result?.totalCount !== undefined) {
    return { totalCount: result.totalCount, countMode: 'exact' }
  }

  if (descriptor.count === 'estimate') {
    return {
      totalCount: result?.plan.candidateNodeCount ?? nodes.length,
      countMode: 'estimate'
    }
  }

  const isUnbounded =
    descriptor.limit === undefined && getOffset(descriptor) === 0 && descriptor.after === undefined
  return isUnbounded
    ? { totalCount: nodes.length, countMode: 'exact' }
    : { totalCount: null, countMode: 'none' }
}

export function createQueryMetadata(input: {
  descriptor: QueryDescriptor
  result: NodeQueryResult
  source: QuerySource
}): QueryMetadata {
  const { descriptor, result, source } = input
  const count = getCountMetadata(descriptor, result.nodes, result)
  const materializedViewId = result.plan.materializedViewId

  return {
    source,
    updatedAt: Date.now(),
    pageInfo: getPageInfo({ descriptor, nodes: result.nodes, ...count }),
    plan: result.plan,
    ...(materializedViewId
      ? {
          materialized: {
            viewId: materializedViewId,
            cacheHit: result.plan.materializedCacheHit ?? false,
            generatedAt: result.plan.materializedGeneratedAt ?? Date.now(),
            ...(result.plan.materializedInvalidatedAt !== undefined
              ? { invalidatedAt: result.plan.materializedInvalidatedAt }
              : {}),
            rowCount: result.plan.materializedRowCount ?? result.nodes.length
          }
        }
      : {})
  }
}

export function createQueryErrorMetadata(input: {
  descriptor: QueryDescriptor
  source: QuerySource
  error: Error
}): QueryMetadata {
  return {
    source: input.source,
    updatedAt: Date.now(),
    pageInfo: getPageInfo({
      descriptor: input.descriptor,
      nodes: [],
      totalCount: 0,
      countMode: 'exact'
    }),
    error: input.error.message
  }
}

export function createQuerySnapshotMetadata(input: {
  descriptor: QueryDescriptor
  nodes: NodeState[]
  source: QuerySource
}): QueryMetadata {
  return {
    source: input.source,
    updatedAt: Date.now(),
    pageInfo: getPageInfo({
      descriptor: input.descriptor,
      nodes: input.nodes,
      ...getCountMetadata(input.descriptor, input.nodes)
    })
  }
}
