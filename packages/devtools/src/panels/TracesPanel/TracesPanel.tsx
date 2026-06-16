/**
 * TracesPanel — live per-operation trace waterfalls (exploration 0190).
 *
 * Lists recent query/mutate traces newest-first; clicking one expands its
 * stage waterfall. Fed by `tracing:trace` events on the devtools bus (emitted
 * by the app's TraceCollector onComplete / instrumentTracing).
 */

import type { DevToolsTrace } from '../../core/types'
import { useState } from 'react'
import { useTracesPanel } from './useTracesPanel'
import { Waterfall } from './Waterfall'

export function TracesPanel() {
  const { traces } = useTracesPanel()
  const [expanded, setExpanded] = useState<string | null>(null)

  if (traces.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-ink-3 text-sm gap-1">
        <p>No traces captured yet.</p>
        <p className="text-xs">
          Run a query or mutation with tracing enabled (config.tracing) to see waterfalls.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <ul className="divide-y divide-hairline">
        {traces.map((trace) => (
          <TraceRow
            key={trace.traceId}
            trace={trace}
            expanded={expanded === trace.traceId}
            onToggle={() => setExpanded((id) => (id === trace.traceId ? null : trace.traceId))}
          />
        ))}
      </ul>
    </div>
  )
}

function TraceRow({
  trace,
  expanded,
  onToggle
}: {
  trace: DevToolsTrace
  expanded: boolean
  onToggle: () => void
}) {
  const slow = trace.totalMs >= 200
  return (
    <li className="px-3 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 w-full text-left text-xs"
      >
        <span className="font-mono text-ink-2 truncate flex-1">{trace.rootName}</span>
        <span className={slow ? 'text-orange-500 font-medium' : 'text-ink-3'}>
          {trace.totalMs.toFixed(1)}ms
        </span>
        <span className="text-ink-3">{trace.spans.length} spans</span>
      </button>
      {expanded && (
        <div className="mt-1 overflow-x-auto">
          <Waterfall trace={trace} />
        </div>
      )}
    </li>
  )
}
