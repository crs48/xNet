/**
 * The local learning loop (exploration 0415).
 *
 * The assertion that matters most is the refusal: a profile that scores worse
 * on the pinned golden set is *not* adopted, no matter how well it fits the
 * user's own recent behavior. Learning from your own traces is how a retriever
 * quietly overfits, and the ratchet is the only thing standing in the way.
 */

import { describe, expect, it } from 'vitest'
import {
  budgetFromProfile,
  DEFAULT_RETRIEVAL_PROFILE,
  localGoldenCases,
  normalizeProfile,
  preferencePairs,
  proposeProfile,
  ratchetProfile,
  type ProfileScores,
  type RecallOutcome
} from './retrieval-profile'
import { DEFAULT_BUDGET } from './types'

const BASELINE: ProfileScores = { recallAll: 0.81, recallGraph: 0.5, mrr: 0.69 }

describe('normalizeProfile', () => {
  it('fills defaults and clamps out-of-range values', () => {
    expect(normalizeProfile(null)).toEqual(DEFAULT_RETRIEVAL_PROFILE)
    const clamped = normalizeProfile({ hopDecay: 5, vectorWeight: -2, maxEntries: 1000 })
    expect(clamped.hopDecay).toBe(0.95)
    expect(clamped.vectorWeight).toBe(0)
    expect(clamped.maxEntries).toBe(32)
  })

  it('applies to a budget without touching unrelated knobs', () => {
    const budget = budgetFromProfile(
      { ...DEFAULT_RETRIEVAL_PROFILE, hopDecay: 0.7 },
      DEFAULT_BUDGET
    )
    expect(budget.hopDecay).toBe(0.7)
    expect(budget.maxTokens).toBe(DEFAULT_BUDGET.maxTokens)
  })
})

describe('preferencePairs', () => {
  const outcome: RecallOutcome = {
    query: 'renewal risk',
    returned: ['a', 'b', 'c'],
    used: ['c']
  }

  it('records a used node outranked by unused ones', () => {
    const pairs = preferencePairs([outcome])
    expect(pairs).toHaveLength(2)
    expect(pairs.map((p) => p.over).sort()).toEqual(['a', 'b'])
    expect(pairs[0].preferred).toBe('c')
  })

  it('yields nothing from a rolled-back outcome', () => {
    // "The user undid this" makes the episode unreliable evidence — not
    // evidence for the opposite ranking.
    expect(preferencePairs([{ ...outcome, rejected: true }])).toHaveLength(0)
  })

  it('ignores a used node the recall never returned', () => {
    expect(preferencePairs([{ ...outcome, used: ['zzz'] }])).toHaveLength(0)
  })

  it('carries hops when the caller knows them', () => {
    const pairs = preferencePairs([outcome], { hopsOf: (id) => (id === 'c' ? 1 : 0) })
    expect(pairs.every((p) => p.preferredHops === 1)).toBe(true)
  })
})

describe('proposeProfile', () => {
  const graphPair = (i: number) => ({
    query: `q${i}`,
    preferred: 'g',
    over: 'k',
    gap: 1,
    preferredHops: 1
  })
  const keywordPair = (i: number) => ({
    query: `q${i}`,
    preferred: 'k',
    over: 'j',
    gap: 1,
    preferredHops: 0
  })

  it('proposes nothing below the minimum evidence', () => {
    expect(proposeProfile(DEFAULT_RETRIEVAL_PROFILE, [graphPair(1)])).toBeNull()
  })

  it('raises hopDecay when users kept wanting graph-reached nodes', () => {
    const pairs = Array.from({ length: 12 }, (_, i) => graphPair(i))
    const proposed = proposeProfile(DEFAULT_RETRIEVAL_PROFILE, pairs)
    expect(proposed?.hopDecay).toBeGreaterThan(DEFAULT_RETRIEVAL_PROFILE.hopDecay)
  })

  it('lowers it when they consistently wanted direct matches', () => {
    const pairs = Array.from({ length: 12 }, (_, i) => keywordPair(i))
    const proposed = proposeProfile(DEFAULT_RETRIEVAL_PROFILE, pairs)
    expect(proposed?.hopDecay).toBeLessThan(DEFAULT_RETRIEVAL_PROFILE.hopDecay)
  })

  it('proposes nothing on a mixed signal', () => {
    const pairs = [
      ...Array.from({ length: 6 }, (_, i) => graphPair(i)),
      ...Array.from({ length: 6 }, (_, i) => keywordPair(i))
    ]
    expect(proposeProfile(DEFAULT_RETRIEVAL_PROFILE, pairs)).toBeNull()
  })

  it('never proposes a value outside the bounds', () => {
    const pairs = Array.from({ length: 40 }, (_, i) => graphPair(i))
    let profile = { ...DEFAULT_RETRIEVAL_PROFILE, hopDecay: 0.94 }
    for (let i = 0; i < 10; i++) profile = proposeProfile(profile, pairs) ?? profile
    expect(profile.hopDecay).toBeLessThanOrEqual(0.95)
  })
})

describe('ratchetProfile', () => {
  const candidate = { ...DEFAULT_RETRIEVAL_PROFILE, hopDecay: 0.6 }

  it('refuses a candidate that regresses any metric', () => {
    const decision = ratchetProfile({
      candidate,
      baseline: BASELINE,
      // Better overall recall, worse ranking. Still a regression.
      scored: { recallAll: 0.9, recallGraph: 0.6, mrr: 0.62 }
    })
    expect(decision.adopt).toBe(false)
    expect(decision.reason).toContain('mrr')
  })

  it('refuses a candidate that changes nothing', () => {
    const decision = ratchetProfile({ candidate, baseline: BASELINE, scored: { ...BASELINE } })
    expect(decision.adopt).toBe(false)
    expect(decision.reason).toBe('no measurable improvement')
  })

  it('adopts a candidate that improves without regressing', () => {
    const decision = ratchetProfile({
      candidate,
      baseline: BASELINE,
      scored: { recallAll: 0.85, recallGraph: 0.62, mrr: 0.69 }
    })
    expect(decision.adopt).toBe(true)
    expect(decision.reason).toBe('improved without regressing')
  })

  it('tolerates float noise below the tolerance', () => {
    const decision = ratchetProfile({
      candidate,
      baseline: BASELINE,
      scored: { recallAll: 0.8109, recallGraph: 0.5, mrr: 0.7 }
    })
    expect(decision.adopt).toBe(true)
  })
})

describe('localGoldenCases', () => {
  it('captures confirmed recalls, skipping rejected and unreturned ones', () => {
    const cases = localGoldenCases(
      [
        { query: 'renewal risk', returned: ['a', 'b'], used: ['b'] },
        { query: 'rolled back', returned: ['a'], used: ['a'], rejected: true },
        { query: 'nothing used', returned: ['a'], used: [] }
      ],
      { now: 1_700_000_000_000 }
    )
    expect(cases).toHaveLength(1)
    expect(cases[0]).toMatchObject({ query: 'renewal risk', relevant: ['b'] })
  })

  it('de-duplicates by query so one repeated ask cannot dominate', () => {
    const outcome = { query: 'renewal risk', returned: ['a'], used: ['a'] }
    expect(localGoldenCases([outcome, outcome, outcome], { now: 1 })).toHaveLength(1)
  })
})
