/**
 * Tracing instrumentation — forwards completed traces from a TraceCollector to
 * the DevTools event bus as `tracing:trace` events (exploration 0190).
 *
 * The collector keeps exact-timing traces locally; this bridges them into the
 * devtools so the TracesPanel can render waterfalls. Duck-typed to avoid a hard
 * dependency on @xnetjs/telemetry.
 */

import type { DevToolsEventBus } from '../core/event-bus'
import type { DevToolsTrace } from '../core/types'

/** Minimal TraceCollector surface (duck of @xnetjs/telemetry's TraceCollector). */
export interface TraceCollectorLike {
  /** Fires with the full ring buffer whenever a trace completes. */
  subscribe(listener: (traces: readonly DevToolsTrace[]) => void): () => void
}

/**
 * Forward newly-completed traces to the bus. Tracks already-emitted ids so a
 * ring change only emits traces the bus has not seen yet.
 *
 * @returns cleanup that unsubscribes from the collector.
 */
export function instrumentTracing(
  collector: TraceCollectorLike,
  bus: DevToolsEventBus
): () => void {
  const seen = new Set<string>()
  return collector.subscribe((traces) => {
    for (const trace of traces) {
      if (seen.has(trace.traceId)) continue
      seen.add(trace.traceId)
      bus.emit({ type: 'tracing:trace', trace })
    }
    // Keep `seen` from growing unbounded: prune ids no longer in the ring.
    if (seen.size > traces.length * 2 + 64) {
      const live = new Set(traces.map((t) => t.traceId))
      for (const id of seen) if (!live.has(id)) seen.delete(id)
    }
  })
}
