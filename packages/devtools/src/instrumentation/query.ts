/**
 * QueryTracker - tracks active useQuery/useMutate/useDocument hooks
 *
 * Hooks opt-in to reporting by checking for a QueryTracker in context.
 * If no DevToolsProvider is present, the tracker is null and hooks skip reporting.
 */

import type { DevToolsEventBus } from '../core/event-bus'

export interface TrackedQuery {
  id: string
  type: 'useQuery' | 'useMutate' | 'useDocument'
  schemaId: string
  mode: 'list' | 'single' | 'filtered' | 'document'
  filter?: Record<string, unknown>
  nodeId?: string

  registeredAt: number
  lastUpdateAt: number | null
  unregisteredAt: number | null

  updateCount: number
  resultCount: number
  totalRenderTime: number
  avgRenderTime: number
  peakRenderTime: number
}

export class QueryTracker {
  private queries = new Map<string, TrackedQuery>()

  constructor(private bus: DevToolsEventBus) {}

  register(
    id: string,
    meta: {
      type: TrackedQuery['type']
      schemaId: string
      mode: TrackedQuery['mode']
      filter?: Record<string, unknown>
      nodeId?: string
    }
  ): void {
    this.queries.set(id, {
      id,
      ...meta,
      registeredAt: Date.now(),
      lastUpdateAt: null,
      unregisteredAt: null,
      updateCount: 0,
      resultCount: 0,
      totalRenderTime: 0,
      avgRenderTime: 0,
      peakRenderTime: 0
    })

    this.bus.emit({
      type: 'query:subscribe',
      queryId: id,
      schemaId: meta.schemaId,
      mode: meta.mode === 'document' ? 'single' : meta.mode,
      filter: meta.filter
    })
  }

  recordUpdate(id: string, resultCount: number, renderTime: number): void {
    const query = this.queries.get(id)
    if (!query) return

    query.updateCount++
    query.resultCount = resultCount
    query.lastUpdateAt = Date.now()
    query.totalRenderTime += renderTime
    query.avgRenderTime = query.totalRenderTime / query.updateCount
    query.peakRenderTime = Math.max(query.peakRenderTime, renderTime)

    this.bus.emit({
      type: 'query:result',
      queryId: id,
      resultCount,
      duration: renderTime
    })
  }

  recordError(id: string, error: string): void {
    this.bus.emit({ type: 'query:error', queryId: id, error })
  }

  unregister(id: string): void {
    const query = this.queries.get(id)
    if (query) {
      query.unregisteredAt = Date.now()
      this.bus.emit({ type: 'query:unsubscribe', queryId: id })
    }
  }

  getActive(): TrackedQuery[] {
    return Array.from(this.queries.values()).filter((q) => !q.unregisteredAt)
  }

  getAll(): TrackedQuery[] {
    return Array.from(this.queries.values())
  }

  getById(id: string): TrackedQuery | undefined {
    return this.queries.get(id)
  }

  /** Remove stale unregistered queries older than maxAge ms */
  prune(maxAge: number = 60_000): void {
    const cutoff = Date.now() - maxAge
    for (const [id, query] of this.queries) {
      if (query.unregisteredAt && query.unregisteredAt < cutoff) {
        this.queries.delete(id)
      }
    }
  }
}
