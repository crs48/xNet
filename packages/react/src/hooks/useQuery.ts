/**
 * useQuery hook for querying documents
 */
import { useEffect, useState, useCallback, useRef } from 'react'
import { useXNet } from '../context'
import { createLocalQueryEngine, type Query, type QueryResult } from '@xnet/query'

/**
 * Options for useQuery hook
 */
export interface UseQueryOptions {
  enabled?: boolean
  refetchInterval?: number
}

/**
 * Result from useQuery hook
 */
export interface UseQueryResult<T> {
  data: T[]
  loading: boolean
  error?: Error
  total: number
  hasMore: boolean
  refetch: () => Promise<void>
  fetchMore: () => Promise<void>
}

interface QueryState<T> {
  data: T[]
  loading: boolean
  error?: Error
  total: number
  hasMore: boolean
  cursor?: string
}

/**
 * Hook for querying documents
 */
export function useQuery<T = unknown>(
  query: Query,
  options: UseQueryOptions = {}
): UseQueryResult<T> {
  const { enabled = true, refetchInterval } = options
  const { storage, isReady } = useXNet()

  const [state, setState] = useState<QueryState<T>>({
    data: [],
    loading: true,
    total: 0,
    hasMore: false
  })

  // Track cursor in ref to avoid dependency issues
  const cursorRef = useRef<string | undefined>(undefined)

  // Serialize query for dependency comparison
  const queryKey = JSON.stringify(query)

  const execute = useCallback(async (append = false) => {
    if (!isReady || !enabled) return

    setState(s => ({ ...s, loading: true, error: undefined }))

    try {
      const engine = createLocalQueryEngine(storage, async () => null)
      const queryWithCursor = append && cursorRef.current
        ? { ...query, offset: parseInt(cursorRef.current) }
        : query

      const result: QueryResult<T> = await engine.query<T>(queryWithCursor)

      cursorRef.current = result.cursor

      setState(s => ({
        data: append ? [...s.data, ...result.items] : result.items,
        loading: false,
        total: result.total,
        hasMore: result.hasMore,
        cursor: result.cursor
      }))
    } catch (error) {
      setState(s => ({ ...s, loading: false, error: error as Error }))
    }
  }, [isReady, enabled, storage, queryKey])

  // Initial fetch
  useEffect(() => {
    if (isReady && enabled) {
      execute(false)
    }
  }, [isReady, enabled, queryKey])

  // Refetch interval
  useEffect(() => {
    if (refetchInterval && refetchInterval > 0 && isReady && enabled) {
      const interval = setInterval(() => execute(false), refetchInterval)
      return () => clearInterval(interval)
    }
  }, [refetchInterval, isReady, enabled, execute])

  const refetch = useCallback(() => execute(false), [execute])
  const fetchMore = useCallback(() => execute(true), [execute])

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    total: state.total,
    hasMore: state.hasMore,
    refetch,
    fetchMore
  }
}
