/**
 * useInfiniteQuery - cursor-page convenience wrapper over useQuery.
 */

import type { DefinedSchema, PropertyBuilder } from '@xnetjs/data'
import type { QueryMaterializedMetadata, QueryPageInfo, QuerySource } from '@xnetjs/data-bridge'
import { createQueryDescriptor, serializeQueryDescriptor } from '@xnetjs/data-bridge'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
  /** Number of rows to request per cursor page. */
  pageSize?: number
  /** Optional page metadata. `first` defaults to `pageSize` when omitted. */
  page?: Omit<NonNullable<QueryFilter<P>['page']>, 'first'> & { first?: number }
}

export interface InfiniteQueryPage<P extends Record<string, PropertyBuilder>> {
  cursor: string | null
  data: FlatNode<P>[]
  pageInfo: QueryPageInfo
}

export interface InfiniteQueryResult<
  P extends Record<string, PropertyBuilder>
> extends QueryBaseResult {
  /** Flattened rows across all loaded pages. */
  data: FlatNode<P>[]
  /** Individual cursor pages retained for virtualized or grouped rendering. */
  pages: InfiniteQueryPage<P>[]
  /** Aggregated pagination metadata for the loaded page window. */
  pageInfo: QueryPageInfo
  /** Total matching count when known. Null means unavailable or intentionally not counted. */
  totalCount: number | null
  /** Whether another page may be available. */
  hasMore: boolean
  /** Whether `fetchNextPage()` has advanced the active cursor and is awaiting data. */
  isFetchingNextPage: boolean
  /** Advance to the next cursor page when `pageInfo.endCursor` is available. */
  fetchNextPage: () => Promise<void>
  /** Clear accumulated pages and return to the first page. */
  reset: () => void
  /** Migration warnings for the currently active page. */
  migrationWarnings: MigrationWarning[]
}

function getBaseFilter<P extends Record<string, PropertyBuilder>>(
  filter: InfiniteQueryFilter<P>
): QueryFilter<P> {
  const baseFilter = { ...filter } as QueryFilter<P> & {
    pageSize?: number
  }
  delete baseFilter.pageSize
  delete baseFilter.page

  return {
    ...baseFilter,
    orderBy: baseFilter.orderBy ?? ({ updatedAt: 'desc' } as QueryFilter<P>['orderBy'])
  }
}

function getAggregatePageInfo<P extends Record<string, PropertyBuilder>>(input: {
  pages: InfiniteQueryPage<P>[]
  current: QueryListResult<P>
  data: FlatNode<P>[]
}): QueryPageInfo {
  const { pages, current, data } = input
  if (pages.length === 0) {
    return current.pageInfo
  }

  const first = pages[0]
  const last = pages[pages.length - 1]

  return {
    ...last.pageInfo,
    totalCount: current.totalCount ?? last.pageInfo.totalCount,
    hasMore: last.pageInfo.hasMore,
    hasNextPage: last.pageInfo.hasNextPage,
    hasPreviousPage: pages.length > 1 || last.pageInfo.hasPreviousPage,
    startCursor: first.pageInfo.startCursor,
    endCursor: last.pageInfo.endCursor,
    loadedCount: data.length
  }
}

export function useInfiniteQuery<P extends Record<string, PropertyBuilder>>(
  schema: DefinedSchema<P>,
  filter: InfiniteQueryFilter<P> = {}
): InfiniteQueryResult<P> {
  const pageSize = filter.page?.first ?? filter.pageSize ?? DEFAULT_PAGE_SIZE
  const count = filter.page?.count
  const baseFilter = useMemo(() => getBaseFilter(filter), [filter])
  const baseKey = useMemo(
    () => serializeQueryDescriptor(createQueryDescriptor(schema._schemaId, baseFilter)),
    [schema._schemaId, baseFilter]
  )
  const [cursor, setCursor] = useState<string | undefined>()
  const [pages, setPages] = useState<InfiniteQueryPage<P>[]>([])
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false)

  useEffect(() => {
    setCursor(undefined)
    setPages([])
    setIsFetchingNextPage(false)
  }, [baseKey, pageSize, count])

  const activeFilter = useMemo<QueryFilter<P>>(
    () => ({
      ...baseFilter,
      page: {
        first: pageSize,
        ...(cursor ? { after: cursor } : {}),
        ...(count ? { count } : {})
      }
    }),
    [baseFilter, pageSize, cursor, count]
  )
  const current = useQuery(schema, activeFilter) as QueryListResult<P>
  const activeCursor = cursor ?? null

  useEffect(() => {
    if (current.loading) return

    setPages((existing) => {
      const nextPage: InfiniteQueryPage<P> = {
        cursor: activeCursor,
        data: current.data,
        pageInfo: current.pageInfo
      }
      const index = existing.findIndex((page) => page.cursor === activeCursor)

      if (index === -1) {
        return [...existing, nextPage]
      }

      return existing.map((page, pageIndex) => (pageIndex === index ? nextPage : page))
    })
    setIsFetchingNextPage(false)
  }, [activeCursor, current.data, current.loading, current.pageInfo])

  const reset = useCallback(() => {
    setCursor(undefined)
    setPages([])
    setIsFetchingNextPage(false)
  }, [])

  const reload = useCallback(() => {
    reset()
    current.reload()
  }, [current, reset])

  const fetchNextPage = useCallback(async () => {
    if (isFetchingNextPage || !current.pageInfo.hasNextPage || !current.pageInfo.endCursor) {
      return
    }

    setIsFetchingNextPage(true)
    setCursor(current.pageInfo.endCursor)
  }, [current.pageInfo.endCursor, current.pageInfo.hasNextPage, isFetchingNextPage])

  const data = useMemo(
    () => (pages.length > 0 ? pages.flatMap((page) => page.data) : current.data),
    [current.data, pages]
  )
  const pageInfo = useMemo(
    () => getAggregatePageInfo({ pages, current, data }),
    [current, data, pages]
  )
  const loading = current.loading && pages.length === 0

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
    hasMore: pageInfo.hasMore,
    plan: current.plan as QueryPlanSummary | null,
    materialized: current.materialized as QueryMaterializedMetadata | null
  }
}
