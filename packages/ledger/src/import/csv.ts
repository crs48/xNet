/**
 * CSV statement import (exploration 0187).
 *
 * Banks export wildly different CSV shapes, so the caller supplies a column
 * mapping (by header name or zero-based index). Amounts parse to exact integer
 * minor units; the output uses the ImportedRow convention (positive = money in).
 */

import type { ImportedRow } from '../reconcile'
import { parseAmount } from '../currency'
import { parseStatementDate } from './dates'

/** A column reference: header name (when `hasHeader`) or zero-based index. */
export type Column = string | number

export interface CsvMapping {
  date: Column
  /** Single signed-amount column (bank convention: outflow negative). */
  amount?: Column
  /** Separate outflow column (positive numbers), if the bank splits them. */
  debit?: Column
  /** Separate inflow column (positive numbers). */
  credit?: Column
  payee?: Column
  memo?: Column
  externalId?: Column
  currency: string
  /** First row is a header (default true). */
  hasHeader?: boolean
  /** Interpret the date as day-first (DD/MM) when ambiguous. */
  dayFirst?: boolean
  /**
   * Flip the sign of the `amount` column. Use when a bank reports spend as a
   * positive number in a single column.
   */
  invert?: boolean
}

/** RFC-4180-ish tokenizer: handles quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length
  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  // Flush the last field/row unless the text ended on a clean newline.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function resolveIndex(col: Column | undefined, header: string[] | null): number | undefined {
  if (col === undefined) return undefined
  if (typeof col === 'number') return col
  if (!header) return undefined
  const idx = header.findIndex((h) => h.trim().toLowerCase() === col.trim().toLowerCase())
  return idx === -1 ? undefined : idx
}

export interface CsvImportResult {
  rows: ImportedRow[]
  /** 1-based source line numbers that could not be parsed (bad/empty date). */
  skipped: number[]
}

/** Parse CSV text into normalized ImportedRows using the column mapping. */
export function importCsv(text: string, mapping: CsvMapping): CsvImportResult {
  const hasHeader = mapping.hasHeader ?? true
  const table = parseCsv(text).filter((r) => r.length > 0 && r.some((c) => c.trim() !== ''))
  const header = hasHeader ? (table.shift() ?? null) : null

  const dateIdx = resolveIndex(mapping.date, header)
  const amountIdx = resolveIndex(mapping.amount, header)
  const debitIdx = resolveIndex(mapping.debit, header)
  const creditIdx = resolveIndex(mapping.credit, header)
  const payeeIdx = resolveIndex(mapping.payee, header)
  const memoIdx = resolveIndex(mapping.memo, header)
  const extIdx = resolveIndex(mapping.externalId, header)

  const rows: ImportedRow[] = []
  const skipped: number[] = []
  const headerOffset = hasHeader ? 2 : 1

  table.forEach((cols, i) => {
    const cell = (idx: number | undefined): string | undefined =>
      idx === undefined ? undefined : cols[idx]?.trim()

    const rawDate = cell(dateIdx)
    const date = rawDate ? parseStatementDate(rawDate, mapping.dayFirst) : null
    if (date === null) {
      skipped.push(i + headerOffset)
      return
    }

    let amount: number | null = null
    if (amountIdx !== undefined) {
      const parsed = parseAmount(cell(amountIdx) ?? '', mapping.currency)
      amount = parsed === null ? null : mapping.invert ? -parsed : parsed
    } else {
      const debit = parseAmount(cell(debitIdx) ?? '', mapping.currency) ?? 0
      const credit = parseAmount(cell(creditIdx) ?? '', mapping.currency) ?? 0
      // credit = money in (+), debit = money out (−)
      amount = Math.abs(credit) - Math.abs(debit)
    }
    if (amount === null) {
      skipped.push(i + headerOffset)
      return
    }

    rows.push({
      externalId: cell(extIdx) || undefined,
      date,
      amount,
      currency: mapping.currency,
      payee: cell(payeeIdx) || undefined,
      memo: cell(memoIdx) || undefined
    })
  })

  return { rows, skipped }
}
