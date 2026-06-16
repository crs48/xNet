/**
 * Metric correlations (exploration 0190) — the @xnetjs/experiments stats
 * toolkit (pearson) had no in-experiment surface. For the experiment's primary
 * metric this lists the other metrics whose daily values move with it, ranked
 * by |r|. A correlation is not causation — labelled accordingly.
 */
import { ObservationSchema } from '@xnetjs/data'
import { pearson } from '@xnetjs/experiments'
import { useQuery } from '@xnetjs/react'
import { useMemo, type JSX } from 'react'
import { metricName, type MetricLike, type ObservationLike } from './habit-logic'

export function MetricCorrelations({
  primaryMetricId,
  metrics
}: {
  primaryMetricId: string
  metrics: MetricLike[]
}): JSX.Element | null {
  const { data } = useQuery(ObservationSchema, { orderBy: { day: 'desc' }, limit: 4000 })

  const correlations = useMemo(() => {
    const obs = (data ?? []) as unknown as ObservationLike[]
    const byMetric = new Map<string, Map<number, number>>()
    for (const o of obs) {
      const mid = typeof o.metric === 'string' ? o.metric : null
      const day = typeof o.day === 'number' ? o.day : null
      const val = typeof o.value === 'number' ? o.value : null
      if (!mid || day == null || val == null) continue
      let series = byMetric.get(mid)
      if (!series) {
        series = new Map()
        byMetric.set(mid, series)
      }
      series.set(day, val)
    }
    const primary = byMetric.get(primaryMetricId)
    if (!primary || primary.size < 3) return []

    const out: Array<{ id: string; name: string; r: number; n: number }> = []
    for (const m of metrics) {
      if (m.id === primaryMetricId) continue
      const other = byMetric.get(m.id)
      if (!other) continue
      const xs: number[] = []
      const ys: number[] = []
      for (const [day, v] of primary) {
        const w = other.get(day)
        if (w != null) {
          xs.push(v)
          ys.push(w)
        }
      }
      if (xs.length < 3) continue
      const r = pearson(xs, ys)
      if (!Number.isFinite(r)) continue
      out.push({ id: m.id, name: metricName(m), r, n: xs.length })
    }
    return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 6)
  }, [data, metrics, primaryMetricId])

  if (!primaryMetricId || correlations.length === 0) return null

  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-ink-3">
        Correlations <span className="normal-case text-ink-3">(not causation)</span>
      </div>
      <ul className="flex flex-col gap-1">
        {correlations.map((c) => {
          const pct = Math.round(Math.abs(c.r) * 100)
          const positive = c.r >= 0
          return (
            <li key={c.id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-ink-1">{c.name}</span>
              <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full ${positive ? 'bg-emerald-500' : 'bg-red-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-12 text-right tabular-nums text-ink-2">
                {positive ? '+' : ''}
                {c.r.toFixed(2)}
              </span>
              <span className="w-10 text-right text-[10px] text-ink-3">n={c.n}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
