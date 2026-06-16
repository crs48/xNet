/**
 * Pipeline surface (exploration 0187) — a Kanban board grouped by stage with a
 * live metrics header. The economics (weighted value, win rate, …) are computed
 * by `@xnetjs/crm`, so the UI is a thin projection of pure logic.
 */
import {
  dealsByStage,
  openCount,
  openPipelineValue,
  resolveDeals,
  weightedPipeline,
  winRate,
  wonValue,
  type DealLike,
  type StageLike
} from '@xnetjs/crm'
import { DealSchema, StageSchema } from '@xnetjs/data'
import { useIdentity, useMutate, useQuery } from '@xnetjs/react'
import { Plus } from 'lucide-react'
import { useMemo, type JSX } from 'react'
import { money, num, str } from './crm-helpers'

interface StageNode {
  id: string
  name?: unknown
  pipeline?: unknown
  sortKey?: unknown
  probability?: unknown
  isClosed?: unknown
  isWon?: unknown
}

interface DealNode {
  id: string
  title?: unknown
  pipeline?: unknown
  stage?: unknown
  amount?: unknown
  probability?: unknown
  currency?: unknown
  createdAt?: unknown
  wonAt?: unknown
  lostAt?: unknown
}

export function CrmPipeline({ pipelineId }: { pipelineId: string }): JSX.Element {
  const { data: stageData } = useQuery(StageSchema, { orderBy: { sortKey: 'asc' } })
  const { data: dealData } = useQuery(DealSchema, { orderBy: { createdAt: 'desc' } })
  const { create, update } = useMutate()
  const { identity } = useIdentity()

  const stages = useMemo(
    () => ((stageData ?? []) as StageNode[]).filter((s) => str(s.pipeline) === pipelineId),
    [stageData, pipelineId]
  )
  const deals = useMemo(
    () => ((dealData ?? []) as DealNode[]).filter((d) => str(d.pipeline) === pipelineId),
    [dealData, pipelineId]
  )

  const stagesById = useMemo(() => {
    const m = new Map<string, StageLike>()
    for (const s of stages) {
      m.set(s.id, {
        id: s.id,
        probability: num(s.probability) ?? null,
        isClosed: Boolean(s.isClosed),
        isWon: Boolean(s.isWon)
      })
    }
    return m
  }, [stages])

  const dealLikes: DealLike[] = useMemo(
    () =>
      deals.map((d) => ({
        amount: num(d.amount) ?? 0,
        probability: num(d.probability),
        stage: str(d.stage) || null,
        createdAt: num(d.createdAt),
        wonAt: num(d.wonAt) ?? null,
        lostAt: num(d.lostAt) ?? null
      })),
    [deals]
  )

  const resolved = useMemo(() => resolveDeals(dealLikes, stagesById), [dealLikes, stagesById])
  const breakdown = useMemo(() => dealsByStage(dealLikes, stagesById), [dealLikes, stagesById])
  const byStageId = new Map(breakdown.map((b) => [b.stageId, b]))
  const wr = winRate(resolved)

  const newDeal = async (stageId: string) => {
    await create(DealSchema, {
      title: 'New deal',
      pipeline: pipelineId,
      stage: stageId,
      amount: 0,
      owner: identity?.did
    })
  }

  const moveDeal = (dealId: string, stageId: string) => {
    const stage = stagesById.get(stageId)
    const patch: Record<string, unknown> = { stage: stageId }
    if (stage?.isClosed && stage.isWon) patch.wonAt = Date.now()
    if (stage?.isClosed && !stage.isWon) patch.lostAt = Date.now()
    void update(DealSchema, dealId, patch as never)
  }

  if (stages.length === 0) {
    return <p className="p-6 text-xs text-ink-3">Setting up your pipeline…</p>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap gap-4 border-b border-hairline px-4 py-3">
        <Metric label="Weighted pipeline" value={money(weightedPipeline(resolved))} />
        <Metric label="Open pipeline" value={money(openPipelineValue(resolved))} />
        <Metric label="Open deals" value={String(openCount(resolved))} />
        <Metric label="Win rate" value={wr == null ? '—' : `${Math.round(wr * 100)}%`} />
        <Metric label="Won" value={money(wonValue(resolved))} />
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
        {stages.map((stage) => {
          const stageDeals = deals.filter((d) => str(d.stage) === stage.id)
          const agg = byStageId.get(stage.id)
          return (
            <div key={stage.id} className="flex w-60 shrink-0 flex-col rounded-md bg-surface-1">
              <div className="flex items-center justify-between px-2.5 py-2">
                <span className="text-xs font-medium text-ink-1">{str(stage.name)}</span>
                <span className="text-[10px] text-ink-3">
                  {agg?.count ?? 0} · {money(agg?.value)}
                </span>
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1.5 pb-2">
                {stageDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-sm border border-hairline bg-surface-0 p-2 text-xs"
                  >
                    <input
                      defaultValue={str(deal.title)}
                      onBlur={(e) => void update(DealSchema, deal.id, { title: e.target.value })}
                      className="w-full border-none bg-transparent font-medium text-ink-1 outline-none"
                    />
                    <input
                      defaultValue={num(deal.amount) != null ? String(num(deal.amount)) : ''}
                      onBlur={(e) => {
                        const n = Number(e.target.value)
                        void update(DealSchema, deal.id, {
                          amount: Number.isFinite(n) ? Math.max(0, n) : 0
                        })
                      }}
                      className="mt-1 w-full border-none bg-transparent text-[11px] text-ink-2 outline-none"
                      placeholder="Amount"
                    />
                    <select
                      value={stage.id}
                      onChange={(e) => moveDeal(deal.id, e.target.value)}
                      className="mt-1 w-full rounded-sm border border-hairline bg-surface-1 px-1 py-0.5 text-[10px] text-ink-2"
                    >
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {str(s.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => void newDeal(stage.id)}
                  className="flex w-full items-center gap-1 rounded-sm px-1.5 py-1 text-[11px] text-ink-3 hover:bg-accent hover:text-ink-1"
                >
                  <Plus size={12} strokeWidth={1.5} /> New deal
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
      <div className="text-lg font-semibold text-ink-1">{value}</div>
    </div>
  )
}
