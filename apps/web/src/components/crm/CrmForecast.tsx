/**
 * Forecast surface (exploration 0190) — surfaces `@xnetjs/crm`'s 4-lane
 * forecast rollup (Pipeline → Best Case → Commit → Closed), which was fully
 * computed but had no UI. Reps move open deals between the commit/best-case/
 * pipeline lanes; the lane totals recompute live.
 */
import { forecastRollup, type ForecastDealLike } from '@xnetjs/crm'
import { DealSchema, StageSchema, type ForecastCategory } from '@xnetjs/data'
import { useMutate, useQuery } from '@xnetjs/react'
import { useMemo, type JSX } from 'react'
import { money, num, str } from './crm-helpers'

interface StageNode {
  id: string
  pipeline?: unknown
  isClosed?: unknown
  isWon?: unknown
}
interface DealNode {
  id: string
  title?: unknown
  pipeline?: unknown
  stage?: unknown
  amount?: unknown
  forecastCategory?: unknown
}

/** Lanes a rep can move an open deal into (Closed is derived from the stage). */
const LANE_OPTIONS: Array<{ id: ForecastCategory; label: string }> = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'best-case', label: 'Best Case' },
  { id: 'commit', label: 'Commit' }
]

export function CrmForecast({ pipelineId }: { pipelineId: string }): JSX.Element {
  const { data: dealData } = useQuery(DealSchema, { orderBy: { createdAt: 'desc' } })
  const { data: stageData } = useQuery(StageSchema, { orderBy: { sortKey: 'asc' } })
  const { update } = useMutate()

  const stagesById = useMemo(() => {
    const m = new Map<string, { isClosed: boolean; isWon: boolean }>()
    for (const s of (stageData ?? []) as StageNode[]) {
      if (str(s.pipeline) !== pipelineId) continue
      m.set(s.id, { isClosed: Boolean(s.isClosed), isWon: Boolean(s.isWon) })
    }
    return m
  }, [stageData, pipelineId])

  const deals = useMemo(
    () => ((dealData ?? []) as DealNode[]).filter((d) => str(d.pipeline) === pipelineId),
    [dealData, pipelineId]
  )

  const rollup = useMemo(() => {
    const likes: ForecastDealLike[] = deals.map((d) => {
      const st = stagesById.get(str(d.stage))
      return {
        amount: num(d.amount) ?? 0,
        forecastCategory: str(d.forecastCategory) || 'pipeline',
        isClosed: st?.isClosed ?? false,
        isWon: st?.isWon ?? false
      }
    })
    return forecastRollup(likes)
  }, [deals, stagesById])

  const openDeals = deals.filter((d) => !stagesById.get(str(d.stage))?.isClosed)

  const lanes = [
    { label: 'Pipeline', value: rollup.pipeline, hint: 'All open deals' },
    { label: 'Best Case', value: rollup.bestCase, hint: 'Commit + best case + won' },
    { label: 'Commit', value: rollup.commit, hint: 'Commit + won' },
    { label: 'Closed', value: rollup.closed, hint: 'Closed-won' }
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-4 gap-2 border-b border-hairline px-4 py-3">
        {lanes.map((lane) => (
          <div
            key={lane.label}
            className="rounded-md border border-hairline bg-surface-1 px-3 py-2"
          >
            <div className="text-[10px] uppercase tracking-wider text-ink-3">{lane.label}</div>
            <div className="text-lg font-semibold text-ink-1">{money(lane.value)}</div>
            <div className="text-[10px] text-ink-3">{lane.hint}</div>
          </div>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-2 text-[10px] uppercase tracking-wide text-ink-3">
          Open deals — set the forecast lane
        </div>
        {openDeals.length === 0 ? (
          <p className="text-xs text-ink-3">No open deals to forecast.</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {openDeals.map((d) => (
                <tr key={d.id} className="border-t border-hairline">
                  <td className="py-1.5 text-ink-1">{str(d.title) || 'Untitled deal'}</td>
                  <td className="py-1.5 text-right tabular-nums text-ink-2">
                    {money(num(d.amount) ?? 0)}
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    <select
                      aria-label={`Forecast lane for ${str(d.title) || 'deal'}`}
                      value={str(d.forecastCategory) || 'pipeline'}
                      onChange={(e) =>
                        void update(DealSchema, d.id, {
                          forecastCategory: e.target.value as ForecastCategory
                        })
                      }
                      className="rounded-sm border border-hairline bg-surface-1 px-1.5 py-0.5 text-[11px] text-ink-2"
                    >
                      {LANE_OPTIONS.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
