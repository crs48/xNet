import { describe, expect, it } from 'vitest'
import { addDays, isoToDay } from './day'
import { completionRate, computeStreak, habitStrength, longestStreak } from './streak'

const day = (iso: string) => isoToDay(iso) as number

describe('computeStreak', () => {
  const scheduled = [
    day('2026-06-10'),
    day('2026-06-11'),
    day('2026-06-12'),
    day('2026-06-13'),
    day('2026-06-14')
  ]

  it('counts consecutive completed scheduled days back from today', () => {
    const completed = new Set([day('2026-06-12'), day('2026-06-13'), day('2026-06-14')])
    expect(computeStreak(completed, scheduled, day('2026-06-14'))).toBe(3)
  })

  it('does not treat an unlogged today as a miss', () => {
    const completed = new Set([day('2026-06-12'), day('2026-06-13')])
    // today (14) not yet logged — streak through yesterday survives.
    expect(computeStreak(completed, scheduled, day('2026-06-14'))).toBe(2)
  })

  it('breaks on a missed past scheduled day', () => {
    const completed = new Set([day('2026-06-10'), day('2026-06-11'), day('2026-06-14')])
    // 12 and 13 missed → only today counts.
    expect(computeStreak(completed, scheduled, day('2026-06-14'))).toBe(1)
  })

  it('ignores scheduled days in the future', () => {
    const future = [...scheduled, day('2026-06-15')]
    const completed = new Set([day('2026-06-13'), day('2026-06-14')])
    expect(computeStreak(completed, future, day('2026-06-14'))).toBe(2)
  })
})

describe('longestStreak + completionRate', () => {
  const scheduled = [
    day('2026-06-01'),
    day('2026-06-02'),
    day('2026-06-03'),
    day('2026-06-04'),
    day('2026-06-05')
  ]

  it('finds the longest historical run', () => {
    const completed = new Set([day('2026-06-01'), day('2026-06-03'), day('2026-06-04'), day('2026-06-05')])
    expect(longestStreak(completed, scheduled)).toBe(3)
  })

  it('computes completion rate over scheduled days', () => {
    const completed = new Set([day('2026-06-01'), day('2026-06-02')])
    expect(completionRate(completed, scheduled)).toBeCloseTo(0.4, 5)
    expect(completionRate(completed, [])).toBe(0)
  })
})

describe('habitStrength', () => {
  it('is higher for consistent completion than for sparse completion', () => {
    const scheduled = Array.from({ length: 30 }, (_, i) => addDays(day('2026-05-01'), i))
    const allDone = new Set(scheduled)
    const halfDone = new Set(scheduled.filter((_, i) => i % 2 === 0))
    expect(habitStrength(allDone, scheduled)).toBeGreaterThan(habitStrength(halfDone, scheduled))
  })

  it('stays within [0, 1] and degrades rather than resetting on a single miss', () => {
    const scheduled = Array.from({ length: 20 }, (_, i) => addDays(day('2026-05-01'), i))
    const oneMiss = new Set(scheduled.filter((d) => d !== scheduled[10]))
    const s = habitStrength(oneMiss, scheduled)
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThanOrEqual(1)
    expect(s).toBeGreaterThan(0.5) // a single miss among 20 barely dents it
  })

  it('is 0 with no completions', () => {
    const scheduled = Array.from({ length: 10 }, (_, i) => addDays(day('2026-05-01'), i))
    expect(habitStrength(new Set(), scheduled)).toBe(0)
  })
})
