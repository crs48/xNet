/**
 * Statement import (exploration 0187).
 *
 * Pick the account a statement belongs to and a default category, drop in a
 * CSV / OFX / QFX / QIF file, and the rows are parsed, de-duplicated against
 * what's already in the book, and written as balanced transactions in one
 * atomic batch (plus an ImportBatch for provenance). Re-importing the same file
 * is a no-op. The full CSV column-mapping UI is deferred (V1 auto-detects common
 * headers; OFX/QIF are self-describing).
 */

import { TransactionSchema, PostingSchema, ImportBatchSchema } from '@xnetjs/data'
import {
  dedupeRows,
  type LedgerAccount,
  type LedgerTransaction,
  type ImportedRow
} from '@xnetjs/ledger'
import { useMutate } from '@xnetjs/react'
import { useState, type JSX } from 'react'
import { detectAndParseStatement, existingEntriesForAccount } from './finance-data'

interface Parsed {
  filename: string
  source: 'csv' | 'ofx' | 'qif'
  fresh: ImportedRow[]
  duplicates: number
}

export function ImportPanel({
  accounts,
  currency,
  existing,
  onClose
}: {
  accounts: LedgerAccount[]
  currency: string
  existing: LedgerTransaction[]
  onClose: () => void
}): JSX.Element {
  const { mutate, isPending } = useMutate()
  const [targetId, setTargetId] = useState('')
  const [counterId, setCounterId] = useState('')
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)

  const onFile = async (file: File) => {
    setError(null)
    setDone(null)
    if (!targetId) {
      setError('Choose the account this statement belongs to first.')
      return
    }
    const text = await file.text()
    const result = detectAndParseStatement(text, file.name, currency)
    if (!result || result.rows.length === 0) {
      setError(
        'Could not parse this file. Try OFX/QFX or QIF, or a CSV with Date and Amount columns.'
      )
      return
    }
    const { fresh, duplicates } = dedupeRows(
      result.rows,
      existingEntriesForAccount(targetId, existing)
    )
    setParsed({ filename: file.name, source: result.source, fresh, duplicates: duplicates.length })
  }

  const runImport = async () => {
    if (!parsed || !targetId || !counterId) {
      setError('Choose a target account and a category, then select a file.')
      return
    }
    const batchTemp = '~batch'
    const ops: Parameters<typeof mutate>[0] = [
      {
        type: 'create',
        schema: ImportBatchSchema,
        id: batchTemp,
        data: {
          source: parsed.source,
          filename: parsed.filename,
          importedAt: Date.now(),
          account: targetId,
          count: parsed.fresh.length
        }
      }
    ]
    parsed.fresh.forEach((row, i) => {
      const txnTemp = `~txn_${i}`
      ops.push({
        type: 'create',
        schema: TransactionSchema,
        id: txnTemp,
        data: {
          date: row.date,
          payee: row.payee,
          memo: row.memo,
          status: 'cleared',
          externalId: row.externalId,
          importBatch: batchTemp
        }
      })
      // Target account gets the statement's signed delta; the counter account
      // (a category) balances it. Sign convention: positive = debit.
      ops.push({
        type: 'create',
        schema: PostingSchema,
        data: {
          transaction: txnTemp,
          account: targetId,
          amount: { amount: row.amount, currency: row.currency }
        }
      })
      ops.push({
        type: 'create',
        schema: PostingSchema,
        data: {
          transaction: txnTemp,
          account: counterId,
          amount: { amount: -row.amount, currency: row.currency }
        }
      })
    })
    await mutate(ops)
    setDone(parsed.fresh.length)
    setParsed(null)
  }

  const selectClass =
    'rounded-sm border border-hairline bg-surface-0 px-2 py-1 text-xs text-ink-1 outline-none focus:border-ink-3'

  return (
    <div className="border-t border-hairline bg-surface-1 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-ink-1">Import statement</span>
        <button type="button" onClick={onClose} className="text-xs text-ink-3 hover:text-ink-1">
          Close
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-ink-3">Account</span>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className={selectClass}
          >
            <option value="">Select…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-ink-3">Default category</span>
          <select
            value={counterId}
            onChange={(e) => setCounterId(e.target.value)}
            className={selectClass}
          >
            <option value="">Select…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-ink-3">File</span>
          <input
            type="file"
            accept=".csv,.ofx,.qfx,.qif,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
            }}
            className="text-xs text-ink-2 file:mr-2 file:rounded-sm file:border file:border-hairline file:bg-surface-0 file:px-2 file:py-1 file:text-xs file:text-ink-1"
          />
        </label>
      </div>

      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
      {done !== null && (
        <p className="mt-2 text-[11px] text-ink-2">Imported {done} transaction(s).</p>
      )}
      {parsed && (
        <div className="mt-3 flex items-center gap-3">
          <span className="text-xs text-ink-2">
            {parsed.fresh.length} new
            {parsed.duplicates > 0 ? `, ${parsed.duplicates} duplicate(s) skipped` : ''}
          </span>
          <button
            type="button"
            onClick={() => void runImport()}
            disabled={isPending || parsed.fresh.length === 0 || !counterId}
            className="rounded-sm bg-ink-1 px-3 py-1 text-xs font-medium text-surface-0 disabled:opacity-50"
          >
            Import {parsed.fresh.length}
          </button>
        </div>
      )}
    </div>
  )
}
