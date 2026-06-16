import { describe, expect, it } from 'vitest'
import {
  fingerprint,
  normalizePayee,
  dedupeRows,
  matchCandidates,
  type ImportedRow,
  type ExistingEntry
} from './reconcile'

const day = (n: number) => Date.UTC(2026, 0, n)

describe('normalizePayee / fingerprint', () => {
  it('normalizes payees for fuzzy equality', () => {
    expect(normalizePayee('  WHOLE FOODS #123 ')).toBe('whole foods 123')
    expect(normalizePayee(undefined)).toBe('')
  })
  it('fingerprints on day+amount+currency+payee', () => {
    const a = fingerprint({ date: day(1) + 3600_000, amount: -4000, currency: 'USD', payee: 'X' })
    const b = fingerprint({ date: day(1) + 7200_000, amount: -4000, currency: 'USD', payee: 'x' })
    expect(a).toBe(b) // same calendar day, normalized payee
  })
})

describe('dedupeRows', () => {
  const existing: ExistingEntry[] = [
    { id: 'e1', externalId: 'FIT1', date: day(1), amount: -4000, currency: 'USD', payee: 'Store' }
  ]

  it('skips rows matching an existing externalId', () => {
    const incoming: ImportedRow[] = [
      { externalId: 'FIT1', date: day(1), amount: -4000, currency: 'USD', payee: 'Store' },
      { externalId: 'FIT2', date: day(2), amount: -500, currency: 'USD', payee: 'Cafe' }
    ]
    const { fresh, duplicates } = dedupeRows(incoming, existing)
    expect(duplicates.map((r) => r.externalId)).toEqual(['FIT1'])
    expect(fresh.map((r) => r.externalId)).toEqual(['FIT2'])
  })

  it('falls back to fingerprint when no externalId', () => {
    const incoming: ImportedRow[] = [
      { date: day(1), amount: -4000, currency: 'USD', payee: 'store' } // same day/amount/payee
    ]
    const { fresh, duplicates } = dedupeRows(incoming, existing)
    expect(fresh).toHaveLength(0)
    expect(duplicates).toHaveLength(1)
  })

  it('de-dupes the incoming batch against itself', () => {
    const incoming: ImportedRow[] = [
      { date: day(5), amount: -100, currency: 'USD', payee: 'A' },
      { date: day(5), amount: -100, currency: 'USD', payee: 'A' }
    ]
    const { fresh, duplicates } = dedupeRows(incoming, [])
    expect(fresh).toHaveLength(1)
    expect(duplicates).toHaveLength(1)
  })
})

describe('matchCandidates', () => {
  const existing: ExistingEntry[] = [
    { id: 'e1', date: day(10), amount: -4000, currency: 'USD', payee: 'Whole Foods' },
    { id: 'e2', date: day(2), amount: -4000, currency: 'USD', payee: 'Other' },
    { id: 'e3', date: day(10), amount: -999, currency: 'USD', payee: 'Whole Foods' }
  ]

  it('matches same amount+currency within the date window, payee match first', () => {
    const row: ImportedRow = { date: day(11), amount: -4000, currency: 'USD', payee: 'whole foods' }
    const cands = matchCandidates(row, existing, 4)
    expect(cands.map((c) => c.entry.id)).toEqual(['e1']) // e2 outside window, e3 wrong amount
    expect(cands[0].payeeMatch).toBe(true)
  })

  it('returns empty when nothing matches → a new transaction', () => {
    const row: ImportedRow = { date: day(11), amount: -1, currency: 'USD' }
    expect(matchCandidates(row, existing)).toHaveLength(0)
  })
})
