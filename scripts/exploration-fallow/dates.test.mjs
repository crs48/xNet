import { describe, expect, it } from 'vitest'
import { DAY_MS, dayDiff, dueDay, formatDay, isOverdue, overdueDays, utcDay } from './dates.mjs'

/**
 * 2026-08-02T05:14:00Z — the run that surfaced the bug. In the machine that
 * produced it (America/Los_Angeles, PDT) this is 22:14 the *previous* evening,
 * so any arithmetic that mixed a UTC-parsed date with a local "now" lands on
 * the wrong side of a day boundary here.
 */
const LATE_EVENING = Date.parse('2026-08-02T05:14:00Z')

/** The real due instants of explorations 0079 and 0080 — 11h40m apart. */
const BORN_0079 = Date.parse('2026-02-08T14:56:39Z')
const BORN_0080 = Date.parse('2026-02-09T02:37:17Z')

describe('utcDay', () => {
  it('floors an instant to UTC midnight', () => {
    expect(formatDay(utcDay(LATE_EVENING))).toBe('2026-08-02')
    expect(utcDay(Date.parse('2026-08-02T00:00:00Z'))).toBe(Date.parse('2026-08-02T00:00:00Z'))
    expect(utcDay(Date.parse('2026-08-02T23:59:59Z'))).toBe(Date.parse('2026-08-02T00:00:00Z'))
  })

  it('is stable across every hour of a day', () => {
    const midnight = Date.parse('2026-08-02T00:00:00Z')
    for (let hour = 0; hour < 24; hour++) {
      expect(utcDay(midnight + hour * 3_600_000)).toBe(midnight)
    }
  })
})

describe('overdueDays', () => {
  it('gives consecutive due dates consecutive counts, late in the local day', () => {
    const a = dueDay({ review: '2026-05-09', windowDays: 90 })
    const b = dueDay({ review: '2026-05-10', windowDays: 90 })

    expect(overdueDays(a, LATE_EVENING) - overdueDays(b, LATE_EVENING)).toBe(1)
  })

  it('gives consecutive counts for default due dates derived from commit times', () => {
    // The original failure: due *dates* a day apart, due *instants* 11h40m
    // apart, so the instant-based subtraction floored both to 84.
    const a = dueDay({ bornMs: BORN_0079, windowDays: 90 })
    const b = dueDay({ bornMs: BORN_0080, windowDays: 90 })

    expect(formatDay(a)).toBe('2026-05-09')
    expect(formatDay(b)).toBe('2026-05-10')
    expect(overdueDays(a, LATE_EVENING)).toBe(85)
    expect(overdueDays(b, LATE_EVENING)).toBe(84)
  })

  it('holds that property at every hour of the day', () => {
    const a = dueDay({ review: '2026-05-09', windowDays: 90 })
    const b = dueDay({ review: '2026-05-10', windowDays: 90 })
    const midnight = Date.parse('2026-08-02T00:00:00Z')

    for (let hour = 0; hour < 24; hour++) {
      const now = midnight + hour * 3_600_000
      expect(overdueDays(a, now)).toBe(85)
      expect(overdueDays(b, now)).toBe(84)
    }
  })

  it('counts the displayed due date, not the elapsed duration', () => {
    // Displayed 2026-05-09 either way; the count must not depend on the clock
    // time the document happened to be committed at.
    const morning = dueDay({ bornMs: Date.parse('2026-02-08T00:10:00Z'), windowDays: 90 })
    const evening = dueDay({ bornMs: Date.parse('2026-02-08T23:50:00Z'), windowDays: 90 })

    expect(morning).toBe(evening)
    expect(overdueDays(morning, LATE_EVENING)).toBe(overdueDays(evening, LATE_EVENING))
  })

  it('is negative before the due date and zero on it', () => {
    const due = dueDay({ review: '2026-08-02', windowDays: 90 })

    expect(overdueDays(due, LATE_EVENING)).toBe(0)
    expect(overdueDays(due, LATE_EVENING + DAY_MS)).toBe(1)
    expect(overdueDays(due, LATE_EVENING - DAY_MS)).toBe(-1)
  })
})

describe('isOverdue', () => {
  it('starts the day after the review date, not on it', () => {
    const due = dueDay({ review: '2026-08-02', windowDays: 90 })

    expect(isOverdue(due, Date.parse('2026-08-01T23:59:59Z'))).toBe(false)
    expect(isOverdue(due, Date.parse('2026-08-02T00:00:00Z'))).toBe(false)
    expect(isOverdue(due, Date.parse('2026-08-02T23:59:59Z'))).toBe(false)
    expect(isOverdue(due, Date.parse('2026-08-03T00:00:00Z'))).toBe(true)
  })
})

describe('dueDay', () => {
  it('prefers an explicit review date over the birth window', () => {
    const due = dueDay({ review: '2027-02-01', bornMs: BORN_0079, windowDays: 90 })
    expect(formatDay(due)).toBe('2027-02-01')
  })

  it('falls back to the birth window when review: is absent or malformed', () => {
    expect(formatDay(dueDay({ bornMs: BORN_0079, windowDays: 90 }))).toBe('2026-05-09')
    expect(formatDay(dueDay({ review: 'soon', bornMs: BORN_0079, windowDays: 90 }))).toBe(
      '2026-05-09'
    )
  })

  it('returns null when the age is unreadable — not a due date in the future', () => {
    // "Unknown age" and "not yet due" are different facts and must stay
    // different values (AGENTS.md).
    expect(dueDay({ windowDays: 90 })).toBeNull()
    expect(dueDay({ review: null, bornMs: undefined, windowDays: 90 })).toBeNull()
  })
})

describe('dayDiff', () => {
  it('ignores the time of day at both ends', () => {
    expect(dayDiff(Date.parse('2026-08-02T00:00:01Z'), Date.parse('2026-08-01T23:59:59Z'))).toBe(1)
    expect(dayDiff(Date.parse('2026-08-01T23:59:59Z'), Date.parse('2026-08-01T00:00:01Z'))).toBe(0)
  })
})
