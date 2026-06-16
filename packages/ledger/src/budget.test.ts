import type { LedgerAccount, LedgerTransaction } from './balance'
import { describe, expect, it } from 'vitest'
import { budgetStatus, accountSpend, monthRange, type LedgerBudget } from './budget'

const accounts: LedgerAccount[] = [
  { id: 'checking', name: 'Checking', class: 'asset', currency: 'USD' },
  { id: 'groceries', name: 'Groceries', class: 'expense', currency: 'USD' }
]

const day = (n: number) => Date.UTC(2026, 0, n)

const spend = (id: string, n: number, amount: number): LedgerTransaction => ({
  id,
  date: day(n),
  postings: [
    { account: 'groceries', amount, currency: 'USD' },
    { account: 'checking', amount: -amount, currency: 'USD' }
  ]
})

const txns = [spend('a', 2, 4000), spend('b', 10, 6000), spend('c', 20, 3000)]

describe('accountSpend', () => {
  it('sums natural expense for an account in a window', () => {
    expect(accountSpend(accounts[1], txns)).toBe(13000)
    expect(accountSpend(accounts[1], txns, monthRange(day(15)))).toBe(13000)
    expect(accountSpend(accounts[1], txns, { start: day(5), end: day(15) })).toBe(6000)
  })
})

describe('budgetStatus', () => {
  const budget: LedgerBudget = { id: 'bg', account: 'groceries', limit: 10000, currency: 'USD' }

  it('reports remaining and over-budget', () => {
    const s = budgetStatus(budget, accounts, txns)
    expect(s.spent).toBe(13000)
    expect(s.remaining).toBe(-3000)
    expect(s.over).toBe(true)
    expect(s.ratio).toBeCloseTo(1.3, 5)
  })

  it('is under budget within a tighter window', () => {
    const s = budgetStatus(budget, accounts, txns, { start: day(1), end: day(5) })
    expect(s.spent).toBe(4000)
    expect(s.remaining).toBe(6000)
    expect(s.over).toBe(false)
  })

  it('ratio is 0 when limit is 0 (no divide-by-zero)', () => {
    const s = budgetStatus({ ...budget, limit: 0 }, accounts, txns)
    expect(s.ratio).toBe(0)
  })
})

describe('monthRange', () => {
  it('returns the UTC calendar month containing the timestamp', () => {
    const r = monthRange(Date.UTC(2026, 5, 15))
    expect(r.start).toBe(Date.UTC(2026, 5, 1))
    expect(r.end).toBe(Date.UTC(2026, 6, 1))
  })
})
