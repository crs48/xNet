/**
 * /analytics (exploration 0187) — the telemetry/logging/analytics dashboard.
 *
 * Opt-in (VITE_TELEMETRY_DASHBOARD=1) and admin-gated server-side, so it never
 * bloats the default app nor exposes aggregate usage to non-operators. Reads
 * pre-aggregated rollups from the hub and renders them with lightweight inline
 * bars (no charting dependency — keeps the route chunk small and lazy-loaded).
 */

import type { ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  useTelemetryAnalytics,
  type TelemetryBucketPoint,
  type TelemetryKindCount,
  type TelemetryNameCount
} from '../hooks/useTelemetryAnalytics'

export const Route = createFileRoute('/analytics')({
  component: AnalyticsPage
})

function AnalyticsPage() {
  const { enabled, ready, summary, loading, error, refresh } = useTelemetryAnalytics()

  if (!enabled) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Telemetry dashboard</h1>
        <p className="text-sm text-ink-3 mt-2 max-w-md">
          This surface is off by default. Set <code>VITE_TELEMETRY_DASHBOARD=1</code> to enable it.
          The hub still requires an admin capability to return any data.
        </p>
      </Centered>
    )
  }

  if (!ready) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Telemetry dashboard</h1>
        <p className="text-sm text-ink-3 mt-2">Connect to a hub to view analytics.</p>
      </Centered>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Telemetry</h1>
          <p className="text-xs text-ink-3">
            {summary
              ? `${summary.total.toLocaleString()} events · last 7 days`
              : 'Loading aggregate telemetry from the hub…'}
          </p>
        </div>
        <button
          onClick={refresh}
          className="text-xs px-2 py-1 rounded border border-hairline hover:bg-accent"
        >
          Refresh
        </button>
      </header>

      {error && (
        <div className="text-sm text-destructive border border-hairline rounded p-3">
          {error.includes('403') || /forbidden/i.test(error)
            ? 'This identity is not authorized to read hub telemetry (admin only).'
            : error}
        </div>
      )}

      {loading && !summary && <div className="text-sm text-ink-3">Loading…</div>}

      {summary && (
        <>
          <Card title="Events over time">
            <Sparkbars points={summary.timeseries} />
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card title="By kind">
              <KindBars kinds={summary.kinds} />
            </Card>
            <Card title="Top metrics">
              <NameBars names={summary.topNames} />
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="text-center">{children}</div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-hairline rounded-lg p-4">
      <h2 className="text-xs font-semibold uppercase text-ink-3 mb-3">{title}</h2>
      {children}
    </section>
  )
}

function Sparkbars({ points }: { points: TelemetryBucketPoint[] }) {
  if (points.length === 0) return <Empty />
  const max = Math.max(...points.map((p) => p.count), 1)
  return (
    <div className="flex items-end gap-0.5 h-24">
      {points.map((p) => (
        <div
          key={p.bucket}
          className="flex-1 bg-accent-ink/70 rounded-sm min-w-[2px]"
          style={{ height: `${Math.max(2, (p.count / max) * 100)}%` }}
          title={`${new Date(p.bucket).toLocaleString()}: ${p.count}`}
        />
      ))}
    </div>
  )
}

function KindBars({ kinds }: { kinds: TelemetryKindCount[] }) {
  if (kinds.length === 0) return <Empty />
  const max = Math.max(...kinds.map((k) => k.count), 1)
  return (
    <div className="space-y-1.5">
      {kinds.map((k) => (
        <BarRow key={k.kind} label={k.kind} count={k.count} pct={(k.count / max) * 100} />
      ))}
    </div>
  )
}

function NameBars({ names }: { names: TelemetryNameCount[] }) {
  if (names.length === 0) return <Empty />
  const max = Math.max(...names.map((n) => n.count), 1)
  return (
    <div className="space-y-1.5">
      {names.slice(0, 12).map((n) => (
        <BarRow
          key={`${n.kind}:${n.name}`}
          label={n.name}
          sublabel={n.kind}
          count={n.count}
          pct={(n.count / max) * 100}
        />
      ))}
    </div>
  )
}

function BarRow({
  label,
  sublabel,
  count,
  pct
}: {
  label: string
  sublabel?: string
  count: number
  pct: number
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-32 truncate" title={label}>
        {label}
        {sublabel && <span className="text-ink-3 ml-1">{sublabel}</span>}
      </span>
      <div className="flex-1 h-2 bg-background-emphasis rounded-full overflow-hidden">
        <div className="h-full bg-accent-ink/70 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-ink-2 tabular-nums">{count.toLocaleString()}</span>
    </div>
  )
}

function Empty() {
  return <div className="text-xs text-ink-3">No data in this window.</div>
}
