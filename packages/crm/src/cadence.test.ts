import { describe, expect, it } from 'vitest'
import {
  computeNextTouch,
  daysUntilTouch,
  dueForFollowUp,
  effectiveNextTouch,
  isOverdue
} from './cadence'
import { DAY_MS, canonicalDay } from './day'

const NOW = Date.UTC(2026, 5, 15, 9, 30) // 2026-06-15T09:30Z
const today = canonicalDay(NOW)

describe('cadence', () => {
  it('has no next touch without a cadence', () => {
    expect(computeNextTouch(today, 0, NOW)).toBeNull()
    expect(computeNextTouch(today, null, NOW)).toBeNull()
    expect(computeNextTouch(today, undefined, NOW)).toBeNull()
  })

  it('derives next touch from last touch + cadence', () => {
    const last = Date.UTC(2026, 5, 1)
    expect(computeNextTouch(last, 21, NOW)).toBe(canonicalDay(last) + 21 * DAY_MS)
  })

  it('measures cadence from today when there is no last touch', () => {
    expect(computeNextTouch(null, 7, NOW)).toBe(today + 7 * DAY_MS)
  })

  it('prefers a stored nextTouchAt over a derived one', () => {
    const stored = Date.UTC(2026, 6, 1)
    expect(effectiveNextTouch({ nextTouchAt: stored, touchEveryDays: 7 }, NOW)).toBe(
      canonicalDay(stored)
    )
  })

  it('reports overdue when the next touch is today or past', () => {
    expect(isOverdue({ nextTouchAt: today }, NOW)).toBe(true) // due today counts
    expect(isOverdue({ nextTouchAt: today - DAY_MS }, NOW)).toBe(true)
    expect(isOverdue({ nextTouchAt: today + DAY_MS }, NOW)).toBe(false)
    expect(isOverdue({}, NOW)).toBe(false) // no cadence, never overdue
  })

  it('counts whole days until the next touch (negative = overdue)', () => {
    expect(daysUntilTouch({ nextTouchAt: today + 3 * DAY_MS }, NOW)).toBe(3)
    expect(daysUntilTouch({ nextTouchAt: today - 2 * DAY_MS }, NOW)).toBe(-2)
    expect(daysUntilTouch({}, NOW)).toBeNull()
  })

  it('returns due contacts most-overdue-first, excluding those without cadence', () => {
    const contacts = [
      { id: 'a', nextTouchAt: today - DAY_MS }, // 1 day overdue
      { id: 'b', nextTouchAt: today + 5 * DAY_MS }, // not due
      { id: 'c', nextTouchAt: today - 10 * DAY_MS }, // 10 days overdue
      { id: 'd' }, // no cadence
      { id: 'e', nextTouchAt: today } // due today
    ]
    const due = dueForFollowUp(contacts, NOW).map((c) => c.id)
    expect(due).toEqual(['c', 'a', 'e'])
  })
})
