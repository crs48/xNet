import { describe, expect, it } from 'vitest'
import {
  betaBinomialPosterior,
  cohensD,
  linearRegression,
  mean,
  meanDifferenceInterval,
  pearson,
  percentChange,
  pnd,
  pointBiserial,
  pooledStdDev,
  stdDev,
  tauU,
  variance
} from './stats'

describe('descriptive stats', () => {
  it('mean / variance / stdDev', () => {
    expect(mean([2, 4, 6])).toBe(4)
    expect(variance([2, 4, 6])).toBeCloseTo(4, 5) // sample variance n-1
    expect(stdDev([2, 4, 6])).toBeCloseTo(2, 5)
    expect(variance([5])).toBe(0)
  })

  it('pooledStdDev across two samples', () => {
    expect(pooledStdDev([1, 2, 3], [4, 5, 6])).toBeCloseTo(1, 5)
  })
})

describe('effect size', () => {
  it('cohensD is positive when intervention is higher', () => {
    const d = cohensD([1, 2, 3], [4, 5, 6])
    expect(d).toBeGreaterThan(2) // a 3-unit shift on sd≈1
  })

  it('cohensD is 0 with no spread and no difference', () => {
    expect(cohensD([5, 5], [5, 5])).toBe(0)
  })

  it('percentChange relative to baseline mean', () => {
    expect(percentChange([10, 10], [12, 12])).toBeCloseTo(20, 5)
    expect(percentChange([0, 0], [5, 5])).toBe(0) // guard against /0
  })
})

describe('correlation + regression', () => {
  it('pearson is 1 for a perfect positive line', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 5)
  })

  it('pearson is -1 for a perfect negative line', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 5)
  })

  it('pointBiserial correlates a 0/1 predictor with an outcome', () => {
    // higher outcome on the "1" days
    const r = pointBiserial([0, 0, 1, 1], [2, 3, 7, 8])
    expect(r).toBeGreaterThan(0.9)
  })

  it('linearRegression recovers slope and intercept', () => {
    const { slope, intercept } = linearRegression([
      [0, 1],
      [1, 3],
      [2, 5]
    ])
    expect(slope).toBeCloseTo(2, 5)
    expect(intercept).toBeCloseTo(1, 5)
  })
})

describe('non-overlap', () => {
  it('pnd is 100% when every intervention point beats all baseline', () => {
    expect(pnd([1, 2, 3], [4, 5, 6])).toBe(100)
  })

  it('pnd respects lower-is-better', () => {
    expect(pnd([4, 5, 6], [1, 2, 3], false)).toBe(100)
  })

  it('tauU is +1 for complete, trend-free separation upward', () => {
    expect(tauU([1, 1, 1], [2, 2, 2])).toBeCloseTo(1, 5)
  })

  it('tauU is negative when intervention is lower', () => {
    expect(tauU([5, 5, 5], [1, 1, 1])).toBeLessThan(0)
  })

  it('tauU penalizes a rising baseline (trend correction)', () => {
    // A clearly rising baseline should pull Tau-U below the naive non-overlap.
    const rising = tauU([1, 2, 3], [4, 5, 6])
    const flat = tauU([2, 2, 2], [4, 5, 6])
    expect(rising).toBeLessThan(flat)
  })
})

describe('bayesian-ish intervals', () => {
  it('meanDifferenceInterval brackets the true difference', () => {
    const { meanDiff, ci } = meanDifferenceInterval([10, 11, 9, 10], [13, 14, 12, 13])
    expect(meanDiff).toBeCloseTo(3, 5)
    expect(ci[0]).toBeLessThan(meanDiff)
    expect(ci[1]).toBeGreaterThan(meanDiff)
  })

  it('betaBinomialPosterior updates toward observed success rate', () => {
    const post = betaBinomialPosterior(8, 2) // 8 of 10 successes, flat prior
    expect(post.mean).toBeCloseTo(9 / 12, 5) // (1+8)/(2+10)
    expect(post.ci[0]).toBeGreaterThanOrEqual(0)
    expect(post.ci[1]).toBeLessThanOrEqual(1)
  })
})
