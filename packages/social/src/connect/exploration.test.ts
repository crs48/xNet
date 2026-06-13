import { describe, expect, it } from 'vitest'
import {
  adaptiveLambda,
  averagePairwiseSimilarity,
  banditExplorationBonus,
  betaPosteriorMean,
  betaPosteriorStdev,
  thompsonSample,
  ucb1ExplorationBonus,
  updateArm,
  EMPTY_ARM
} from './exploration'

describe('ucb1ExplorationBonus', () => {
  it('gives an unobserved candidate the maximum bonus', () => {
    expect(ucb1ExplorationBonus(0, 100)).toBe(1)
    expect(ucb1ExplorationBonus(0, 0)).toBe(1)
  })

  it('shrinks as a candidate is observed more, holding total fixed', () => {
    const few = ucb1ExplorationBonus(2, 100)
    const many = ucb1ExplorationBonus(50, 100)
    expect(few).toBeGreaterThan(many)
  })

  it('grows with the total number of rounds, holding count fixed', () => {
    expect(ucb1ExplorationBonus(5, 1000)).toBeGreaterThan(ucb1ExplorationBonus(5, 50))
  })

  it('stays within [0, 1]', () => {
    expect(ucb1ExplorationBonus(1, 1_000_000)).toBeLessThanOrEqual(1)
    expect(ucb1ExplorationBonus(1, 1_000_000)).toBeGreaterThanOrEqual(0)
  })
})

describe('Beta-Bernoulli bandit', () => {
  it('updateArm folds outcomes immutably', () => {
    const a = updateArm(EMPTY_ARM, true)
    expect(a).toEqual({ successes: 1, failures: 0 })
    expect(EMPTY_ARM).toEqual({ successes: 0, failures: 0 })
    expect(updateArm(a, false)).toEqual({ successes: 1, failures: 1 })
  })

  it('posterior mean moves toward the observed success rate', () => {
    expect(betaPosteriorMean(EMPTY_ARM)).toBeCloseTo(0.5)
    expect(betaPosteriorMean({ successes: 9, failures: 1 })).toBeGreaterThan(0.7)
    expect(betaPosteriorMean({ successes: 1, failures: 9 })).toBeLessThan(0.3)
  })

  it('posterior uncertainty shrinks with more evidence', () => {
    expect(betaPosteriorStdev({ successes: 50, failures: 50 })).toBeLessThan(
      betaPosteriorStdev({ successes: 1, failures: 1 })
    )
  })

  it('banditExplorationBonus is high for a fresh arm and low for a well-observed one', () => {
    expect(banditExplorationBonus(EMPTY_ARM)).toBeCloseTo(1, 1)
    expect(banditExplorationBonus({ successes: 200, failures: 200 })).toBeLessThan(0.2)
  })

  it('thompsonSample is deterministic given a fixed RNG and stays in [0, 1]', () => {
    const draw = thompsonSample({ successes: 5, failures: 5 }, () => 0.5)
    expect(draw).toBeGreaterThanOrEqual(0)
    expect(draw).toBeLessThanOrEqual(1)
    // same RNG → same draw
    expect(thompsonSample({ successes: 5, failures: 5 }, () => 0.5)).toBe(draw)
  })
})

describe('adaptive MMR diversity', () => {
  it('lowers λ (more diversity) as the set gets more homogeneous', () => {
    expect(adaptiveLambda(0)).toBeCloseTo(0.85)
    expect(adaptiveLambda(1)).toBeCloseTo(0.5)
    expect(adaptiveLambda(0.5)).toBeGreaterThan(adaptiveLambda(0.9))
  })

  it('respects custom bounds', () => {
    expect(adaptiveLambda(0, { max: 0.9, min: 0.6 })).toBeCloseTo(0.9)
    expect(adaptiveLambda(1, { max: 0.9, min: 0.6 })).toBeCloseTo(0.6)
  })

  it('averagePairwiseSimilarity averages the upper triangle', () => {
    // three items, similarities 1.0, 0.0, 0.5 → mean 0.5
    const sim = (a: string, b: string) => {
      const key = [a, b].sort().join('')
      return { ab: 1, ac: 0, bc: 0.5 }[key] ?? 0
    }
    expect(averagePairwiseSimilarity(['a', 'b', 'c'], sim)).toBeCloseTo(0.5)
    expect(averagePairwiseSimilarity(['solo'], sim)).toBe(0)
  })
})
