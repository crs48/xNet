import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BUDGET_WINDOW,
  isBudgetWindow,
  keyResetFor,
  windowStartMs,
  type BudgetWindow
} from './window'

// A reference instant: Wed 2026-06-17 13:45:30 UTC.
const WED = Date.UTC(2026, 5, 17, 13, 45, 30)

describe('windowStartMs', () => {
  it('calendar-month → 1st of the month at 00:00 UTC', () => {
    expect(windowStartMs({ kind: 'calendar-month' }, WED)).toBe(Date.UTC(2026, 5, 1))
  })

  it('calendar-week → preceding Monday 00:00 UTC', () => {
    // 2026-06-17 is a Wednesday → the Monday is 2026-06-15.
    expect(windowStartMs({ kind: 'calendar-week' }, WED)).toBe(Date.UTC(2026, 5, 15))
  })

  it('calendar-week on a Monday returns that same midnight', () => {
    const mon = Date.UTC(2026, 5, 15, 9, 0, 0)
    expect(windowStartMs({ kind: 'calendar-week' }, mon)).toBe(Date.UTC(2026, 5, 15))
  })

  it('calendar-week on a Sunday returns the *previous* Monday (Mon–Sun weeks)', () => {
    const sun = Date.UTC(2026, 5, 21, 23, 59, 0) // Sunday
    expect(windowStartMs({ kind: 'calendar-week' }, sun)).toBe(Date.UTC(2026, 5, 15))
  })

  it('calendar-week handles a month boundary', () => {
    // 2026-06-01 is a Monday; 2026-06-03 (Wed) → week start is 2026-06-01.
    const wed = Date.UTC(2026, 5, 3, 12)
    expect(windowStartMs({ kind: 'calendar-week' }, wed)).toBe(Date.UTC(2026, 5, 1))
    // 2026-03-02 (Mon) sits in a week that began the same day.
    expect(windowStartMs({ kind: 'calendar-week' }, Date.UTC(2026, 2, 2, 6))).toBe(
      Date.UTC(2026, 2, 2)
    )
  })

  it('calendar-month handles a year wrap (January → Jan 1)', () => {
    const jan = Date.UTC(2026, 0, 9, 8)
    expect(windowStartMs({ kind: 'calendar-month' }, jan)).toBe(Date.UTC(2026, 0, 1))
  })

  it('rolling subtracts exactly N days', () => {
    expect(windowStartMs({ kind: 'rolling', days: 7 }, WED)).toBe(WED - 7 * 86_400_000)
    expect(windowStartMs({ kind: 'rolling', days: 1 }, WED)).toBe(WED - 86_400_000)
  })

  it('rolling clamps negative days to 0', () => {
    expect(windowStartMs({ kind: 'rolling', days: -3 }, WED)).toBe(WED)
  })
})

describe('keyResetFor', () => {
  it('maps the window to the OpenRouter reset that best backstops it', () => {
    expect(keyResetFor({ kind: 'calendar-week' })).toBe('weekly')
    expect(keyResetFor({ kind: 'calendar-month' })).toBe('monthly')
    // rolling has no calendar equivalent → coarsest provider ceiling
    expect(keyResetFor({ kind: 'rolling', days: 7 })).toBe('monthly')
  })
})

describe('isBudgetWindow', () => {
  it('accepts the three valid shapes', () => {
    expect(isBudgetWindow({ kind: 'calendar-month' })).toBe(true)
    expect(isBudgetWindow({ kind: 'calendar-week' })).toBe(true)
    expect(isBudgetWindow({ kind: 'rolling', days: 14 })).toBe(true)
  })

  it('rejects malformed values', () => {
    expect(isBudgetWindow(null)).toBe(false)
    expect(isBudgetWindow({ kind: 'rolling' })).toBe(false) // missing days
    expect(isBudgetWindow({ kind: 'rolling', days: 0 })).toBe(false) // non-positive
    expect(isBudgetWindow({ kind: 'yearly' })).toBe(false)
    expect(isBudgetWindow('calendar-month')).toBe(false)
  })

  it('DEFAULT_BUDGET_WINDOW is a valid calendar-month window', () => {
    expect(isBudgetWindow(DEFAULT_BUDGET_WINDOW)).toBe(true)
    const w: BudgetWindow = DEFAULT_BUDGET_WINDOW
    expect(w.kind).toBe('calendar-month')
  })
})
