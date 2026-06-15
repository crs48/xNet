import { describe, expect, it } from 'vitest'
import {
  type LedgerAccount,
  type LedgerTransaction,
  isBalanced,
  balancingAmount,
  naturalBalance,
  accountBalances,
  accountRegister,
  trialBalance
} from './balance'

const accounts: LedgerAccount[] = [
  { id: 'checking', name: 'Checking', class: 'asset', currency: 'USD' },
  { id: 'cash', name: 'Cash', class: 'asset', currency: 'USD' },
  { id: 'card', name: 'Credit Card', class: 'liability', currency: 'USD' },
  { id: 'salary', name: 'Salary', class: 'income', currency: 'USD' },
  { id: 'groceries', name: 'Groceries', class: 'expense', currency: 'USD' }
]

const day = (n: number) => Date.UTC(2026, 0, n)

// $1000 salary into checking
const txnSalary: LedgerTransaction = {
  id: 't1',
  date: day(1),
  payee: 'Employer',
  postings: [
    { account: 'checking', amount: 100000, currency: 'USD' },
    { account: 'salary', amount: -100000, currency: 'USD' }
  ]
}
// $40 groceries from checking
const txnGroceries: LedgerTransaction = {
  id: 't2',
  date: day(3),
  payee: 'Grocery Store',
  postings: [
    { account: 'groceries', amount: 4000, currency: 'USD' },
    { account: 'checking', amount: -4000, currency: 'USD' }
  ]
}

describe('isBalanced', () => {
  it('accepts postings summing to zero per currency', () => {
    expect(isBalanced(txnSalary.postings)).toBe(true)
    expect(isBalanced(txnGroceries.postings)).toBe(true)
  })

  it('rejects an unbalanced transaction', () => {
    expect(
      isBalanced([
        { account: 'checking', amount: 100, currency: 'USD' },
        { account: 'salary', amount: -90, currency: 'USD' }
      ])
    ).toBe(false)
  })

  it('balances per currency independently', () => {
    expect(
      isBalanced([
        { account: 'a', amount: 100, currency: 'USD' },
        { account: 'b', amount: -100, currency: 'USD' },
        { account: 'c', amount: 50, currency: 'EUR' },
        { account: 'd', amount: -50, currency: 'EUR' }
      ])
    ).toBe(true)
  })
})

describe('balancingAmount', () => {
  it('returns the missing leg for a single-currency entry', () => {
    expect(balancingAmount([{ account: 'groceries', amount: 4000, currency: 'USD' }])).toEqual({
      amount: -4000,
      currency: 'USD'
    })
  })
  it('returns null when already balanced or multi-currency', () => {
    expect(balancingAmount(txnSalary.postings)).toBeNull()
    expect(
      balancingAmount([
        { account: 'a', amount: 10, currency: 'USD' },
        { account: 'b', amount: 10, currency: 'EUR' }
      ])
    ).toBeNull()
  })
})

describe('naturalBalance sign convention', () => {
  it('debit-normal classes keep the raw sign; credit-normal flip', () => {
    expect(naturalBalance('asset', 5000)).toBe(5000)
    expect(naturalBalance('expense', 5000)).toBe(5000)
    expect(naturalBalance('liability', -5000)).toBe(5000) // owing more reads positive
    expect(naturalBalance('income', -100000)).toBe(100000) // earned reads positive
    expect(naturalBalance('equity', -200)).toBe(200)
  })
})

describe('accountBalances', () => {
  it('derives each account balance from postings', () => {
    const balances = accountBalances(accounts, [...txnSalary.postings, ...txnGroceries.postings])
    expect(balances.get('checking')!.natural).toBe(96000) // 1000 − 40
    expect(balances.get('salary')!.natural).toBe(100000)
    expect(balances.get('groceries')!.natural).toBe(4000)
    expect(balances.get('cash')!.natural).toBe(0)
  })
})

describe('accountRegister', () => {
  it('lists touching transactions oldest→newest with a running balance', () => {
    const reg = accountRegister(accounts[0], [txnGroceries, txnSalary]) // unsorted input
    expect(reg.map((r) => r.transaction.id)).toEqual(['t1', 't2'])
    expect(reg[0].balance).toBe(100000)
    expect(reg[1].balance).toBe(96000)
  })
})

describe('trialBalance', () => {
  it('debits equal credits for a consistent book', () => {
    const tb = trialBalance(accounts, [...txnSalary.postings, ...txnGroceries.postings])
    expect(tb.balanced).toBe(true)
    expect(tb.totalDebit).toBe(tb.totalCredit)
    // checking +96000 debit, groceries +4000 debit ⇒ 100000 debit;
    // salary 100000 credit ⇒ 100000 credit.
    expect(tb.totalDebit).toBe(100000)
  })
})
