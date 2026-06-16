/**
 * useTracesPanel — rebuilds the recent-trace list from the event bus and
 * subscribes to live `tracing:trace` events (exploration 0190).
 */

import type { DevToolsEvent, DevToolsTrace, TracingTraceEvent } from '../../core/types'
import { useEffect, useState } from 'react'
import { useDevTools } from '../../provider/useDevTools'

const MAX_TRACES = 100

function isTraceEvent(e: DevToolsEvent): e is TracingTraceEvent {
  return e.type === 'tracing:trace'
}

export interface TracesPanelState {
  traces: DevToolsTrace[]
}

export function useTracesPanel(): TracesPanelState {
  const { eventBus } = useDevTools()
  const [traces, setTraces] = useState<DevToolsTrace[]>(() =>
    eventBus
      .getEvents()
      .filter(isTraceEvent)
      .map((e) => e.trace)
      .slice(-MAX_TRACES)
      .reverse()
  )

  useEffect(() => {
    const unsub = eventBus.subscribe((event: DevToolsEvent) => {
      if (!isTraceEvent(event)) return
      setTraces((prev) => [event.trace, ...prev].slice(0, MAX_TRACES))
    })
    return unsub
  }, [eventBus])

  return { traces }
}
