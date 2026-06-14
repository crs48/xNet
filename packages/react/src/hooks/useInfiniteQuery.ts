/**
 * useInfiniteQuery - incremental "load more" wrapper over useQuery.
 *
 * Unlike a cursor-paged implementation (which freezes earlier pages and keeps
 * the live page on `after` cursor semantics — a shape that falls off the
 * bridge's incremental delta path and re-executes storage on every matching
 * edit), this hook models the loaded region as a single GROWING
 * `limit + orderBy` window. That descriptor stays on the bounded-delta fast
 * path, so:
 *
 * - edits to any already-loaded row update in place without re-querying, and
 * - every loaded row stays live (no stale frozen pages).
 *
 * Calling `fetchNextPage()` grows the window by `pageSize`; the previous rows
 * are retained during the (single) read for the larger window so the list
 * does not flicker.
 */

import type { DefinedSchema, PropertyBuilder } from '@xnetjs/data'
import type { QueryMaterializedMetadata, QueryPageInfo, QuerySource } from '@xnetjs/data-bridge'
import { createQueryDescriptor, serializeQueryDescriptor } from '@xnetjs/data-bridge'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  useQuery,
  type FlatNode,
  type MigrationWarning,
  type QueryBaseResult,
  type QueryFilter,
  type QueryListResult,
  type QueryPlanSummary,
  type QueryStatus
} from './useQuery'

const DEFAULT_PAGE_SIZE = 50

export interface InfiniteQueryFilter<
  P extends Record<string, PropertyBuilder> = Record<string, PropertyBuilder>
> extends Omit<QueryFilter<P>, 'limit' | 'offset' | 'page'> {
  /** Number of rows to grow the window by on each `fetchNextPage()`. */
  pageSize?: number
  /** Optional page metadata. `first` defaults to `pageSize` when omitted. */
  page?: Omit<NonNullable<QueryFilter<P>['page']>, 'first'> & { first?: number }
  /**
   * Upper bound on the live window size. Once reached, `fetchNextPage()` is a
   * no-op and `hasMore` is false. Defaults to unbounded — set this for
   * virtualized lists so the overfetch buffer and live snapshot stay bounded.
   */
  maxLoaded?: number
}

export interface InfiniteQueryPage<P extends Record<string, PropertyBuilder>> {
  cursor: string | null
  data: FlatNode<P>[]
  pageInfo: QueryPageInfo
}

export interface InfiniteQueryResult<
  P extends Record<string, PropertyBuilder>
> extends QueryBaseResult {
  /** All loaded rows in descriptor order. */
  data: FlatNode<P>[]
  /** Loaded rows grouped into `pageSize` chunks for grouped/virtualized rendering. */
  pages: InfiniteQueryPage<P>[]
  /** Aggregated pagination metadata for the loaded window. */
  pageInfo: QueryPageInfo
  /** Total matching count when known. Null means unavailable or intentionally not counted. */
  totalCount: number | null
  /** Whether the window can grow further. */
  hasMore: boolean
  /** Whether `fetchNextPage()` has grown the window and is awaiting the larger read. */
  isFetchingNextPage: boolean
  /** Grow the loaded window by `pageSize` (bounded by `maxLoaded`). */
  fetchNextPage: () => Promise<void>
  /** Shrink the window back to the first page. */
  reset: () => void
  /** Migration warnings across the loaded window. */
  migrationWarnings: MigrationWarning[]
}

function getBaseFilter<P extends Record<string, PropertyBuilder>>(
  filter: InfiniteQueryFilter<P>
): QueryFilter<P> {
  const baseFilter = { ...filter } as QueryFilter<P> & {
    pageSize?: number
    maxLoaded?: number
  }
  delete baseFilter.pageSize
  delete baseFilter.maxLoaded
  delete baseFilter.page

  return {
    ...baseFilter,
    orderBy: baseFilter.orderBy ?? ({ updatedAt: 'desc' } as QueryFilter<P>['orderBy'])
  }
}

function chunkIntoPages<P extends Record<string, PropertyBuilder>>(
  data: FlatNode<P>[],
  pageSize: number,
  pageInfo: QueryPageInfo
): InfiniteQueryPage<P>[] {
  if (data.length === 0) return []
  const pages: InfiniteQueryPage<P>[] = []
  for (let i = 0; i < data.length; i += pageSize) {
    pages.push({ cursor: null, data: data.slice(i, i + pageSize), pageInfo })
  }
  return pages
}

