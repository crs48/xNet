/**
 * Finance workspace (exploration 0187) — a local-first, double-entry personal
 * ledger. A singleton `/finance` surface: the chart of accounts on the left, a
 * running-balance register and quick entry on the right, with net-worth and
 * this-month income/expense summaries derived live by @xnetjs/ledger.
 */

import { AccountSchema, TransactionSchema, PostingSchema, BudgetSchema } from '@xnetjs/data'
import {
  accountBalances,
  accountRegister,
  netWorth,
  incomeStatement,
  budgetStatuses,
  monthRange,
  formatAmount,
  type LedgerAccount,
  type AccountClass
} from '@xnetjs/ledger'
import { useMutate, useQuery } from '@xnetjs/react'
import { Wallet, Plus } from 'lucide-react'
import { useMemo, useState, type JSX } from 'react'
import {
  toLedgerAccounts,
  toLedgerTransactions,
  toLedgerBudgets,
  buildSeedOps,
  type Row
} from './finance-data'
import { ImportPanel } from './ImportPanel'
import { TransactionForm } from './TransactionForm'

const CLASS_ORDER: AccountClass[] = ['asset', 'liability', 'income', 'expense', 'equity']
const CLASS_LABEL: Record<AccountClass, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  income: 'Income',
  expense: 'Expenses',
  equity: 'Equity'
}

function Money({ minor, currency }: { minor: number; currency: string }): JSX.Element {
  const cls = minor < 0 ? 'text-red-500' : 'text-ink-1'
  return <span className={`tabular-nums ${cls}`}>{formatAmount(minor, currency)}</span>
}

function SummaryCard({
  label,
  minor,
  currency,
  accent
}: {
  label: string
  minor: number
  currency: string
  accent?: boolean
}): JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-hairline bg-surface-1 px-3 py-2">
      <span className="text-[10px] uppercase tracking-wide text-ink-3">{label}</span>
      <span
        className={`text-sm font-semibold tabular-nums ${accent ? 'text-ink-1' : 'text-ink-1'}`}
      >
        {formatAmount(minor, currency)}
      </span>
    </div>
  )
}

