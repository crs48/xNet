/**
 * Shared query metadata helpers for bridge implementations.
 */

import type { QueryDescriptor, QueryMetadata, QuerySource } from './types'
import {
  encodeNodeQueryCursor,
  type NodeQueryDescriptor,
  type NodeQueryResult,
  type NodeState
} from '@xnetjs/data'

function getOffset(descriptor: QueryDescriptor): number {
  return descriptor.offset ?? 0
}

function getPageInfo(descriptor: QueryDescriptor, nodes: NodeState[], totalCount: number | null) {
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
    hasMore,
    hasNextPage: hasMore,
    hasPreviousPage,
    ...(startCursor ? { startCursor } : {}),
    ...(endCursor ? { endCursor } : {}),
    loadedCount
  }
}

function getUnboundedTotalCount(
  descriptor: QueryDescriptor,
  nodes: NodeState[],
  result?: NodeQueryResult
): number | null {
  if (result?.plan.materializedRowCount !== undefined) {
    return result.plan.materializedRowCount
  }

  if (result?.totalCount !== undefined) {
    return result.totalCount
  }

  const isUnbounded =
    descriptor.limit === undefined && getOffset(descriptor) === 0 && descriptor.after === undefined
  return isUnbounded ? nodes.length : null
}

export function createQueryMetadata(input: {
  descriptor: QueryDescriptor
  result: NodeQueryResult
  source: QuerySource
}): QueryMetadata {
  const { descriptor, result, source } = input
  const totalCount = getUnboundedTotalCount(descriptor, result.nodes, result)
  const materializedViewId = result.plan.materializedViewId

  return {
    source,
    updatedAt: Date.now(),
    pageInfo: getPageInfo(descriptor, result.nodes, totalCount),
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
    pageInfo: getPageInfo(input.descriptor, [], 0),
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
    pageInfo: getPageInfo(
      input.descriptor,
      input.nodes,
      getUnboundedTotalCount(input.descriptor, input.nodes)
    )
  }
}
