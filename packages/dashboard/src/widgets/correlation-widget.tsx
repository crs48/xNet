/**
 * Correlation insights widget (exploration 0180) — Exist.io-style. Finds
 * metric pairs that move together over shared days (Pearson, or point-biserial
 * when one side is boolean) and lists the strongest. Always captioned
 * "correlation, not causation" — these are leads to investigate with a real
 * experiment, not conclusions.
 */
import type { WidgetDefinition, WidgetProps } from '../types'
import { MetricSchema } from '@xnetjs/data'
import { canonicalDay, pearson } from '@xnetjs/experiments'
import { useQuery } from '@xnetjs/react'
import { nodeQuery, stubDescriptor } from './shared'

const OBSERVATION_SCHEMA_IRI = 'xnet://xnet.fyi/Observation@1.0.0'
const MIN_SHARED_DAYS = 5
const THRESHOLD = 0.3

export interface CorrelationWidgetConfig extends Record<string, unknown> {
  threshold?: number
}

interface MetricRow {
  id: string
  name?: unknown
  kind?: unknown
}

interface Pair {
  a: string
  b: string
  r: number
  n: number
}

function metricLabel(metrics: MetricRow[], id: string): string {
  const m = metrics.find((x) => x.id === id)
  return m && typeof m.name === 'string' && m.name ? m.name : 'Untitled'
}

function CorrelationWidget({ config, data }: WidgetProps<CorrelationWidgetConfig>): JSX.Element {
  const threshold = typeof config.threshold === 'number' ? config.threshold : THRESHOLD
  const { data: metricNodes } = useQuery(MetricSchema)
  const metrics = (metricNodes ?? []) as unknown as MetricRow[]

  // metric id → (day → value)
  const series = new Map<string, Map<number, number>>()
  for (const row of data.rows) {
    const metricId = typeof row.metric === 'string' ? row.metric : null
    const day = typeof row.day === 'number' ? canonicalDay(row.day) : null
    const value = typeof row.value === 'number' ? row.value : null
    if (!metricId || day === null || value === null) continue
    if (!series.has(metricId)) series.set(metricId, new Map())
    series.get(metricId)!.set(day, value)
  }

  const ids = [...series.keys()]
  const pairs: Pair[] = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const sa = series.get(ids[i])!
      const sb = series.get(ids[j])!
      const xs: number[] = []
      const ys: number[] = []
      for (const [day, va] of sa) {
        const vb = sb.get(day)
        if (vb !== undefined) {
          xs.push(va)
          ys.push(vb)
        }
      }
      if (xs.length < MIN_SHARED_DAYS) continue
      const r = pearson(xs, ys)
      if (Math.abs(r) >= threshold) pairs.push({ a: ids[i], b: ids[j], r, n: xs.length })
    }
  }
  pairs.sort((p, q) => Math.abs(q.r) - Math.abs(p.r))

  if (data.loading) {
    return <div className="p-3 text-xs text-muted-foreground">Loading…</div>
  }

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mb-1 text-xs font-medium text-foreground">Correlations</div>
      {pairs.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No strong correlations yet — keep logging across a few metrics.
        </p>
      ) : (
        <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-1.5 overflow-y-auto p-0">
          {pairs.slice(0, 8).map((pair) => (
            <li key={`${pair.a}:${pair.b}`} className="flex items-center gap-2 text-xs">
              <span
                className={`shrink-0 tabular-nums ${pair.r > 0 ? 'text-green-600' : 'text-red-500'}`}
              >
                {pair.r > 0 ? '+' : ''}
                {pair.r.toFixed(2)}
              </span>
              <span className="truncate text-foreground">
                {metricLabel(metrics, pair.a)} ↔ {metricLabel(metrics, pair.b)}
              </span>
              <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">n={pair.n}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 shrink-0 text-[10px] italic text-muted-foreground">
        Correlation, not causation — a lead to test, not a conclusion.
      </p>
    </div>
  )
}

export const correlationWidget: WidgetDefinition<CorrelationWidgetConfig> = {
  type: 'experiments.correlations',
  name: 'Correlations',
  icon: 'git-compare',
  description: 'Metrics that move together (correlation, not causation)',
  trustTier: 'first-party',
  defaultSize: { w: 4, h: 3, minW: 3, minH: 2 },
  configFields: [{ key: 'threshold', label: 'Min |r|', type: 'number', defaultValue: 0.3 }],
  getStubConfig: () => ({
    config: { threshold: 0.3 },
    query: {
      descriptor: stubDescriptor(
        'Correlations',
        nodeQuery(OBSERVATION_SCHEMA_IRI, { first: 5000 })
      ),
      refresh: 'live'
    }
  }),
  component: CorrelationWidget
}
