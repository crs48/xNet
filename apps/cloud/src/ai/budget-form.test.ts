import { describe, expect, it } from 'vitest'
import { parseAiBudgetForm } from './budget-form'

describe('parseAiBudgetForm', () => {
  it('parses a monthly cap', () => {
    expect(parseAiBudgetForm({ cap: '10', window: 'calendar-month' })).toEqual({
      ok: true,
      budget: { capUsd: 10, window: { kind: 'calendar-month' } }
    })
  })

  it('parses a weekly cap', () => {
    expect(parseAiBudgetForm({ cap: '5', window: 'calendar-week' })).toEqual({
      ok: true,
      budget: { capUsd: 5, window: { kind: 'calendar-week' } }
    })
  })

  it('parses a rolling-N cap and floors the day count', () => {
    expect(parseAiBudgetForm({ cap: '20', window: 'rolling', rollingDays: '7.9' })).toEqual({
      ok: true,
      budget: { capUsd: 20, window: { kind: 'rolling', days: 7 } }
    })
  })

  it('defaults the window to calendar-month', () => {
    expect(parseAiBudgetForm({ cap: '12' })).toEqual({
      ok: true,
      budget: { capUsd: 12, window: { kind: 'calendar-month' } }
    })
  })

  it('clears the cap on empty or "none"', () => {
    expect(parseAiBudgetForm({ cap: '' })).toEqual({ ok: true, budget: undefined })
    expect(parseAiBudgetForm({ cap: 'none' })).toEqual({ ok: true, budget: undefined })
    expect(parseAiBudgetForm({})).toEqual({ ok: true, budget: undefined })
  })

  it('rejects bad inputs', () => {
    expect(parseAiBudgetForm({ cap: '-5' })).toEqual({ ok: false, error: 'bad_cap' })
    expect(parseAiBudgetForm({ cap: 'abc' })).toEqual({ ok: false, error: 'bad_cap' })
    expect(parseAiBudgetForm({ cap: '10', window: 'yearly' })).toEqual({
      ok: false,
      error: 'bad_window'
    })
    expect(parseAiBudgetForm({ cap: '10', window: 'rolling', rollingDays: '0' })).toEqual({
      ok: false,
      error: 'bad_days'
    })
  })
})
