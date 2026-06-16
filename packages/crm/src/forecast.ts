/**
 * Forecast rollups — the four standard lanes reps move deals between. Each lane
 * is cumulative: Commit ⊆ Best Case, and Closed (won) feeds both.
 */

export type ForecastCategory = 'pipeline' | 'best-case' | 'commit' | 'closed'

export interface ForecastDealLike {
  amount?: number | null
  forecastCategory?: string | null
  isClosed?: boolean | null
  isWon?: boolean | null
}

export interface ForecastRollup {
  /** All open deals, regardless of category. */
  pipeline: number
  /** Commit + Best Case + Closed-won. */
  bestCase: number
  /** Commit + Closed-won. */
  commit: number
  /** Closed-won only. */
  closed: number
}

const amt = (d: ForecastDealLike): number => d.amount ?? 0
const isOpen = (d: ForecastDealLike): boolean => !d.isClosed
const isClosedWon = (d: ForecastDealLike): boolean => Boolean(d.isClosed) && Boolean(d.isWon)
const cat = (d: ForecastDealLike): string => d.forecastCategory ?? 'pipeline'

/** Roll deals up into the four forecast lanes. */
export function forecastRollup(deals: ForecastDealLike[]): ForecastRollup {
  let pipeline = 0
  let bestCase = 0
  let commit = 0
  let closed = 0
  for (const d of deals) {
    const value = amt(d)
    if (isClosedWon(d)) {
      closed += value
      commit += value
      bestCase += value
      continue
    }
    if (!isOpen(d)) continue // closed-lost contributes to nothing
    pipeline += value
    if (cat(d) === 'commit') {
      commit += value
      bestCase += value
    } else if (cat(d) === 'best-case') {
      bestCase += value
    }
  }
  return { pipeline, bestCase, commit, closed }
}
