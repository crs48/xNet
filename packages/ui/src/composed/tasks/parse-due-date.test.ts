import { describe, expect, it } from 'vitest'
import { detectTrailingDueDate, parseDueDate } from './parse-due-date'

// Reference "now": Friday, 2026-06-12 (UTC). All expectations are relative.
const NOW = Date.UTC(2026, 5, 12)
const iso = (input: string) => parseDueDate(input, NOW)?.iso ?? null

describe('parseDueDate', () => {
  it('resolves keyword phrases', () => {
    expect(iso('today')).toBe('2026-06-12')
    expect(iso('tonight')).toBe('2026-06-12')
    expect(iso('tomorrow')).toBe('2026-06-13')
    expect(iso('tmrw')).toBe('2026-06-13')
    expect(iso('yesterday')).toBe('2026-06-11')
    expect(iso('next week')).toBe('2026-06-19')
    expect(iso('next month')).toBe('2026-07-12')
  })

  it('resolves "this weekend" to the upcoming Saturday', () => {
    expect(iso('this weekend')).toBe('2026-06-13')
    expect(iso('weekend')).toBe('2026-06-13')
  })

  it('resolves weekdays (upcoming; "next" skips today)', () => {
    expect(iso('monday')).toBe('2026-06-15')
    expect(iso('friday')).toBe('2026-06-12') // today is Friday
    expect(iso('next friday')).toBe('2026-06-19')
    expect(iso('this wednesday')).toBe('2026-06-17')
    expect(iso('sat')).toBe('2026-06-13')
  })

  it('resolves relative offsets', () => {
    expect(iso('in 3 days')).toBe('2026-06-15')
    expect(iso('in a week')).toBe('2026-06-19')
    expect(iso('in 2 weeks')).toBe('2026-06-26')
    expect(iso('in 1 month')).toBe('2026-07-12')
  })

  it('resolves explicit ISO, numeric, and month-name dates', () => {
    expect(iso('2026-06-20')).toBe('2026-06-20')
    expect(iso('6/20')).toBe('2026-06-20')
    expect(iso('12/25/2026')).toBe('2026-12-25')
    expect(iso('jun 20')).toBe('2026-06-20')
    expect(iso('june 20 2026')).toBe('2026-06-20')
    expect(iso('20 jun')).toBe('2026-06-20')
    expect(iso('dec 25, 2026')).toBe('2026-12-25')
  })

  it('rolls a past month/day forward to next year', () => {
    expect(iso('6/1')).toBe('2027-06-01') // June 1 already passed
    expect(iso('jan 5')).toBe('2027-01-05')
  })

  it('tolerates leading "due"/"by"', () => {
    expect(iso('due friday')).toBe('2026-06-12')
    expect(iso('by tomorrow')).toBe('2026-06-13')
  })

  it('returns null for non-dates', () => {
    expect(iso('')).toBeNull()
    expect(iso('ship the feature')).toBeNull()
    expect(iso('version 2')).toBeNull()
    expect(iso('2/3 of the work')).toBeNull()
    expect(iso('42')).toBeNull()
  })

  it('rejects impossible calendar days', () => {
    expect(iso('2026-02-31')).toBeNull()
    expect(iso('13/40')).toBeNull()
  })
})

describe('detectTrailingDueDate', () => {
  it('finds a date phrase at the end and reports its span', () => {
    const text = 'ship the build friday'
    const match = detectTrailingDueDate(text, NOW)
    expect(match?.iso).toBe('2026-06-12')
    expect(match?.text).toBe('friday')
    expect(text.slice(match!.start, match!.end)).toBe('friday')
  })

  it('prefers the longest trailing phrase', () => {
    const match = detectTrailingDueDate('pay rent in 3 days', NOW)
    expect(match?.iso).toBe('2026-06-15')
    expect(match?.text).toBe('in 3 days')
  })

  it('ignores dates that are not at the end', () => {
    expect(detectTrailingDueDate('review 2/3 of the items', NOW)).toBeNull()
    expect(detectTrailingDueDate('just a normal title', NOW)).toBeNull()
  })

  it('ignores trailing whitespace when measuring the span', () => {
    const match = detectTrailingDueDate('call mom tomorrow   ', NOW)
    expect(match?.iso).toBe('2026-06-13')
    expect(match?.text).toBe('tomorrow')
  })
})
