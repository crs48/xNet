import type { LedgerAccount, LedgerTransaction } from './balance'
import { describe, expect, it } from 'vitest'
import { netWorth, incomeStatement, balanceSheet, spendingByCategory } from './report'

const accounts: LedgerAccount[] = [
  { id: 'checking', name: 'Checking', class: 'asset', currency: 'USD' },
  { id: 'card', name: 'Credit Card', class: 'liability', currency: 'USD' },
  { id: 'open', name: 'Opening Balances', class: 'equity', currency: 'USD' },
  { id: 'salary', name: 'Salary', class: 'income', currency: 'USD' },
  { id: 'rent', name: 'Rent', class: 'expense', currency: 'USD' },
  { id: 'food', name: 'Food', class: 'expense', currency: 'USD' }
]

const day = (n: number) => Date.UTC(2026, 0, n)

const txns: LedgerTransaction[] = [
  // Opening: $500 in checking against equity
  {
    id: 'open',
    date: day(1),
    postings: [
      { account: 'checking', amount: 50000, currency: 'USD' },
      { account: 'open', amount: -50000, currency: 'USD' }
    ]
  },
  // Salary $3000
  {
    id: 'sal',
    date: day(2),
    postings: [
      { account: 'checking', amount: 300000, currency: 'USD' },
      { account: 'salary', amount: -300000, currency: 'USD' }
    ]
  },
  // Rent $1200 on credit card
  {
    id: 'rent',
    date: day(3),
    postings: [
      { account: 'rent', amount: 120000, currency: 'USD' },
      { account: 'card', amount: -120000, currency: 'USD' }
    ]
  },
  // Food $300 from checking
  {
    id: 'food',
    date: day(4),
    postings: [
      { account: 'food', amount: 30000, currency: 'USD' },
      { account: 'checking', amount: -30000, currency: 'USD' }
    ]
  }
]

describe('netWorth', () => {
  it('= assets − liabilities per currency', () => {
    const nw = netWorth(accounts, txns)
    expect(nw.assets.get('USD')).toBe(320000) // 500 + 3000 − 300
    expect(nw.liabilities.get('USD')).toBe(120000) // rent on card
    expect(nw.net.get('USD')).toBe(200000) // 3200 − 1200
  })
})

describe('incomeStatement', () => {
  it('income − expense over the full period', () => {
    const is = incomeStatement(accounts, txns)
    expect(is.income.get('USD')).toBe(300000)
    expect(is.expense.get('USD')).toBe(150000) // rent 1200 + food 300
    expect(is.net.get('USD')).toBe(150000)
  })

  it('windows by [start,end)', () => {
    // Only day(3) rent should fall in [day(3), day(4))
    const is = incomeStatement(accounts, txns, { start: day(3), end: day(4) })
    expect(is.expense.get('USD')).toBe(120000)
    expect(is.income.get('USD') ?? 0).toBe(0)
  })
})

describe('balanceSheet identity', () => {
  it('assets = liabilities + equity + retained earnings', () => {
    const bs = balanceSheet(accounts, txns)
    expect(bs.assets.get('USD')).toBe(320000)
    expect(bs.liabilities.get('USD')).toBe(120000)
    expect(bs.equity.get('USD')).toBe(50000)
    expect(bs.retainedEarnings.get('USD')).toBe(150000) // income − expense
    expect(bs.liabilitiesAndEquity.get('USD')).toBe(320000)
    expect(bs.balanced).toBe(true)
  })
})

describe('spendingByCategory', () => {
  it('ranks expense accounts largest first', () => {
    const slices = spendingByCategory(accounts, txns, 'USD')
    expect(slices.map((s) => s.accountId)).toEqual(['rent', 'food'])
    expect(slices[0].amount).toBe(120000)
  })
})
