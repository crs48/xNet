/**
 * Budget creation (exploration 0190) — budgets previously could only be created
 * by poking the DB; the period (weekly/monthly/yearly) was effectively
 * hardwired. This inline form picks an expense account, a per-period limit, and
 * the period, then writes a Budget node (limit stored as minor-unit money).
 */
import { BudgetSchema } from '@xnetjs/data'
import { toMinorUnits, type LedgerAccount } from '@xnetjs/ledger'
import { useMutate } from '@xnetjs/react'
import { Plus } from 'lucide-react'
import { useState, type JSX } from 'react'

type Period = 'weekly' | 'monthly' | 'yearly'

export function BudgetForm({
  accounts,
  currency
}: {
  accounts: LedgerAccount[]
  currency: string
}): JSX.Element {
  const { create } = useMutate()
  const [open, setOpen] = useState(false)
  const [account, setAccount] = useState('')
  const [limit, setLimit] = useState('')
  const [period, setPeriod] = useState<Period>('monthly')

  const expenseAccounts = accounts.filter((a) => a.class === 'expense')

  const submit = async (): Promise<void> => {
    const major = Number(limit)
    if (!account || !Number.isFinite(major) || major <= 0) return
    await create(BudgetSchema, {
      account,
      limit: { amount: toMinorUnits(major, currency), currency },
      period
    })
    setAccount('')
    setLimit('')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] text-ink-3 transition-colors hover:text-ink-1"
      >
        <Plus size={12} strokeWidth={1.5} /> New budget
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        aria-label="Budget account"
        value={account}
        onChange={(e) => setAccount(e.target.value)}
        className="rounded-sm border border-hairline bg-surface-1 px-1.5 py-0.5 text-[11px] text-ink-2"
      >
        <option value="">Account…</option>
        {expenseAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <input
        type="number"
        aria-label="Budget limit"
        value={limit}
        onChange={(e) => setLimit(e.target.value)}
        placeholder="Limit"
        className="w-20 rounded-sm border border-hairline bg-surface-1 px-1.5 py-0.5 text-right text-[11px] text-ink-1 outline-none"
      />
      <select
        aria-label="Budget period"
        value={period}
        onChange={(e) => setPeriod(e.target.value as Period)}
        className="rounded-sm border border-hairline bg-surface-1 px-1.5 py-0.5 text-[11px] text-ink-2"
      >
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={!account || !limit}
        className="rounded-md border border-hairline px-2 py-0.5 text-[11px] text-ink-1 hover:bg-accent disabled:opacity-40"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-1 text-[11px] text-ink-3 hover:text-ink-1"
      >
        Cancel
      </button>
    </div>
  )
}