export function useInfiniteQuery<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  filter: InfiniteQueryFilter<P> = {}
): InfiniteQueryResult<P> {
  const pageSize = filter.page?.first ?? filter.pageSize ?? DEFAULT_PAGE_SIZE
  const count = filter.page?.count
  const maxLoaded = filter.maxLoaded
  const baseFilter = useMemo(() => getBaseFilter(filter), [filter])
  const baseKey = useMemo(
    () => serializeQueryDescriptor(createQueryDescriptor(schema._schemaId, baseFilter)),
    [schema._schemaId, baseFilter]
  )

  // The window grows by pageSize; the descriptor stays on the bounded-delta
  // fast path (limit + orderBy, offset 0, no cursor) so edits never reload.
  const [loadedCount, setLoadedCount] = useState(() =>
    maxLoaded === undefined ? pageSize : Math.min(pageSize, maxLoaded)
  )

  useEffect(() => {
    setLoadedCount(maxLoaded === undefined ? pageSize : Math.min(pageSize, maxLoaded))
  }, [baseKey, pageSize, maxLoaded])

  const windowFilter = useMemo<QueryFilter<P>>(
    () =>
      count
        ? { ...baseFilter, page: { first: loadedCount, count } }
        : { ...baseFilter, limit: loadedCount },
    [baseFilter, loadedCount, count]
  )
  const current = useQuery(schema, windowFilter) as QueryListResult<P>

  // Keep the previously loaded rows visible while the larger window reads, so
  // growing the window does not flash an empty list. A grow is a new
  // descriptor (different limit) and therefore a fresh cache entry that starts
  // empty until storage responds.
  const lastDataRef = useRef<FlatNode<P>[]>([])
  if (!current.loading) {
    lastDataRef.current = current.data
  }
  const data = current.loading && current.data.length === 0 ? lastDataRef.current : current.data

  const atCeiling = maxLoaded !== undefined && loadedCount >= maxLoaded
  // "Can grow" is derived from the visible result, not from the bridge's
  // pageInfo: for a bounded query `pageInfo.hasMore` only reports overfetch
  // saturation and `totalCount` is not populated, so neither distinguishes
  // "exactly a full window" from "a full window with more behind it". A window
  // that returned at least as many rows as it asked for may have more behind
  // it; one that returned fewer is definitively complete. The cost is at most
  // one extra, no-op grow at the very end of a list.
  const moreAvailable =
    current.pageInfo.hasMore || (!current.loading && current.data.length >= loadedCount)
  const hasMore = moreAvailable && !atCeiling
  const isFetchingNextPage = current.loading && data.length > 0

  const fetchNextPage = useCallback(async () => {
    if (current.loading || !hasMore) return
    setLoadedCount((n) => {
      if (maxLoaded !== undefined && n >= maxLoaded) return n
      const next = n + pageSize
      return maxLoaded === undefined ? next : Math.min(next, maxLoaded)
    })
  }, [current.loading, hasMore, maxLoaded, pageSize])

  const reset = useCallback(() => {
    lastDataRef.current = []
    setLoadedCount(maxLoaded === undefined ? pageSize : Math.min(pageSize, maxLoaded))
  }, [maxLoaded, pageSize])

  const reload = useCallback(() => {
    current.reload()
  }, [current])

  const pages = useMemo(
    () => chunkIntoPages(data, pageSize, current.pageInfo),
    [data, pageSize, current.pageInfo]
  )

  const pageInfo = useMemo<QueryPageInfo>(
    () => ({ ...current.pageInfo, hasMore, hasNextPage: hasMore, loadedCount: data.length }),
    [current.pageInfo, hasMore, data.length]
  )

  const loading = current.loading && data.length === 0

  return {
    data,
    pages,
    status: current.status as QueryStatus,
    loading,
    isLoading: loading,
    isFetching: current.isFetching || isFetchingNextPage,
    isFetchingNextPage,
    isLive: current.isLive,
    source: current.source as QuerySource,
    error: current.error,
    reload,
    reset,
    fetchNextPage,
    migrationWarnings: current.migrationWarnings,
    pageInfo,
    totalCount: pageInfo.totalCount,
    hasMore,
    plan: current.plan as QueryPlanSummary | null,
    materialized: current.materialized as QueryMaterializedMetadata | null,
    completeness: current.completeness,
    staleness: current.staleness,
    verification: current.verification,
    stream: current.stream
  }
}
