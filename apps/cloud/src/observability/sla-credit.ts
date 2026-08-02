/**
 * xNet Cloud — SLA service credits (exploration 0436 G12).
 *
 * The measurement stack was complete and the remedy was missing: `sloForSla`,
 * `errorBudgetMs`, `errorBudgetRemaining` and `fleetSummary` all computed a
 * published 99.9%, and nothing anywhere turned a missed month into money. A
 * published availability figure with no remedy is a marketing claim, not an SLA
 * — which matters because `community` and `company` both carry one and
 * `enterprise` promises a custom SLA to buyers whose procurement will ask what
 * happens when it is missed.
 *
 * This is the remedy, in the same shape as the rest of the observability stack:
 * a pure function over a measured availability, so it is testable, quotable, and
 * cannot drift from the objective it is derived from.
 *
 * **What this does not do:** it does not silently move money. `creditFor`
 * computes what is owed; applying it is a deliberate operator action against
 * Stripe, recorded in the audit log like every other mutating operator step
 * (0433 decision 11). Automating a refund pipeline for credits that are often a
 * few dollars would cost more than the credits, and an automatic payout nobody
 * reviews is a worse failure mode than a slow one.
 */

import type { SloTarget } from './slo'

/** One rung of the credit ladder: miss this much, get this much back. */
export interface CreditTier {
  /** Measured availability at or below which this tier applies (exclusive upper bound). */
  below: number
  /** Percentage of the month's fee credited. */
  percent: number
}

/**
 * The published ladder for a 99.9% objective.
 *
 * Deliberately conventional — this is the shape every managed-service SLA uses,
 * and inventing a novel one would only make it harder to compare us with the
 * alternative a customer is weighing. The rungs are stated as *measured
 * availability*, not as downtime minutes, because that is what our own SLI
 * reports and a remedy nobody can compute from public data is not a remedy.
 */
export const CREDIT_LADDER: readonly CreditTier[] = [
  { below: 0.999, percent: 10 },
  { below: 0.99, percent: 25 },
  { below: 0.95, percent: 50 }
]

export interface SlaCredit {
  /** Percent of the period fee owed back. `0` when the objective was met. */
  percent: number
  /** The objective this was measured against, for the quote we give the customer. */
  objective: number
  /** Measured availability over the SLO window. */
  measured: number
}

/**
 * What we owe for a period, given the measured availability.
 *
 * Returns `null` — not a zero credit — when the plan publishes no objective.
 * "No SLA" and "an SLA that was met" are different statements, and a caller that
 * cannot tell them apart will eventually render "0% credit owed" to somebody who
 * was never promised anything.
 */
export function creditFor(slo: SloTarget, measured: number): SlaCredit | null {
  if (slo.objective === null) return null
  // Worst (deepest) matching rung wins: 94% availability owes 50%, not 10%.
  const percent = CREDIT_LADDER.reduce(
    (worst, tier) => (measured < tier.below ? Math.max(worst, tier.percent) : worst),
    0
  )
  return { percent, objective: slo.objective, measured }
}

/**
 * The credit in currency, given the period fee.
 *
 * Rounded to whole cents, and DOWN is not an option — a rounding rule that
 * always favours us on a promise we already broke is not a good look. Rounds to
 * the nearest cent, ties up.
 */
export function creditAmountUsd(credit: SlaCredit, periodFeeUsd: number): number {
  if (credit.percent === 0) return 0
  return Math.round(periodFeeUsd * credit.percent) / 100
}

/** One line an operator (or a customer) can read without a spreadsheet. */
export function describeCredit(credit: SlaCredit | null): string {
  if (!credit) return 'No published availability objective for this plan.'
  const objective = `${(credit.objective * 100).toFixed(2)}%`
  const measured = `${(credit.measured * 100).toFixed(3)}%`
  return credit.percent === 0
    ? `Objective ${objective} met (measured ${measured}). No credit owed.`
    : `Objective ${objective} missed (measured ${measured}). ${credit.percent}% of the period fee is owed as a service credit.`
}
