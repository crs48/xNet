/**
 * @xnetjs/entitlements — the SLA level → measurable objective mapping.
 *
 * This lives beside the plan catalog rather than in `apps/cloud` (exploration
 * 0418) for one reason: the *promise* and the *objective it is measured
 * against* must be checkable in the same place. When they lived apart, the
 * pricing page advertised "99.9% best-effort availability" on a tier whose
 * `SlaLevel` resolves to no objective at all — a claim the code declined to
 * hold. `durability.ts` asserts against these functions to make that class of
 * drift a build failure.
 *
 * The error-budget *policy* (ship / caution / freeze) stays in the control
 * plane: it governs how we deploy, which is an operational choice, not part of
 * the entitlement contract a self-hosted hub reads.
 */

import { PLAN_CATALOG, type PlanId, type SlaLevel } from './plans'

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
    case '99.5':
      return { objective: 0.995, windowDays: 30, label: '99.5% uptime' }
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
