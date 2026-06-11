/**
 * Shared derivations from bridge query metadata used by the read hooks
 * (useQuery, useSavedView, useInfiniteQuery).
 */

import type { QueryMetadata, QueryPageInfo } from '@xnetjs/data-bridge'

export interface QueryPlanSummary {
  strategy?: string
  candidateNodeCount?: number
  hydratedNodeCount?: number
  returnedNodeCount?: number
  durationMs?: number
  descriptorHash?: string
  candidateAccelerators?: string[]
  materializedViewId?: string
  materializedCacheHit?: boolean
  materializedRefreshReason?: string
}

export const EMPTY_PAGE_INFO: QueryPageInfo = {
  totalCount: null,
  countMode: 'none',
  hasMore: false,
  hasNextPage: false,
  hasPreviousPage: false,
  loadedCount: 0
}

/**
 * Derive pageInfo when the bridge did not provide one. `loadedCount: null`
 * means the caller has no countable list (loading, single-node query) and
 * gets the empty fallback.
 */
export function computeFallbackPageInfo(input: {
  metadata: QueryMetadata | null
  loading: boolean
  loadedCount: number | null
  offset: number
  limit: number | undefined
}): QueryPageInfo {
  if (input.metadata?.pageInfo) {
    return input.metadata.pageInfo
  }

  if (input.loading || input.loadedCount === null) {
    return EMPTY_PAGE_INFO
  }

  const { loadedCount, offset, limit } = input
  const totalCount = limit === undefined && offset === 0 ? loadedCount : null
  const countMode = totalCount === null ? 'none' : 'exact'
  const hasMore =
    limit !== undefined
      ? totalCount === null
        ? loadedCount >= limit
        : offset + loadedCount < totalCount
      : false

  return {
    totalCount,
    countMode,
    hasMore,
    hasNextPage: hasMore,
    hasPreviousPage: offset > 0,
    loadedCount
  }
}

export function summarizePlan(metadata: QueryMetadata | null): QueryPlanSummary | null {
  const plan = metadata?.plan
  if (!plan) return null

  return {
    strategy: plan.strategy,
    candidateNodeCount: plan.candidateNodeCount,
    hydratedNodeCount: plan.hydratedNodeCount,
    returnedNodeCount: plan.returnedNodeCount,
    durationMs: plan.durationMs,
    descriptorHash: plan.descriptorHash,
    candidateAccelerators: plan.candidateAccelerators,
    materializedViewId: plan.materializedViewId,
    materializedCacheHit: plan.materializedCacheHit,
    materializedRefreshReason: plan.materializedRefreshReason
  }
}
