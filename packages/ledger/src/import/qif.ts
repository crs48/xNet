/**
 * QIF statement import (exploration 0187).
 *
 * QIF records are separated by a line containing only `^`. Each line is a
 * single-letter field code + value: D=date, T/U=amount, P=payee, M=memo,
 * N=number/check, L=category. Amounts are already signed (outflow negative),
 * matching the ImportedRow convention.
 */

import type { ImportedRow } from '../reconcile'
import { parseAmount } from '../currency'
import { parseStatementDate } from './dates'

export interface QifImportResult {
  rows: ImportedRow[]
}

/** Parse QIF text into normalized ImportedRows. */
export function importQif(text: string, currency = 'USD', dayFirst = false): QifImportResult {
  const rows: ImportedRow[] = []
  let cur: Partial<{ date: number; amount: number; payee: string; memo: string; num: string }> = {}

  const flush = () => {
    if (cur.date !== undefined && cur.amount !== undefined) {
      rows.push({
        externalId: cur.num || undefined,
        date: cur.date,
        amount: cur.amount,
        currency,
        payee: cur.payee,
        memo: cur.memo
      })
    }
    cur = {}
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (line === '') continue
    if (line.startsWith('!')) continue // type header, e.g. !Type:Bank
    if (line === '^') {
      flush()
      continue
    }
    const code = line[0]
    const value = line.slice(1).trim()
    switch (code) {
      case 'D': {
        const d = parseStatementDate(value, dayFirst)
        if (d !== null) cur.date = d
        break
      }
      case 'T':
      case 'U': {
        const a = parseAmount(value, currency)
        if (a !== null) cur.amount = a
        break
      }
      case 'P':
        cur.payee = value
        break
      case 'M':
        cur.memo = value
        break
      case 'N':
        cur.num = value
        break
      default:
        break
    }
  }
  flush() // tolerate a missing trailing ^
  return { rows }
}
