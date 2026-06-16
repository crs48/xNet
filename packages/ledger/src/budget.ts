/**
 * Budget math (exploration 0187).
 *
 * A budget caps the spend on one expense account over a period. Status compares
 * the period's actual spend (natural expense balance) against the limit. All
 * integer minor units.
 */

import type { LedgerAccount, LedgerTransaction } from './balance'
import { accountBalances } from './balance'
import { collectPostings } from './report'

export interface LedgerBudget {
  id: string
  /** Expense account this budget caps. */
  account: string
  /** Limit in integer minor units. */
  limit: number
  currency: string
}

export interface BudgetStatus {
  budget: LedgerBudget
  /** Actual spend in the window (minor units; never negative). */
  spent: number
  /** limit − spent (negative ⇒ over budget). */
  remaining: number
  /** spent / limit, clamped at 0 (Infinity-safe: 0 when limit is 0). */
  ratio: number
  over: boolean
}

/** Spend on a single account within `[start, end)` (natural balance, ≥ 0). */
export function accountSpend(
  account: LedgerAccount,
  transactions: readonly LedgerTransaction[],
  range?: { start?: number; end?: number }
): number {
  const postings = collectPostings(transactions, range).filter(
    (p) => p.account === account.id && (account.currency ? p.currency === account.currency : true)
  )
  const bal = accountBalances([account], postings).get(account.id)
  const natural = bal?.natural ?? 0
  return Math.max(0, natural)
}

/** Evaluate one budget against the transactions in a window. */
export function budgetStatus(
  budget: LedgerBudget,
  accounts: readonly LedgerAccount[],
  transactions: readonly LedgerTransaction[],
  range?: { start?: number; end?: number }
): BudgetStatus {
  const account = accounts.find((a) => a.id === budget.account)
  const spent = account ? accountSpend(account, transactions, range) : 0
  const remaining = budget.limit - spent
  const ratio = budget.limit > 0 ? spent / budget.limit : 0
  return { budget, spent, remaining, ratio, over: spent > budget.limit }
}

/** Evaluate every budget; convenience wrapper over budgetStatus. */
export function budgetStatuses(
  budgets: readonly LedgerBudget[],
  accounts: readonly LedgerAccount[],
  transactions: readonly LedgerTransaction[],
  range?: { start?: number; end?: number }
): BudgetStatus[] {
  return budgets.map((b) => budgetStatus(b, accounts, transactions, range))
}

/**
 * Calendar-month window `[start, end)` in Unix ms for the month containing
 * `at`, computed in UTC. Returned bounds feed the report/budget `range`.
 */
export function monthRange(at: number): { start: number; end: number } {
  const d = new Date(at)
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
  return { start, end }
}
