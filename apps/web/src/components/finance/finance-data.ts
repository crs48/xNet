/**
 * Adapters between xNet nodes and @xnetjs/ledger shapes (exploration 0187).
 *
 * The ledger engine is pure and node-agnostic, so the finance surface maps its
 * flat Account / Transaction / Posting / Budget query rows into the plain
 * structures @xnetjs/ledger consumes, and builds the atomic mutation batches it
 * writes back. Keeping this glue in one tested module keeps the view thin.
 */

import type {
  LedgerAccount,
  LedgerTransaction,
  LedgerBudget,
  LedgerPosting,
  ImportedRow,
  ExistingEntry,
  CsvMapping
} from '@xnetjs/ledger'
import { AccountSchema, type MoneyValue } from '@xnetjs/data'
import {
  PERSONAL_CHART,
  chartCreateOrder,
  importCsv,
  importOfx,
  importQif,
  parseCsv
} from '@xnetjs/ledger'

const DEFAULT_CURRENCY = 'USD'

/** A loosely-typed flattened query row (FlatNode). */
export type Row = Record<string, unknown>

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

function asMoney(v: unknown): MoneyValue | undefined {
  if (v && typeof v === 'object') {
    const m = v as Partial<MoneyValue>
    if (typeof m.amount === 'number' && typeof m.currency === 'string') {
      return { amount: m.amount, currency: m.currency }
    }
  }
  return undefined
}

const ACCOUNT_CLASSES = new Set(['asset', 'liability', 'equity', 'income', 'expense'])

/** Map Account query rows → ledger accounts (skips rows with an invalid class). */
export function toLedgerAccounts(rows: readonly Row[]): LedgerAccount[] {
  const out: LedgerAccount[] = []
  for (const r of rows) {
    const cls = str(r.class)
    if (!cls || !ACCOUNT_CLASSES.has(cls)) continue
    out.push({
      id: String(r.id),
      name: str(r.name) ?? 'Account',
      class: cls as LedgerAccount['class'],
      code: str(r.code),
      currency: str(r.currency) ?? DEFAULT_CURRENCY,
      parent: str(r.parent) ?? null
    })
  }
  return out
}

/**
 * Join Transaction + Posting query rows into ledger transactions. Postings are
 * grouped under their `transaction` relation; transactions with no postings are
 * still returned (so a freshly-created shell shows up) but carry no legs.
 */
export function toLedgerTransactions(
  txnRows: readonly Row[],
  postingRows: readonly Row[]
): LedgerTransaction[] {
  const legsByTxn = new Map<string, LedgerPosting[]>()
  for (const p of postingRows) {
    const txnId = str(p.transaction)
    const account = str(p.account)
    const money = asMoney(p.amount)
    if (!txnId || !account || !money) continue
    const legs = legsByTxn.get(txnId) ?? []
    legs.push({ account, amount: money.amount, currency: money.currency })
    legsByTxn.set(txnId, legs)
  }
  return txnRows.map((t) => ({
    id: String(t.id),
    date: num(t.date) ?? 0,
    payee: str(t.payee),
    memo: str(t.memo),
    postings: legsByTxn.get(String(t.id)) ?? []
  }))
}

/** Map Budget query rows → ledger budgets (skips rows missing a limit). */
export function toLedgerBudgets(rows: readonly Row[]): LedgerBudget[] {
  const out: LedgerBudget[] = []
  for (const r of rows) {
    const account = str(r.account)
    const money = asMoney(r.limit)
    if (!account || !money) continue
    out.push({ id: String(r.id), account, limit: money.amount, currency: money.currency })
  }
  return out
}

/** Best-effort header → column map for a generic bank CSV. */
export function autoCsvMapping(text: string, currency: string): CsvMapping | null {
  const [header] = parseCsv(text)
  if (!header) return null
  const find = (...names: string[]): string | undefined =>
    header.find((h) => names.includes(h.trim().toLowerCase()))?.trim()
  const date = find('date', 'transaction date', 'posted date', 'post date')
  if (!date) return null
  const amount = find('amount', 'value')
  const debit = find('debit', 'withdrawal', 'withdrawals', 'money out')
  const credit = find('credit', 'deposit', 'deposits', 'money in')
  if (!amount && !debit && !credit) return null
  return {
    date,
    amount,
    debit,
    credit,
    payee: find('description', 'payee', 'name', 'merchant', 'memo'),
    memo: find('notes', 'memo', 'details'),
    currency
  }
}

/**
 * Detect the statement format from the filename/content and parse it into
 * normalized rows. Returns null when the format can't be parsed (e.g. an
 * un-mappable CSV).
 */
export function detectAndParseStatement(
  text: string,
  filename: string,
  currency: string
): { rows: ImportedRow[]; source: 'csv' | 'ofx' | 'qif' } | null {
  const lower = filename.toLowerCase()
  const head = text.slice(0, 200).toUpperCase()
  if (lower.endsWith('.qif') || head.includes('!TYPE:')) {
    return { rows: importQif(text, currency).rows, source: 'qif' }
  }
  if (
    lower.endsWith('.ofx') ||
    lower.endsWith('.qfx') ||
    head.includes('<OFX') ||
    head.includes('<STMTTRN')
  ) {
    return { rows: importOfx(text, currency).rows, source: 'ofx' }
  }
  const mapping = autoCsvMapping(text, currency)
  if (!mapping) return null
  return { rows: importCsv(text, mapping).rows, source: 'csv' }
}

/**
 * Project ledger transactions onto one account as ExistingEntry rows for import
 * de-duplication: each entry's `amount` is that account's net posting in the
 * transaction (debit-positive = money in).
 */
export function existingEntriesForAccount(
  accountId: string,
  transactions: readonly LedgerTransaction[]
): ExistingEntry[] {
  const out: ExistingEntry[] = []
  for (const txn of transactions) {
    let amount = 0
    let currency = 'USD'
    let touched = false
    for (const p of txn.postings) {
      if (p.account === accountId) {
        amount += p.amount
        currency = p.currency
        touched = true
      }
    }
    if (touched) out.push({ id: txn.id, date: txn.date, amount, currency, payee: txn.payee })
  }
  return out
}

export interface SeedOp {
  type: 'create'
  schema: typeof AccountSchema
  id: string
  data: Record<string, unknown>
}

/**
 * Build the atomic batch that seeds the default personal chart of accounts.
 * Accounts are created parent-before-child; parents are wired with temp IDs
 * (`~acct_<code>`) the transaction layer resolves to real node IDs.
 */
export function buildSeedOps(currency = DEFAULT_CURRENCY): SeedOp[] {
  return chartCreateOrder(PERSONAL_CHART).map((spec) => ({
    type: 'create' as const,
    schema: AccountSchema,
    id: `~acct_${spec.code}`,
    data: {
      name: spec.name,
      class: spec.class,
      code: spec.code,
      currency,
      isGroup: Boolean(spec.group),
      ...(spec.parentCode ? { parent: `~acct_${spec.parentCode}` } : {})
    }
  }))
}
