/**
 * QueryTracker - tracks active useQuery/useMutate/useNode hooks
 *
 * Hooks opt-in to reporting by checking for a QueryTracker in context.
 * If no XNetDevToolsProvider is present, the tracker is null and hooks skip reporting.
 */

import type { DevToolsEventBus } from '../core/event-bus'

/**
 * Capture the caller's source location from a stack trace.
 * Parses the Error.stack to find the first frame outside devtools/react internals.
 *
 * Returns a string like "MyComponent (MyComponent.tsx:42)" or the raw frame if unparseable.
 */
export function captureCallerInfo(): string | undefined {
  try {
    const stack = new Error().stack
    if (!stack) return undefined

    const lines = stack.split('\n')
    // Skip: Error, captureCallerInfo, register, the hook itself
    // Look for the first meaningful frame (typically the component)
    for (let i = 3; i < Math.min(lines.length, 10); i++) {
      const line = lines[i]?.trim()
      if (!line) continue
      // Skip react internals, devtools internals
      if (
        line.includes('node_modules/react') ||
        line.includes('@xnetjs/devtools') ||
        line.includes('@xnetjs/react/src/hooks') ||
        line.includes('renderWithHooks') ||
        line.includes('mountIndeterminateComponent')
      ) {
        continue
      }

      // Try to parse: "at ComponentName (file.tsx:line:col)"
      const atMatch = line.match(/at\s+(\S+)\s+\((.+?)(?::(\d+))?(?::(\d+))?\)/)
      if (atMatch) {
        const [, fnName, file, lineNum] = atMatch
        const fileName = file.split('/').pop() ?? file
        return lineNum ? `${fnName} (${fileName}:${lineNum})` : `${fnName} (${fileName})`
      }

      // Try: "at file.tsx:line:col"
      const fileMatch = line.match(/at\s+(.+?)(?::(\d+))?(?::(\d+))?$/)
      if (fileMatch) {
        const [, file, lineNum] = fileMatch
        const fileName = file.split('/').pop() ?? file
        return lineNum ? `${fileName}:${lineNum}` : fileName
      }

      // Fallback: return cleaned line
      return line.replace(/^\s*at\s*/, '').slice(0, 80)
    }
  } catch {
    // Stack parsing failed
  }
  return undefined
}

export interface TrackedQuery {
  id: string
  type: 'useQuery' | 'useMutate' | 'useNode'
  schemaId: string
  mode: 'list' | 'single' | 'filtered' | 'document'
  filter?: Record<string, unknown>
  descriptorKey?: string
  nodeId?: string
  /** Source location where the hook was called (component name + file:line) */
  callerInfo?: string

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
      descriptorKey?: string
      nodeId?: string
      callerInfo?: string
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
      filter: meta.filter,
      descriptorKey: meta.descriptorKey,
      callerInfo: meta.callerInfo
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