export function FinanceView(): JSX.Element {
  const { data: accountRows, loading: accountsLoading } = useQuery(AccountSchema, {})
  const { data: txnRows } = useQuery(TransactionSchema, { orderBy: { date: 'desc' } })
  const { data: postingRows } = useQuery(PostingSchema, {})
  const { data: budgetRows } = useQuery(BudgetSchema, {})
  const { mutate, isPending } = useMutate()

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  const accounts = useMemo(
    () => toLedgerAccounts((accountRows ?? []) as unknown as Row[]),
    [accountRows]
  )
  const transactions = useMemo(
    () =>
      toLedgerTransactions(
        (txnRows ?? []) as unknown as Row[],
        (postingRows ?? []) as unknown as Row[]
      ),
    [txnRows, postingRows]
  )
  const budgets = useMemo(
    () => toLedgerBudgets((budgetRows ?? []) as unknown as Row[]),
    [budgetRows]
  )

  const currency = accounts.find((a) => a.currency)?.currency ?? 'USD'
  const balances = useMemo(
    () => accountBalances(accounts, allPostings(transactions)),
    [accounts, transactions]
  )
  const nw = useMemo(() => netWorth(accounts, transactions), [accounts, transactions])
  const period = useMemo(() => monthRange(Date.now()), [])
  const income = useMemo(
    () => incomeStatement(accounts, transactions, period),
    [accounts, transactions, period]
  )
  const budgetRows2 = useMemo(
    () => budgetStatuses(budgets, accounts, transactions, period),
    [budgets, accounts, transactions, period]
  )

  const postable = accounts.filter((a) => a.id)
  const selected = selectedAccountId
    ? (accounts.find((a) => a.id === selectedAccountId) ?? null)
    : null

  const seed = async () => {
    await mutate(buildSeedOps(currency))
  }

  if (!accountsLoading && accounts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Wallet size={28} strokeWidth={1.5} className="text-ink-3" />
        <h2 className="text-sm font-medium text-ink-1">Set up your finances</h2>
        <p className="max-w-xs text-xs text-ink-3">
          Create a starter chart of accounts (checking, savings, income, expenses) to begin
          double-entry tracking. Everything stays private and local-first.
        </p>
        <button
          type="button"
          onClick={() => void seed()}
          disabled={isPending}
          className="rounded-sm bg-ink-1 px-3 py-1.5 text-xs font-medium text-surface-0 disabled:opacity-50"
        >
          Create starter accounts
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
          <Wallet size={14} strokeWidth={1.5} />
          Finance
        </span>
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          className="rounded-sm px-2 py-1 text-xs text-ink-3 hover:bg-accent hover:text-ink-1"
        >
          {showImport ? 'Close import' : 'Import statement'}
        </button>
      </header>

      <div className="grid grid-cols-3 gap-2 px-4 py-3">
        <SummaryCard
          label="Net worth"
          minor={nw.net.get(currency) ?? 0}
          currency={currency}
          accent
        />
        <SummaryCard
          label="Income (this month)"
          minor={income.income.get(currency) ?? 0}
          currency={currency}
        />
        <SummaryCard
          label="Spent (this month)"
          minor={income.expense.get(currency) ?? 0}
          currency={currency}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[18rem_1fr] gap-0 overflow-hidden">
        {/* Chart of accounts */}
        <aside className="min-h-0 overflow-y-auto border-r border-hairline px-2 py-2">
          {CLASS_ORDER.map((cls) => {
            const inClass = accounts.filter((a) => a.class === cls)
            if (inClass.length === 0) return null
            return (
              <div key={cls} className="mb-3">
                <div className="px-2 pb-1 text-[10px] uppercase tracking-wide text-ink-3">
                  {CLASS_LABEL[cls]}
                </div>
                <ul>
                  {inClass.map((a) => {
                    const bal = balances.get(a.id)
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedAccountId(a.id === selectedAccountId ? null : a.id)
                          }
                          className={`flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-accent ${
                            a.id === selectedAccountId ? 'bg-accent text-ink-1' : 'text-ink-2'
                          }`}
                        >
                          <span className="truncate">{a.name}</span>
                          <Money minor={bal?.natural ?? 0} currency={a.currency ?? currency} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </aside>

        {/* Register + entry + budgets */}
        <section className="min-h-0 overflow-y-auto px-4 py-3">
          <div className="mb-4 grid grid-cols-[1fr_18rem] gap-4">
            <RegisterPanel
              selected={selected}
              accounts={postable}
              transactions={transactions}
              currency={currency}
            />
            <div className="flex flex-col gap-3">
              <div className="text-[10px] uppercase tracking-wide text-ink-3">
                Add a transaction
              </div>
              <TransactionForm accounts={postable} onDone={() => undefined} />
            </div>
          </div>

          {budgetRows2.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-ink-3">
                Budgets (this month)
              </div>
              <ul className="flex flex-col gap-1.5">
                {budgetRows2.map((b) => {
                  const acct = accounts.find((a) => a.id === b.budget.account)
                  const pct = Math.min(100, Math.round(b.ratio * 100))
                  return (
                    <li key={b.budget.id} className="rounded-sm border border-hairline px-3 py-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink-2">{acct?.name ?? 'Account'}</span>
                        <span className={b.over ? 'text-red-500' : 'text-ink-3'}>
                          {formatAmount(b.spent, b.budget.currency)} /{' '}
                          {formatAmount(b.budget.limit, b.budget.currency)}
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className={`h-full ${b.over ? 'bg-red-500' : 'bg-ink-2'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      </div>

      {showImport && (
        <ImportPanel
          accounts={postable}
          currency={currency}
          existing={transactions}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}

function RegisterPanel({
  selected,
  accounts,
  transactions,
  currency
}: {
  selected: LedgerAccount | null
  accounts: LedgerAccount[]
  transactions: ReturnType<typeof toLedgerTransactions>
  currency: string
}): JSX.Element {
  const account = selected ?? accounts[0] ?? null
  if (!account) {
    return <p className="text-xs text-ink-3">No accounts yet.</p>
  }
  const rows = accountRegister(account, transactions).slice().reverse() // newest first
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-1">
        <Plus size={12} className="opacity-0" />
        {account.name}
        <span className="text-ink-3">register</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-ink-3">No transactions in this account yet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-3">
              <th className="py-1 font-normal">Date</th>
              <th className="py-1 font-normal">Payee</th>
              <th className="py-1 text-right font-normal">Amount</th>
              <th className="py-1 text-right font-normal">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.transaction.id} className="border-t border-hairline">
                <td className="py-1 text-ink-3 tabular-nums">{formatDay(r.transaction.date)}</td>
                <td className="py-1 text-ink-2">{r.transaction.payee ?? '—'}</td>
                <td className="py-1 text-right tabular-nums">
                  <span className={r.amount < 0 ? 'text-red-500' : 'text-ink-1'}>
                    {formatAmount(r.amount, r.currency || currency)}
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums text-ink-2">
                  {formatAmount(r.balance, r.currency || currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function allPostings(transactions: ReturnType<typeof toLedgerTransactions>) {
  return transactions.flatMap((t) => t.postings)
}

function formatDay(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
}
