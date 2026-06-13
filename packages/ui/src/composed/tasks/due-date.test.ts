/**
 * Canonical due-date conversion invariants.
 *
 * The load-bearing property: a due date is an all-day value that must render
 * as the SAME calendar day regardless of the machine's timezone. These tests
 * lock that in (the regression we never want to ship — see exploration 0172).
 */
import { afterAll, describe, expect, it } from 'vitest'
import { dueDateInputValue, dueDateMsToIso, isoToDueDateMs, utcDayFromNow } from './due-date'

describe('due-date conversions', () => {
  it('round-trips iso → ms → iso losslessly', () => {
    for (const iso of ['2026-01-01', '2026-06-12', '2026-12-31', '2024-02-29']) {
      const ms = isoToDueDateMs(iso)
      expect(ms).not.toBeNull()
      expect(dueDateMsToIso(ms as number)).toBe(iso)
    }
  })

  it('stores UTC midnight of the calendar day', () => {
    expect(isoToDueDateMs('2026-06-12')).toBe(Date.UTC(2026, 5, 12))
  })

  it('rejects malformed and overflowing dates', () => {
    expect(isoToDueDateMs('2026-13-01')).toBeNull()
    expect(isoToDueDateMs('2026-02-31')).toBeNull()
    expect(isoToDueDateMs('not-a-date')).toBeNull()
    expect(isoToDueDateMs('6/12/2026')).toBeNull()
  })

  it('formats a nullable input value', () => {
    expect(dueDateInputValue(null)).toBe('')
    expect(dueDateInputValue(undefined)).toBe('')
    expect(dueDateInputValue(Date.UTC(2026, 5, 12))).toBe('2026-06-12')
  })

  it('utcDayFromNow lands on UTC midnight relative to a fixed now', () => {
    const now = Date.UTC(2026, 5, 12, 9, 30) // some wall-clock time mid-day
    expect(utcDayFromNow(0, now)).toBe(Date.UTC(2026, 5, 12))
    expect(utcDayFromNow(1, now)).toBe(Date.UTC(2026, 5, 13))
    expect(utcDayFromNow(7, now)).toBe(Date.UTC(2026, 5, 19))
  })
})

/**
 * Cross-timezone regression: process.env.TZ controls how local Date
 * constructors behave. Setting it to a negative offset would surface any
 * accidental local-time conversion as an off-by-one. The canonical helpers
 * use UTC exclusively, so the calendar day is identical in any zone.
 */
describe('due-date timezone safety', () => {
  const originalTz = process.env.TZ

  afterAll(() => {
    process.env.TZ = originalTz
  })

  for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    it(`renders the same calendar day in ${tz}`, () => {
      process.env.TZ = tz
      const ms = isoToDueDateMs('2026-06-12')
      expect(ms).toBe(Date.UTC(2026, 5, 12))
      expect(dueDateMsToIso(ms as number)).toBe('2026-06-12')
    })
  }
})
