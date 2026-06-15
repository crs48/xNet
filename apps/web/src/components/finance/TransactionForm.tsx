/**
 * Smart transaction entry (exploration 0187).
 *
 * The user thinks "From → To, amount"; underneath we write a balanced journal
 * entry. Sign convention (positive = debit): the destination account is debited
 * (+X), the source credited (−X). That single rule is correct for expenses,
 * income, transfers, and debt payments alike. The Transaction and both Postings
 * commit in one atomic `mutate` batch, so the book is never persisted
 * unbalanced.
 */

import { TransactionSchema, PostingSchema } from '@xnetjs/data'
import { parseAmount, formatAmount, type LedgerAccount } from '@xnetjs/ledger'
import { useMutate } from '@xnetjs/react'
import { useMemo, useState, type JSX } from 'react'

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function isoToUtcMidnight(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1)
}

export function TransactionForm({
  accounts,
  onDone
}: {
  accounts: LedgerAccount[]
  onDone?: () => void
}): JSX.Element {
  const { mutate, isPending } = useMutate()
  const postable = useMemo(() => accounts.filter((a) => a.id), [accounts])

  const [date, setDate] = useState(todayIso())
  const [payee, setPayee] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const currency = postable.find((a) => a.id === fromId)?.currency ?? 'USD'
  const minor = parseAmount(amountStr, currency)
  const preview = minor !== null && minor > 0 ? formatAmount(minor, currency) : null

  const submit = async () => {
    setError(null)
    if (minor === null || minor <= 0) {
      setError('Enter a positive amount.')
      return
    }
    if (!fromId || !toId) {
      setError('Choose both a "from" and a "to" account.')
      return
    }
    if (fromId === toId) {
      setError('"From" and "to" must differ.')
      return
    }
    const txnId = '~txn'
    await mutate([
      {
        type: 'create',
        schema: TransactionSchema,
        id: txnId,
        data: {
          date: isoToUtcMidnight(date),
          payee: payee.trim() || undefined,
          status: 'cleared'
        }
      },
      {
        type: 'create',
        schema: PostingSchema,
        data: { transaction: txnId, account: toId, amount: { amount: minor, currency } }
      },
      {
        type: 'create',
        schema: PostingSchema,
        data: { transaction: txnId, account: fromId, amount: { amount: -minor, currency } }
      }
    ])
    setPayee('')
    setAmountStr('')
    onDone?.()
  }

  const inputClass =
    'rounded-sm border border-hairline bg-surface-0 px-2 py-1 text-xs text-ink-1 outline-none focus:border-ink-3'

  return (
    <form
      className="flex flex-col gap-2 rounded-md border border-hairline bg-surface-1 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-ink-3">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-ink-3">Amount</span>
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] uppercase tracking-wide text-ink-3">Payee</span>
        <input
          placeholder="Who was paid?"
          value={payee}
          onChange={(e) => setPayee(e.target.value)}
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-ink-3">From (paid with)</span>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {postable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-ink-3">To (category)</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className={inputClass}>
            <option value="">Select…</option>
            {postable.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-[11px] text-red-500">{error}</p>}

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-3">{preview ? `Records ${preview}` : ' '}</span>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-sm bg-ink-1 px-3 py-1 text-xs font-medium text-surface-0 disabled:opacity-50"
        >
          Add transaction
        </button>
      </div>
    </form>
  )
}
