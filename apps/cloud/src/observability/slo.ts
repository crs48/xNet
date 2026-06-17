/**
 * xNet Cloud — Service Level Objectives + error-budget policy (exploration 0193).
 *
 * Ties the plan catalog's declared `SlaLevel` to a concrete, measurable SLO and
 * the Google-SRE error-budget policy that gates fleet upgrades: a healthy budget
 * ships fast, a low budget slows down, an exhausted budget freezes risky deploys
 * (security/reliability fixes are always exempt — enforced at the call site).
 */

import { PLAN_CATALOG, type PlanId, type SlaLevel } from '@xnetjs/entitlements'

export interface SloTarget {
  /** Availability objective as a fraction (e.g. 0.999). `null` = no published SLO. */
  objective: number | null
  /** Rolling window the objective is measured over. */
  windowDays: number
  /** Human label for dashboards/status. */
  label: string
}

/** Map a plan's declared SLA level to a measurable SLO. */
export function sloForSla(sla: SlaLevel): SloTarget {
  switch (sla) {
    case '99.9':
      return { objective: 0.999, windowDays: 30, label: '99.9% uptime' }
    case 'custom':
      return { objective: 0.9995, windowDays: 30, label: '99.95% uptime (enterprise)' }
    case 'best-effort':
      return { objective: null, windowDays: 30, label: 'best-effort' }
    case 'none':
    default:
      return { objective: null, windowDays: 30, label: 'no SLA' }
  }
}

/** The SLO for a plan tier. */
export function sloForPlan(plan: PlanId): SloTarget {
  return sloForSla(PLAN_CATALOG[plan].sla)
}

/** Allowed downtime over the window, in ms (the error budget as time). ∞ if no SLO. */
export function errorBudgetMs(slo: SloTarget): number {
  if (slo.objective === null) return Number.POSITIVE_INFINITY
  return (1 - slo.objective) * slo.windowDays * 24 * 60 * 60 * 1000
}

/**
 * Error-budget policy state from the remaining fraction (0..1):
 *   - `freeze`  — budget exhausted: freeze non-reliability deploys
 *   - `caution` — budget low (<25%): slow down, extra review
 *   - `ship`    — budget healthy: ship normally
 */
export type BudgetPolicy = 'ship' | 'caution' | 'freeze'

export function budgetPolicy(remaining: number): BudgetPolicy {
  if (remaining <= 0) return 'freeze'
  if (remaining < 0.25) return 'caution'
  return 'ship'
}
