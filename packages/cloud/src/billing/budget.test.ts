import { describe, expect, it } from 'vitest'
import { aiBudgetStatus, crossedThresholds } from './budget'

describe('aiBudgetStatus', () => {
  it('classifies included / overage / near-cap / over-cap', () => {
    // included: $1 used, $2 included, $25 cap
    expect(aiBudgetStatus(1, 2, 25).state).toBe('included')
    // overage: past included, under the near-cap line
    expect(aiBudgetStatus(5, 2, 25).state).toBe('overage')
    // near-cap: ≥ 80% of the cap
    expect(aiBudgetStatus(20, 2, 25).state).toBe('near-cap')
    // over-cap: at/over the hard cap
    expect(aiBudgetStatus(25, 2, 25).state).toBe('over-cap')
    expect(aiBudgetStatus(30, 2, 25).state).toBe('over-cap')
  })

  it('reports the fraction of the cap consumed and tolerates a zero cap', () => {
    expect(aiBudgetStatus(5, 0, 20).pctOfCap).toBeCloseTo(0.25, 8)
    const off = aiBudgetStatus(0, 0, 0)
    expect(off.pctOfCap).toBe(0)
    expect(off.state).toBe('included')
  })
})

describe('crossedThresholds', () => {
  it('returns thresholds newly crossed by the spend delta', () => {
    // $10 cap: moving 3 → 9 crosses 50% ($5) and 80% ($8) but not 95%/100%
    expect(crossedThresholds(3, 9, 10)).toEqual([0.5, 0.8])
    // crossing the cap exactly hits 100%
    expect(crossedThresholds(9, 10, 10)).toEqual([0.95, 1])
  })

  it('is empty when spend does not increase or the cap is zero', () => {
    expect(crossedThresholds(9, 9, 10)).toEqual([])
    expect(crossedThresholds(1, 9, 0)).toEqual([])
  })

  it('does not re-fire a threshold already crossed', () => {
    // already past 50% ($5); moving 6 → 7 crosses nothing new
    expect(crossedThresholds(6, 7, 10)).toEqual([])
  })
})
