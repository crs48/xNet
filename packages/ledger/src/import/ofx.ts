/**
 * OFX / QFX statement import (exploration 0187).
 *
 * OFX is SGML-ish: tags often aren't closed. We don't need a full parser — we
 * scan <STMTTRN> blocks and pull the fields we care about. Works for both OFX
 * 1.x (SGML) and 2.x (XML) since we read tag-prefixed values line by line.
 */

import type { ImportedRow } from '../reconcile'
import { parseAmount } from '../currency'
import { parseOfxDate } from './dates'

/** Read the value following an (often unclosed) OFX tag inside a block. */
function tagValue(block: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i')
  const m = re.exec(block)
  return m ? m[1].trim() : undefined
}

/** Detect the statement currency (CURDEF), defaulting to the supplied fallback. */
export function ofxCurrency(text: string, fallback = 'USD'): string {
  const m = /<CURDEF>([A-Za-z]{3})/i.exec(text)
  return m ? m[1].toUpperCase() : fallback
}

export interface OfxImportResult {
  rows: ImportedRow[]
  currency: string
}

/**
 * Parse OFX/QFX text into normalized ImportedRows. TRNAMT is already signed
 * (negative = money out), matching the ImportedRow convention directly.
 */
export function importOfx(text: string, fallbackCurrency = 'USD'): OfxImportResult {
  const currency = ofxCurrency(text, fallbackCurrency)
  const rows: ImportedRow[] = []
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  for (const raw of blocks) {
    const block = raw.split(/<\/STMTTRN>/i)[0]
    const dateStr = tagValue(block, 'DTPOSTED')
    const amountStr = tagValue(block, 'TRNAMT')
    if (!dateStr || amountStr === undefined) continue
    const date = parseOfxDate(dateStr)
    const amount = parseAmount(amountStr, currency)
    if (date === null || amount === null) continue
    rows.push({
      externalId: tagValue(block, 'FITID'),
      date,
      amount,
      currency,
      payee: tagValue(block, 'NAME') ?? tagValue(block, 'PAYEE'),
      memo: tagValue(block, 'MEMO')
    })
  }
  return { rows, currency }
}
