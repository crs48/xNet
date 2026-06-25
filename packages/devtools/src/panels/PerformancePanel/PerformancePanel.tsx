/**
 * Performance panel — unifies the perf signals that were scattered across the
 * boot timeline, traces, queries, and storage views into one place: cold-start
 * boot waterfall, live frame budget + JS heap, storage stats, active queries,
 * and the recent slow traces.
 */

import { useEffect, useState } from 'react'
import { formatBytes, formatDuration } from '../../utils/formatters'
import { useTracesPanel } from '../TracesPanel/useTracesPanel'
import { Waterfall } from '../TracesPanel/Waterfall'
import {
  computeBootSegments,
  firstPaintMs,
  readBootMarks,
  type BootMarks,
  type BootSegment
} from './boot-timeline'
import { FlameGraph } from './FlameGraph'
import { FrameHeatmap } from './FrameHeatmap'
import { LatencyHeatmap } from './LatencyHeatmap'
import {
  useActiveQueries,
  useFrameRate,
  useFrameRing,
  useHeap,
  useStorageStats,
  type ActiveQuery
} from './usePerformancePanel'

export function PerformancePanel() {
  return (
    <div className="flex flex-col h-full overflow-y-auto divide-y divide-hairline">
      <BootTimelineSection />
      <LiveMetricsSection />
      <FrameTimelineSection />
      <StorageSection />
      <ActiveQueriesSection />
      <TimeBreakdownSection />
      <LatencyDistributionSection />
      <RecentTracesSection />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-3 py-2">
      <h3 className="text-[10px] font-bold text-ink-2 uppercase tracking-wide mb-1.5">{title}</h3>
      {children}
    </section>
  )
}

