/**
 * Pipeline analytics — the deal math behind the pipeline dashboard. Pure
 * functions over plain objects so they unit-test trivially and run anywhere
 * (web, CLI, server). The honesty rule from the experiment journal carries
 * over: when there is no data to compute a rate, return `null`, never a
 * misleading `0`.
 */

import { daysBetween } from './day'

/** A pipeline stage (only the fields the math needs). */
export interface StageLike {
  id?: string
  probability?: number | null
  isClosed?: boolean | null
  isWon?: boolean | null
}

/** A deal (only the fields the math needs). */
export interface DealLike {
  amount?: number | null
  probability?: number | null
  stage?: string | null
  createdAt?: number
  wonAt?: number | null
  lostAt?: number | null
}

/**
 * A deal with its economics resolved against its stage. A closed-won deal is
 * probability 1; a closed-lost deal is probability 0; an open deal uses its
 * own probability override, else the stage default, else 0.
 */
export interface ResolvedDeal {
  amount: number
  probability: number
  isClosed: boolean
  isWon: boolean
  createdAt?: number
  closedAt?: number | null
}

/** Resolve a deal against its stage (look the stage up by id, or pass it in). */
export function resolveDeal(deal: DealLike, stage?: StageLike | null): ResolvedDeal {
  const amount = deal.amount ?? 0
  const isClosed = stage?.isClosed ?? false
  const isWon = isClosed && (stage?.isWon ?? false)
  const probability = isClosed ? (isWon ? 1 : 0) : (deal.probability ?? stage?.probability ?? 0)
  return {
    amount,
    probability,
    isClosed,
    isWon,
    createdAt: deal.createdAt,
    closedAt: deal.wonAt ?? deal.lostAt ?? null
  }
}

/** Resolve a list of deals against a map of stages keyed by stage id. */
export function resolveDeals(deals: DealLike[], stagesById: Map<string, StageLike>): ResolvedDeal[] {
  return deals.map((d) => resolveDeal(d, d.stage != null ? stagesById.get(d.stage) : null))
}

const open = (deals: ResolvedDeal[]): ResolvedDeal[] => deals.filter((d) => !d.isClosed)
const closed = (deals: ResolvedDeal[]): ResolvedDeal[] => deals.filter((d) => d.isClosed)
const won = (deals: ResolvedDeal[]): ResolvedDeal[] => deals.filter((d) => d.isWon)

/** Raw value of all open deals (assumes every open deal closes). */
export function openPipelineValue(deals: ResolvedDeal[]): number {
  return open(deals).reduce((s, d) => s + d.amount, 0)
}

/** Probability-weighted value of open deals: Σ(amount × probability). */
export function weightedPipeline(deals: ResolvedDeal[]): number {
  return open(deals).reduce((s, d) => s + d.amount * d.probability, 0)
}

/** Total value of won deals. */
export function wonValue(deals: ResolvedDeal[]): number {
  return won(deals).reduce((s, d) => s + d.amount, 0)
}

/** Count of open deals. */
export function openCount(deals: ResolvedDeal[]): number {
  return open(deals).length
}

/** Win rate over *closed* deals: won / (won + lost). `null` when none closed. */
export function winRate(deals: ResolvedDeal[]): number | null {
  const c = closed(deals)
  if (c.length === 0) return null
  return won(c).length / c.length
}

/** Average value of a won deal. `null` when nothing has been won. */
export function averageDealSize(deals: ResolvedDeal[]): number | null {
  const w = won(deals)
  if (w.length === 0) return null
  return wonValue(deals) / w.length
}

/** Average sales-cycle length (created → won), in days. `null` when none won. */
export function averageSalesCycleDays(deals: ResolvedDeal[]): number | null {
  const cycles = won(deals)
    .filter((d) => d.createdAt != null && d.closedAt != null)
    .map((d) => daysBetween(d.createdAt as number, d.closedAt as number))
  if (cycles.length === 0) return null
  return cycles.reduce((s, n) => s + n, 0) / cycles.length
}

/**
 * Pipeline velocity — revenue generated per day at the current rate:
 *   (#open × winRate × avgDealSize) / avgCycleDays.
 * `null` when any input is unavailable (no closed deals, no won deals, etc.).
 */
export function pipelineVelocity(deals: ResolvedDeal[]): number | null {
  const wr = winRate(deals)
  const size = averageDealSize(deals)
  const cycle = averageSalesCycleDays(deals)
  if (wr === null || size === null || cycle === null || cycle === 0) return null
  return (openCount(deals) * wr * size) / cycle
}

export interface StageBreakdown {
  stageId: string
  count: number
  value: number
  weightedValue: number
}

/**
 * Per-stage count, raw value, and weighted value — the data behind a pipeline
 * board summary or a "value by stage" bar chart. Pass the original deals (with
 * `stage`) and their resolution map.
 */
export function dealsByStage(deals: DealLike[], stagesById: Map<string, StageLike>): StageBreakdown[] {
  const groups = new Map<string, StageBreakdown>()
  for (const deal of deals) {
    const stageId = deal.stage ?? 'unstaged'
    const resolved = resolveDeal(deal, deal.stage != null ? stagesById.get(deal.stage) : null)
    const g = groups.get(stageId) ?? { stageId, count: 0, value: 0, weightedValue: 0 }
    g.count += 1
    g.value += resolved.amount
    g.weightedValue += resolved.isClosed ? 0 : resolved.amount * resolved.probability
    groups.set(stageId, g)
  }
  return [...groups.values()]
}

/**
 * Consecutive funnel conversion ratios from an ordered list of "reached" counts:
 * `ratio[i] = reached[i+1] / reached[i]`. A ratio is `null` when the prior
 * stage had zero deals (undefined, not zero). Generic + pure so the caller
 * decides what "reached stage i" means.
 */
export function funnelConversion(reachedCounts: number[]): Array<number | null> {
  const ratios: Array<number | null> = []
  for (let i = 0; i < reachedCounts.length - 1; i++) {
    const prev = reachedCounts[i]
    ratios.push(prev === 0 ? null : reachedCounts[i + 1] / prev)
  }
  return ratios
}

/** Age in days of an open deal (created → now). `null` when no created time. */
export function dealAgeDays(deal: DealLike, now: number = Date.now()): number | null {
  if (deal.createdAt == null) return null
  return daysBetween(deal.createdAt, now)
}
