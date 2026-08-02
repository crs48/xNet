/**
 * xNet Cloud — Service Level Objectives + error-budget policy (exploration 0193).
 *
 * The SLA-level → objective mapping moved to `@xnetjs/entitlements` (exploration
 * 0425) so the *promise* and the *objective it is measured against* can be
 * asserted against each other in one place; it is re-exported here so every
 * existing call site keeps working.
 *
 * What stays here is the Google-SRE error-budget policy that gates fleet
 * upgrades: a healthy budget ships fast, a low budget slows down, an exhausted
 * budget freezes risky deploys (security/reliability fixes are always exempt —
 * enforced at the call site). That is an operational choice about how *we*
 * deploy, not part of the entitlement contract a self-hosted hub reads.
 */

export { sloForSla, sloForPlan, errorBudgetMs, type SloTarget } from '@xnetjs/entitlements'

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