function BootTimelineSection() {
  const [marks, setMarks] = useState<BootMarks>(() => readBootMarks())
  // Marks land progressively during a cold start; re-read a few times.
  useEffect(() => {
    let ticks = 0
    const id = setInterval(() => {
      setMarks(readBootMarks())
      if (++ticks >= 10) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const segments = computeBootSegments(marks)
  const paint = firstPaintMs(marks)
  const max = Math.max(1, ...segments.map((s) => s.ms))

  return (
    <Section title="Boot timeline">
      {segments.length === 0 ? (
        <p className="text-[10px] text-ink-3">
          No boot marks recorded (reload the app to capture a cold start).
        </p>
      ) : (
        <div className="space-y-1">
          {segments.map((seg) => (
            <BootBar key={seg.from} segment={seg} max={max} />
          ))}
          {paint != null && (
            <div className="flex items-center gap-2 pt-1 mt-1 border-t border-hairline">
              <span className="text-[10px] text-ink-2 w-20">First paint</span>
              <span className="text-[10px] text-ink-1 font-medium">{formatDuration(paint)}</span>
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

function BootBar({ segment, max }: { segment: BootSegment; max: number }) {
  const pct = Math.round((segment.ms / max) * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-ink-3 w-20 shrink-0">{segment.label}</span>
      <div className="flex-1 h-3 bg-surface-2 rounded overflow-hidden">
        <div
          className="h-full bg-accent-ink/70"
          style={{ width: `${Math.max(pct, 2)}%` }}
          aria-hidden
        />
      </div>
      <span className="text-[10px] text-ink-2 w-14 text-right tabular-nums">
        {formatDuration(segment.ms)}
      </span>
    </div>
  )
}

function LiveMetricsSection() {
  const { fps, frameMs } = useFrameRate()
  const heap = useHeap()
  const fpsColor = fps >= 50 ? 'text-success' : fps >= 30 ? 'text-warning' : 'text-destructive'
  return (
    <Section title="Live metrics">
      <div className="flex items-center gap-4 flex-wrap">
        <Metric label="FPS" value={String(fps)} className={fpsColor} />
        <Metric label="Frame" value={`${frameMs}ms`} />
        {heap ? (
          <>
            <Metric label="JS heap" value={formatBytes(heap.usedBytes)} />
            <Metric label="Heap limit" value={formatBytes(heap.limitBytes)} />
          </>
        ) : (
          <span className="text-[10px] text-ink-3">JS heap unavailable (Chromium only)</span>
        )}
      </div>
    </Section>
  )
}

function FrameTimelineSection() {
  const samples = useFrameRing()
  return (
    <Section title="Frame timeline">
      {samples.length === 0 ? (
        <p className="text-[10px] text-ink-3">
          Sampling frames… interact with the app to surface jank.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <FrameHeatmap samples={samples} />
        </div>
      )}
    </Section>
  )
}

function TimeBreakdownSection() {
  const { traces } = useTracesPanel()
  return (
    <Section title="Where time goes">
      {traces.length === 0 ? (
        <p className="text-[10px] text-ink-3">
          No traces captured. Enable the Trace channel in Logs, then run a query.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <FlameGraph traces={traces} />
        </div>
      )}
    </Section>
  )
}

function LatencyDistributionSection() {
  const { traces } = useTracesPanel()
  return (
    <Section title="Latency distribution">
      {traces.length === 0 ? (
        <p className="text-[10px] text-ink-3">
          No traces captured yet. Latency clusters and outliers appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <LatencyHeatmap traces={traces} />
        </div>
      )}
    </Section>
  )
}

function Metric({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-ink-3 uppercase tracking-wide">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${className ?? 'text-ink-1'}`}>
        {value}
      </span>
    </div>
  )
}

function StorageSection() {
  const { nodeCount, lamport, storageDurability } = useStorageStats()
  return (
    <Section title="Storage">
      <div className="flex items-center gap-4 flex-wrap">
        <Metric label="Nodes" value={nodeCount != null ? String(nodeCount) : '—'} />
        <Metric label="Last lamport" value={lamport != null ? String(lamport) : '—'} />
        {storageDurability?.usageBytes != null && (
          <Metric label="OPFS used" value={formatBytes(storageDurability.usageBytes)} />
        )}
        {storageDurability?.quotaBytes != null && (
          <Metric label="Quota" value={formatBytes(storageDurability.quotaBytes)} />
        )}
        {storageDurability && <Metric label="Durable" value={storageDurability.state} />}
      </div>
    </Section>
  )
}

function ActiveQueriesSection() {
  const queries = useActiveQueries()
  return (
    <Section title={`Active queries (${queries.length})`}>
      {queries.length === 0 ? (
        <p className="text-[10px] text-ink-3">No active query/mutation hooks.</p>
      ) : (
        <div className="space-y-0.5">
          {queries.slice(0, 30).map((q) => (
            <ActiveQueryRow key={q.id} query={q} />
          ))}
        </div>
      )}
    </Section>
  )
}

function ActiveQueryRow({ query }: { query: ActiveQuery }) {
  const label = query.source || query.schemaId.split('/').pop() || query.schemaId
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="text-ink-2 truncate flex-1" title={query.schemaId}>
        {label}
      </span>
      <span className="text-ink-3 w-14">{query.type}</span>
      {query.plan?.strategy && (
        <span className="text-ink-3 w-24 truncate">{query.plan.strategy}</span>
      )}
      <span className="text-ink-3 w-16 text-right tabular-nums">{query.updateCount} upd</span>
    </div>
  )
}

function RecentTracesSection() {
  const { traces } = useTracesPanel()
  const [expanded, setExpanded] = useState<string | null>(null)
  const slow = traces.filter((t) => t.totalMs >= 50).slice(0, 8)
  return (
    <Section title="Recent traces">
      {slow.length === 0 ? (
        <p className="text-[10px] text-ink-3">
          No traces captured. Enable the Trace channel in Logs, then run a query.
        </p>
      ) : (
        <ul className="space-y-1">
          {slow.map((trace) => (
            <li key={trace.traceId}>
              <button
                type="button"
                onClick={() => setExpanded((id) => (id === trace.traceId ? null : trace.traceId))}
                className="flex items-center gap-2 w-full text-left text-[10px]"
              >
                <span className="font-mono text-ink-2 truncate flex-1">{trace.rootName}</span>
                <span className={trace.totalMs >= 200 ? 'text-warning' : 'text-ink-3'}>
                  {trace.totalMs.toFixed(1)}ms
                </span>
              </button>
              {expanded === trace.traceId && (
                <div className="mt-1 overflow-x-auto">
                  <Waterfall trace={trace} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
