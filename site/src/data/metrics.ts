/**
 * xNet Cloud — public business metrics (the `/open` dashboard).
 *
 * Loads the committed snapshot in `metrics.json` (produced by the control plane's
 * privacy-safe rollup and committed via PR — the git history is the transparency
 * log) and derives the week-over-week + cumulative series the page charts. The
 * `CompanyMetrics` shape mirrors `apps/cloud/src/metrics/rollup.ts`; the JSON is
 * the contract between the two (the static site never imports the cloud package).
 *
 * See exploration 0200 and docs/explorations/0200_*RUN_IN_PUBLIC*.
 */

import raw from './metrics.json'

export interface CompanyMetricsWeek {
  week: string
  customers: number
  newCustomers: number
  churnedCustomers: number
  mrrUsd: number
  costs: { infraUsd: number; payrollUsd: number; saasUsd: number; otherUsd: number }
}

/**
 * Fleet-wide usage/scale totals (exploration 0207). Mirrors `UsageSnapshot` in
 * `apps/cloud/src/metrics/rollup.ts`; every field is a fleet aggregate, never
 * per-tenant, and the whole block is suppressed below `cohortFloor` upstream.
 */
interface UsageSnapshot {
  hubsHosted: number
  hubsHot: number
  documentsSynced: number
  aiTokensTotal: number
  aiRequestsTotal: number
  storageGb?: number
  peopleOnPlatform?: number
}

interface CompanyMetrics {
  updated: string
  cohortFloor: number
  /** True while these are illustrative figures, not the real P&L. */
  sample?: boolean
  weeks: CompanyMetricsWeek[]
  breakEven: { reached: boolean; targetWeek?: string }
  /** Live usage totals; absent until the fleet clears the cohort floor. */
  usage?: UsageSnapshot
}

export const metrics = raw as CompanyMetrics
export const weeks = metrics.weeks
export const latest = weeks[weeks.length - 1]
export const first = weeks[0]
export const usage = metrics.usage

/** Total monthly-ish cost for a week (all categories). */
export const weekCost = (w: CompanyMetricsWeek): number =>
  w.costs.infraUsd + w.costs.payrollUsd + w.costs.saasUsd + w.costs.otherUsd

/** Weekly revenue ≈ MRR / 4.345 (matches the rollup's break-even math). */
const weekRevenue = (w: CompanyMetricsWeek): number => w.mrrUsd / 4.345

/** Percent change between the two most recent weeks for a numeric selector. */
function wow(select: (w: CompanyMetricsWeek) => number): number {
  if (weeks.length < 2) return 0
  const prev = select(weeks[weeks.length - 2])
  const now = select(latest)
  if (prev === 0) return now > 0 ? 100 : 0
  return Math.round(((now - prev) / prev) * 1000) / 10
}

export const customerWoW = wow((w) => w.customers)
export const mrrWoW = wow((w) => w.mrrUsd)

/** Cumulative (revenue − cost) per week — the runway/break-even series. */
export const cumulativeNet: { week: string; net: number }[] = (() => {
  let acc = 0
  return weeks.map((w) => {
    acc += weekRevenue(w) - weekCost(w)
    return { week: w.week, net: Math.round(acc) }
  })
})()

/** Current cost breakdown (latest week) by category, for the stacked view. */
export const latestCostBreakdown: { label: string; usd: number; color: string }[] = [
  { label: 'Payroll', usd: latest.costs.payrollUsd, color: '#6366f1' },
  { label: 'Infrastructure', usd: latest.costs.infraUsd, color: '#10b981' },
  { label: 'Software', usd: latest.costs.saasUsd, color: '#f59e0b' },
  { label: 'Overhead', usd: latest.costs.otherUsd, color: '#9ca3af' }
]

export const updated = metrics.updated
