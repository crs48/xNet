import { describe, expect, it } from 'vitest'
import {
  DAY_MS,
  addDays,
  canonicalDay,
  dayOfWeek,
  dayToIso,
  daysBetween,
  eachDay,
  isoToDay,
  weekStart
} from './day'

describe('canonical day', () => {
  it('normalizes any instant to UTC midnight of its calendar day', () => {
    const noonUtc = Date.UTC(2026, 5, 14, 12, 30, 0)
    expect(canonicalDay(noonUtc)).toBe(Date.UTC(2026, 5, 14))
    expect(dayToIso(canonicalDay(noonUtc))).toBe('2026-06-14')
  })

  it('round-trips iso ↔ day without a timezone off-by-one', () => {
    const day = isoToDay('2026-06-14')
    expect(day).toBe(Date.UTC(2026, 5, 14))
    expect(dayToIso(day as number)).toBe('2026-06-14')
  })

  it('rejects overflow dates', () => {
    expect(isoToDay('2026-02-31')).toBeNull()
    expect(isoToDay('2026-13-01')).toBeNull()
    expect(isoToDay('not-a-date')).toBeNull()
  })

  it('does the same day regardless of the time-of-day within the UTC day', () => {
    const early = Date.UTC(2026, 0, 1, 0, 0, 1)
    const late = Date.UTC(2026, 0, 1, 23, 59, 59)
    expect(canonicalDay(early)).toBe(canonicalDay(late))
  })

  it('adds and diffs whole days', () => {
    const d = isoToDay('2026-06-14') as number
    expect(dayToIso(addDays(d, 3))).toBe('2026-06-17')
    expect(daysBetween(d, addDays(d, 5))).toBe(5)
    expect(daysBetween(addDays(d, 5), d)).toBe(-5)
  })

  it('crosses a DST boundary without drift (dates are UTC, not local)', () => {
    // US "spring forward" 2026-03-08 — a local-time impl would lose an hour and
    // mislabel the day. UTC arithmetic is immune.
    const before = isoToDay('2026-03-07') as number
    const after = addDays(before, 1)
    expect(dayToIso(after)).toBe('2026-03-08')
    expect(after - before).toBe(DAY_MS)
  })

  it('enumerates inclusive day ranges', () => {
    const start = isoToDay('2026-06-01') as number
    const end = isoToDay('2026-06-03') as number
    expect(eachDay(start, end).map(dayToIso)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })

  it('computes weekday and week start (Monday default)', () => {
    // 2026-06-14 is a Sunday.
    const sunday = isoToDay('2026-06-14') as number
    expect(dayOfWeek(sunday)).toBe(0)
    expect(dayToIso(weekStart(sunday))).toBe('2026-06-08') // preceding Monday
    expect(dayToIso(weekStart(sunday, 0))).toBe('2026-06-14') // week starts Sunday
  })
})
