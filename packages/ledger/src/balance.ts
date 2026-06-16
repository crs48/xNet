/**
 * Double-entry balancing and account balances (exploration 0187).
 *
 * Sign convention: a posting `amount` is signed integer minor units where
 * **positive = debit, negative = credit**. A transaction is balanced iff its
 * postings sum to zero within each currency. An account's *raw* balance is the
 * signed sum of its postings; its *natural* balance flips sign for credit-normal
 * classes so the number reads the way a human expects (assets/expenses up =
 * positive; liabilities/equity/income up = positive).
 *
 * Balances are always DERIVED here — never stored as a source of truth.
 */

export type AccountClass = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

/** Debit-normal classes: a debit (positive amount) increases them. */
export const DEBIT_NORMAL: ReadonlySet<AccountClass> = new Set<AccountClass>(['asset', 'expense'])

export interface LedgerAccount {
  id: string
  name: string
  class: AccountClass
  code?: string
  /** Account's reporting currency (postings should match). */
  currency?: string
  parent?: string | null
}

/** One leg of a transaction. `amount` is signed minor units (debit +, credit −). */
export interface LedgerPosting {
  account: string
  amount: number
  currency: string
}

export interface LedgerTransaction {
  id: string
  /** Unix ms. */
  date: number
  payee?: string
  memo?: string
  postings: LedgerPosting[]
}

/** Per-currency net of a set of postings (0 for every currency ⇒ balanced). */
export function imbalanceByCurrency(postings: readonly LedgerPosting[]): Map<string, number> {
  const net = new Map<string, number>()
  for (const p of postings) {
    net.set(p.currency, (net.get(p.currency) ?? 0) + p.amount)
  }
  return net
}

/** A transaction is balanced iff its postings sum to 0 within EACH currency. */
export function isBalanced(postings: readonly LedgerPosting[]): boolean {
  for (const net of imbalanceByCurrency(postings).values()) {
    if (net !== 0) return false
  }
  return true
}

/**
 * The single missing leg that would balance a one-currency transaction, or null
 * if already balanced or genuinely multi-currency. Powers "auto-balance" in the
 * entry form: enter one side, the other is implied.
 */
export function balancingAmount(postings: readonly LedgerPosting[]): {
  amount: number
  currency: string
} | null {
  const net = imbalanceByCurrency(postings)
  if (net.size !== 1) return null
  const [currency, total] = [...net.entries()][0]
  if (total === 0) return null
  return { amount: -total, currency }
}

/** Raw (signed) balance of a set of postings — the plain sum of amounts. */
export function rawBalance(postings: readonly LedgerPosting[]): number {
  let sum = 0
  for (const p of postings) sum += p.amount
  return sum
}

/** Flip a raw signed sum into the account class's natural (human) sign. */
export function naturalBalance(cls: AccountClass, rawSum: number): number {
  return DEBIT_NORMAL.has(cls) ? rawSum : -rawSum
}

export interface AccountBalance {
  accountId: string
  /** Signed sum of postings (debit +, credit −). */
  raw: number
  /** Class-adjusted balance (reads positive when the account "has more"). */
  natural: number
  currency: string
}

/**
 * Compute every account's balance from a flat posting list. Postings whose
 * account is unknown are ignored. Currency is taken from the account (falling
 * back to the first posting's currency).
 */
export function accountBalances(
  accounts: readonly LedgerAccount[],
  postings: readonly LedgerPosting[]
): Map<string, AccountBalance> {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  const raw = new Map<string, number>()
  const ccy = new Map<string, string>()
  for (const p of postings) {
    if (!byId.has(p.account)) continue
    raw.set(p.account, (raw.get(p.account) ?? 0) + p.amount)
    if (!ccy.has(p.account)) ccy.set(p.account, p.currency)
  }
  const out = new Map<string, AccountBalance>()
  for (const account of accounts) {
    const r = raw.get(account.id) ?? 0
    out.set(account.id, {
      accountId: account.id,
      raw: r,
      natural: naturalBalance(account.class, r),
      currency: account.currency ?? ccy.get(account.id) ?? 'USD'
    })
  }
  return out
}

export interface RegisterRow {
  transaction: LedgerTransaction
  /** This account's signed posting amount in the transaction. */
  amount: number
  /** Running natural balance of the account through this transaction. */
  balance: number
  currency: string
}

/**
 * Build a register (statement) for one account: every transaction touching it,
 * oldest → newest, with a running natural balance. Ties on date keep input
 * order stable (callers should pre-sort by a stable secondary key if needed).
 */
export function accountRegister(
  account: LedgerAccount,
  transactions: readonly LedgerTransaction[]
): RegisterRow[] {
  const touching: { txn: LedgerTransaction; amount: number; currency: string }[] = []
  for (const txn of transactions) {
    let amount = 0
    let currency = account.currency ?? 'USD'
    let touched = false
    for (const p of txn.postings) {
      if (p.account === account.id) {
        amount += p.amount
        currency = p.currency
        touched = true
      }
    }
    if (touched) touching.push({ txn, amount, currency })
  }
  touching.sort((a, b) => a.txn.date - b.txn.date)

  let running = 0
  return touching.map(({ txn, amount, currency }) => {
    running += naturalBalance(account.class, amount)
    return { transaction: txn, amount, balance: running, currency }
  })
}

export interface TrialBalanceLine {
  accountId: string
  /** Debit column (minor units), 0 if the account is net credit. */
  debit: number
  /** Credit column (minor units), 0 if the account is net debit. */
  credit: number
  currency: string
}

export interface TrialBalance {
  lines: TrialBalanceLine[]
  totalDebit: number
  totalCredit: number
  /** A correct book balances: totalDebit === totalCredit (per currency). */
  balanced: boolean
}

/**
 * Classic trial balance: each account's net raw balance split into a debit or
 * credit column. Totals must match for a self-consistent book.
 */
export function trialBalance(
  accounts: readonly LedgerAccount[],
  postings: readonly LedgerPosting[]
): TrialBalance {
  const balances = accountBalances(accounts, postings)
  const lines: TrialBalanceLine[] = []
  let totalDebit = 0
  let totalCredit = 0
  for (const account of accounts) {
    const bal = balances.get(account.id)
    if (!bal || bal.raw === 0) continue
    const debit = bal.raw > 0 ? bal.raw : 0
    const credit = bal.raw < 0 ? -bal.raw : 0
    totalDebit += debit
    totalCredit += credit
    lines.push({ accountId: account.id, debit, credit, currency: bal.currency })
  }
  return { lines, totalDebit, totalCredit, balanced: totalDebit === totalCredit }
}
