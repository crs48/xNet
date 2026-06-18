/**
 * @xnetjs/cloud/billing — AI budget status + threshold crossing.
 *
 * Pure helpers that turn a tenant's accrued spend into a UI state and the set of
 * alert thresholds it just crossed (50 / 80 / 95 / 100% of the cap). The metered
 * gateway still owns the hard stop; this is the surprise-bill *warning* layer —
 * the dashboard reads the state, a notifier reads the crossings (exploration 0201).
 */

export type BudgetState =
  /** Within the plan's included (free) allotment. */
  | 'included'
  /** Past included, metering overage, comfortably under the cap. */
  | 'overage'
  /** Past the near-cap warning threshold (default 80% of the cap). */
  | 'near-cap'
  /** At or over the hard cap — the next request is refused (402). */
  | 'over-cap'

export interface BudgetStatus {
  usedUsd: number
  includedUsd: number
  capUsd: number
  /** Fraction of the cap consumed (0..1; 0 when the cap is 0). */
  pctOfCap: number
  state: BudgetState
}

/** Alert thresholds as fractions of the cap (50 / 80 / 95 / 100%). */
export const DEFAULT_BUDGET_THRESHOLDS = [0.5, 0.8, 0.95, 1] as const

/** Fraction of the cap at/above which the UI shows the near-cap warning. */
export const NEAR_CAP_FRACTION = 0.8

/** Classify accrued spend against the included allotment and the hard cap. */
export function aiBudgetStatus(usedUsd: number, includedUsd: number, capUsd: number): BudgetStatus {
  const pctOfCap = capUsd > 0 ? usedUsd / capUsd : 0
  let state: BudgetState
  if (capUsd > 0 && usedUsd >= capUsd) state = 'over-cap'
  else if (pctOfCap >= NEAR_CAP_FRACTION) state = 'near-cap'
  else if (usedUsd > includedUsd) state = 'overage'
  else state = 'included'
  return { usedUsd, includedUsd, capUsd, pctOfCap, state }
}

/**
 * The alert thresholds (as fractions) newly crossed by moving spend from
 * `prevUsedUsd` to `newUsedUsd` against `capUsd` — i.e. `prev < t·cap ≤ new`. A
 * notifier emails once per crossing; metering already enforces the 100% stop.
 */
export function crossedThresholds(
  prevUsedUsd: number,
  newUsedUsd: number,
  capUsd: number,
  thresholds: readonly number[] = DEFAULT_BUDGET_THRESHOLDS
): number[] {
  if (capUsd <= 0 || newUsedUsd <= prevUsedUsd) return []
  return thresholds.filter((t) => {
    const at = t * capUsd
    return prevUsedUsd < at && newUsedUsd >= at
  })
}
