/**
 * Hook for the Query Debugger panel
 */

import type { DevToolsEvent, QuerySubscribeEvent, QueryResultEvent } from '../../core/types'
import { useState, useEffect, useCallback } from 'react'
import { useDevTools } from '../../provider/useDevTools'

export interface QueryStats {
  id: string
  type: 'useQuery' | 'useMutate' | 'useNode'
  schemaId: string
  mode: 'list' | 'single' | 'filtered' | 'document'
  filter?: Record<string, unknown>
  callerInfo?: string

  registeredAt: number
  lastUpdateAt: number | null
  active: boolean

  updateCount: number
  resultCount: number
  avgRenderTime: number
  peakRenderTime: number
  totalRenderTime: number
}

export type SortBy = 'updates' | 'render' | 'recent'

const QUERY_EVENT_TYPES = new Set([
  'query:subscribe',
  'query:unsubscribe',
  'query:result',
  'query:error'
])

export function useQueryDebugger() {
  const { eventBus } = useDevTools()
  const [queries, setQueries] = useState<Map<string, QueryStats>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('updates')

  // Rebuild from existing events
  useEffect(() => {
    const allEvents = eventBus.getEvents().filter((e) => QUERY_EVENT_TYPES.has(e.type))
    const map = new Map<string, QueryStats>()
    for (const event of allEvents) {
      processEvent(event, map)
    }
    setQueries(map)
  }, [eventBus])

  // Subscribe to live events
  useEffect(() => {
    const unsub = eventBus.subscribe((event: DevToolsEvent) => {
      if (!QUERY_EVENT_TYPES.has(event.type)) return

      setQueries((prev) => {
        const next = new Map(prev)
        processEvent(event, next)
        return next
      })
    })
    return unsub
  }, [eventBus])

  const activeQueries = Array.from(queries.values()).filter((q) => q.active)
  const sorted = sortQueries(activeQueries, sortBy)

  const totalUpdates = activeQueries.reduce((sum, q) => sum + q.updateCount, 0)
  const avgRender =
    activeQueries.length > 0
      ? activeQueries.reduce((sum, q) => sum + q.avgRenderTime, 0) / activeQueries.length
      : 0

  const selectedQuery = selectedId ? (queries.get(selectedId) ?? null) : null

  const setSelectedQuery = useCallback((q: QueryStats | null) => {
    setSelectedId(q?.id ?? null)
  }, [])

  return {
    queries: sorted,
    allQueries: Array.from(queries.values()),
    selectedQuery,
    setSelectedQuery,
    sortBy,
    setSortBy,
    totalUpdates,
    avgRender
  }
}

function processEvent(event: DevToolsEvent, map: Map<string, QueryStats>): void {
  switch (event.type) {
    case 'query:subscribe': {
      const e = event as QuerySubscribeEvent
      map.set(e.queryId, {
        id: e.queryId,
        type: inferHookType(e.queryId),
        schemaId: e.schemaId,
        mode: e.mode as QueryStats['mode'],
        filter: e.filter,
        callerInfo: e.callerInfo,
        registeredAt: e.wallTime,
        lastUpdateAt: null,
        active: true,
        updateCount: 0,
        resultCount: 0,
        avgRenderTime: 0,
        peakRenderTime: 0,
        totalRenderTime: 0
      })
      break
    }
    case 'query:unsubscribe': {
      const existing = map.get((event as any).queryId)
      if (existing) {
        map.set(existing.id, { ...existing, active: false })
      }
      break
    }
    case 'query:result': {
      const e = event as QueryResultEvent
      const existing = map.get(e.queryId)
      if (existing) {
        const updateCount = existing.updateCount + 1
        const totalRenderTime = existing.totalRenderTime + e.duration
        map.set(existing.id, {
          ...existing,
          updateCount,
          resultCount: e.resultCount,
          lastUpdateAt: e.wallTime,
          totalRenderTime,
          avgRenderTime: totalRenderTime / updateCount,
          peakRenderTime: Math.max(existing.peakRenderTime, e.duration)
        })
      }
      break
    }
  }
}

function inferHookType(queryId: string): QueryStats['type'] {
  if (queryId.startsWith('useNode')) return 'useNode'
  if (queryId.startsWith('useMutate')) return 'useMutate'
  return 'useQuery'
}

function sortQueries(queries: QueryStats[], by: SortBy): QueryStats[] {
  const sorted = [...queries]
  switch (by) {
    case 'updates':
      return sorted.sort((a, b) => b.updateCount - a.updateCount)
    case 'render':
      return sorted.sort((a, b) => b.peakRenderTime - a.peakRenderTime)
    case 'recent':
      return sorted.sort((a, b) => (b.lastUpdateAt ?? 0) - (a.lastUpdateAt ?? 0))
    default:
      return sorted
  }
}
