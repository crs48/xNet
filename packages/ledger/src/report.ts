/**
 * Financial reports derived from accounts + transactions (exploration 0187).
 *
 * Every figure is grouped by currency — we never silently add unlike currencies
 * (no FX in V1). A single-currency personal book simply has one entry per map.
 * All math is on integer minor units.
 */

import type { AccountClass, LedgerAccount, LedgerTransaction, LedgerPosting } from './balance'
import { accountBalances, naturalBalance } from './balance'

/** Minor units summed per currency. */
export type CurrencyTotals = Map<string, number>

function add(totals: CurrencyTotals, currency: string, amount: number): void {
  totals.set(currency, (totals.get(currency) ?? 0) + amount)
}

/** Flatten all postings out of a transaction list, optionally within a window. */
export function collectPostings(
  transactions: readonly LedgerTransaction[],
  range?: { start?: number; end?: number }
): LedgerPosting[] {
  const out: LedgerPosting[] = []
  for (const txn of transactions) {
    if (range?.start !== undefined && txn.date < range.start) continue
    if (range?.end !== undefined && txn.date >= range.end) continue
    out.push(...txn.postings)
  }
  return out
}

function sumClassNatural(
  accounts: readonly LedgerAccount[],
  postings: readonly LedgerPosting[],
  cls: AccountClass
): CurrencyTotals {
  const balances = accountBalances(accounts, postings)
  const totals: CurrencyTotals = new Map()
  for (const account of accounts) {
    if (account.class !== cls) continue
    const bal = balances.get(account.id)
    if (!bal || bal.natural === 0) continue
    add(totals, bal.currency, bal.natural)
  }
  return totals
}

export interface NetWorth {
  assets: CurrencyTotals
  liabilities: CurrencyTotals
  /** assets − liabilities, per currency. */
  net: CurrencyTotals
}

/** Net worth = total assets − total liabilities (per currency, lifetime). */
export function netWorth(
  accounts: readonly LedgerAccount[],
  transactions: readonly LedgerTransaction[]
): NetWorth {
  const postings = collectPostings(transactions)
  const assets = sumClassNatural(accounts, postings, 'asset')
  const liabilities = sumClassNatural(accounts, postings, 'liability')
  const net: CurrencyTotals = new Map()
  for (const [ccy, v] of assets) add(net, ccy, v)
  for (const [ccy, v] of liabilities) add(net, ccy, -v)
  return { assets, liabilities, net }
}

export interface IncomeStatement {
  income: CurrencyTotals
  expense: CurrencyTotals
  /** income − expense, per currency. */
  net: CurrencyTotals
  /** Per-account breakdown for the period (natural balances). */
  byAccount: { accountId: string; class: AccountClass; amount: number; currency: string }[]
}

/**
 * Income statement over `[start, end)` (Unix ms). Income and expenses are the
 * flows recognized in the window; net is the period's surplus/deficit.
 */
export function incomeStatement(
  accounts: readonly LedgerAccount[],
  transactions: readonly LedgerTransaction[],
  range?: { start?: number; end?: number }
): IncomeStatement {
  const postings = collectPostings(transactions, range)
  const balances = accountBalances(accounts, postings)
  const income: CurrencyTotals = new Map()
  const expense: CurrencyTotals = new Map()
  const byAccount: IncomeStatement['byAccount'] = []
  for (const account of accounts) {
    if (account.class !== 'income' && account.class !== 'expense') continue
    const bal = balances.get(account.id)
    if (!bal || bal.natural === 0) continue
    if (account.class === 'income') add(income, bal.currency, bal.natural)
    else add(expense, bal.currency, bal.natural)
    byAccount.push({
      accountId: account.id,
      class: account.class,
      amount: bal.natural,
      currency: bal.currency
    })
  }
  const net: CurrencyTotals = new Map()
  for (const [ccy, v] of income) add(net, ccy, v)
  for (const [ccy, v] of expense) add(net, ccy, -v)
  return { income, expense, net, byAccount }
}

export interface BalanceSheet {
  assets: CurrencyTotals
  liabilities: CurrencyTotals
  equity: CurrencyTotals
  /** Income − expense to date, folded into equity as retained earnings. */
  retainedEarnings: CurrencyTotals
  /** liabilities + equity + retainedEarnings, per currency (should equal assets). */
  liabilitiesAndEquity: CurrencyTotals
  /** assets === liabilities + equity + retained earnings, per currency. */
  balanced: boolean
}

/**
 * Balance sheet as of `asOf` (Unix ms, exclusive upper bound; omit for
 * lifetime). The fundamental identity — assets = liabilities + equity (with
 * income/expense rolled into retained earnings) — must hold for a sound book.
 */
export function balanceSheet(
  accounts: readonly LedgerAccount[],
  transactions: readonly LedgerTransaction[],
  asOf?: number
): BalanceSheet {
  const postings = collectPostings(transactions, asOf !== undefined ? { end: asOf } : undefined)
  const assets = sumClassNatural(accounts, postings, 'asset')
  const liabilities = sumClassNatural(accounts, postings, 'liability')
  const equity = sumClassNatural(accounts, postings, 'equity')
  const income = sumClassNatural(accounts, postings, 'income')
  const expense = sumClassNatural(accounts, postings, 'expense')
  const retainedEarnings: CurrencyTotals = new Map()
  for (const [ccy, v] of income) add(retainedEarnings, ccy, v)
  for (const [ccy, v] of expense) add(retainedEarnings, ccy, -v)

  const liabilitiesAndEquity: CurrencyTotals = new Map()
  for (const [ccy, v] of liabilities) add(liabilitiesAndEquity, ccy, v)
  for (const [ccy, v] of equity) add(liabilitiesAndEquity, ccy, v)
  for (const [ccy, v] of retainedEarnings) add(liabilitiesAndEquity, ccy, v)

  let balanced = true
  const currencies = new Set([...assets.keys(), ...liabilitiesAndEquity.keys()])
  for (const ccy of currencies) {
    if ((assets.get(ccy) ?? 0) !== (liabilitiesAndEquity.get(ccy) ?? 0)) balanced = false
  }

  return { assets, liabilities, equity, retainedEarnings, liabilitiesAndEquity, balanced }
}

export interface SpendingSlice {
  accountId: string
  amount: number
  currency: string
}

/**
 * Expense breakdown by account over a window, largest first — the data behind a
 * "where did my money go?" pie/bar. One currency at a time.
 */
export function spendingByCategory(
  accounts: readonly LedgerAccount[],
  transactions: readonly LedgerTransaction[],
  currency: string,
  range?: { start?: number; end?: number }
): SpendingSlice[] {
  const postings = collectPostings(transactions, range).filter((p) => p.currency === currency)
  const balances = accountBalances(accounts, postings)
  const slices: SpendingSlice[] = []
  for (const account of accounts) {
    if (account.class !== 'expense') continue
    const bal = balances.get(account.id)
    if (!bal || bal.natural <= 0) continue
    slices.push({ accountId: account.id, amount: bal.natural, currency })
  }
  return slices.sort((a, b) => b.amount - a.amount)
}

export { naturalBalance }
