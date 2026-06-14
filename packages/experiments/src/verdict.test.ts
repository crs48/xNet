import { describe, expect, it } from 'vitest'
import { describeCaveat, evaluate } from './verdict'

describe('verdict engine', () => {
  it('rejects the null for a clear, well-powered effect', () => {
    const v = evaluate({
      baseline: [5, 5, 6, 5, 6, 5, 5],
      intervention: [8, 9, 8, 9, 8, 9, 8],
      polarity: 'higherBetter'
    })
    expect(v.direction).toBe('rejectsNull')
    expect(v.cohensD).toBeGreaterThan(0.8)
    expect(v.caveats).toHaveLength(0)
    expect(v.summary).toMatch(/argues against your null/i)
  })

  it('is inconclusive when a phase is too short, regardless of apparent effect', () => {
    const v = evaluate({
      baseline: [5, 6],
      intervention: [9, 9],
      polarity: 'higherBetter'
    })
    expect(v.direction).toBe('inconclusive')
    expect(v.caveats.some((c) => c.kind === 'phaseTooShort')).toBe(true)
  })

  it('fails to reject the null when phases overlap heavily', () => {
    const v = evaluate({
      baseline: [5, 6, 5, 6, 5, 6, 5],
      intervention: [5, 6, 6, 5, 6, 5, 6],
      polarity: 'higherBetter'
    })
    expect(v.direction).toBe('failsToRejectNull')
    expect(v.summary).toMatch(/does not reject your null/i)
  })

  it('honors lower-is-better polarity (sleep latency dropping is good)', () => {
    const v = evaluate({
      baseline: [40, 42, 38, 41, 39, 40, 43],
      intervention: [20, 22, 19, 21, 18, 20, 22],
      polarity: 'lowerBetter'
    })
    expect(v.direction).toBe('rejectsNull')
  })

  it('never claims "proven"', () => {
    const v = evaluate({
      baseline: [1, 1, 1, 1, 1, 1],
      intervention: [9, 9, 9, 9, 9, 9],
      polarity: 'higherBetter'
    })
    expect(v.summary.toLowerCase()).not.toContain('proven')
    expect(v.summary.toLowerCase()).not.toContain('proves')
  })

  it('surfaces the keep-you-honest caveats', () => {
    const v = evaluate({
      baseline: [5, 5, 6, 5, 6, 5, 5, 6, 5, 6, 5, 6],
      intervention: [8, 9, 8, 9, 8],
      polarity: 'higherBetter',
      confoundDays: 2,
      selfReport: true,
      metricsExamined: 7,
      baselineSelectedAtExtreme: true
    })
    const kinds = v.caveats.map((c) => c.kind)
    expect(kinds).toContain('unbalancedPhases')
    expect(kinds).toContain('confoundsPresent')
    expect(kinds).toContain('unblindedSelfReport')
    expect(kinds).toContain('multipleComparisons')
    expect(kinds).toContain('regressionToMean')
    // every caveat renders to a non-empty sentence
    for (const c of v.caveats) expect(describeCaveat(c).length).toBeGreaterThan(10)
  })

  it('handles empty input without throwing', () => {
    const v = evaluate({ baseline: [], intervention: [] })
    expect(v.direction).toBe('inconclusive')
  })
})
