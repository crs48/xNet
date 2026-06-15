import { describe, expect, it } from 'vitest'
import {
  toLedgerAccounts,
  toLedgerTransactions,
  toLedgerBudgets,
  buildSeedOps,
  autoCsvMapping,
  detectAndParseStatement,
  existingEntriesForAccount,
  type Row
} from './finance-data'

describe('finance-data mappers (0187)', () => {
  it('maps accounts and drops invalid classes', () => {
    const rows: Row[] = [
      { id: 'a1', name: 'Checking', class: 'asset', currency: 'USD' },
      { id: 'a2', name: 'Bogus', class: 'nonsense' }
    ]
    const accts = toLedgerAccounts(rows)
    expect(accts).toHaveLength(1)
    expect(accts[0]).toMatchObject({ id: 'a1', class: 'asset', currency: 'USD' })
  })

  it('joins transactions with their postings', () => {
    const txns: Row[] = [{ id: 't1', date: 1, payee: 'Store' }]
    const postings: Row[] = [
      { id: 'p1', transaction: 't1', account: 'exp', amount: { amount: 4000, currency: 'USD' } },
      { id: 'p2', transaction: 't1', account: 'cash', amount: { amount: -4000, currency: 'USD' } }
    ]
    const [t] = toLedgerTransactions(txns, postings)
    expect(t.postings).toHaveLength(2)
    expect(t.postings.reduce((s, p) => s + p.amount, 0)).toBe(0)
  })

  it('maps budgets and skips ones missing a limit', () => {
    const rows: Row[] = [
      { id: 'b1', account: 'exp', limit: { amount: 50000, currency: 'USD' } },
      { id: 'b2', account: 'exp2' }
    ]
    expect(toLedgerBudgets(rows)).toHaveLength(1)
  })

  it('builds seed ops parents-before-children with temp-id parents', () => {
    const ops = buildSeedOps('USD')
    const index = new Map(ops.map((o, i) => [o.id, i]))
    for (const op of ops) {
      const parent = op.data.parent as string | undefined
      if (parent) expect(index.get(parent)!).toBeLessThan(index.get(op.id)!)
    }
    // Every account is created with the chosen currency.
    expect(ops.every((o) => o.data.currency === 'USD')).toBe(true)
  })
})

describe('statement detection + parsing', () => {
  it('auto-maps a generic CSV header', () => {
    const csv = 'Date,Description,Amount\n2026-01-05,Store,-40.00'
    const mapping = autoCsvMapping(csv, 'USD')
    expect(mapping).toMatchObject({ date: 'Date', amount: 'Amount', payee: 'Description' })
  })

  it('detects QIF / OFX / CSV by content', () => {
    expect(
      detectAndParseStatement('!Type:Bank\nD01/05/2026\nT-5.00\n^', 'x.qif', 'USD')?.source
    ).toBe('qif')
    expect(
      detectAndParseStatement(
        '<OFX><STMTTRN><DTPOSTED>20260105<TRNAMT>-5.00</STMTTRN></OFX>',
        's',
        'USD'
      )?.source
    ).toBe('ofx')
    expect(detectAndParseStatement('Date,Amount\n2026-01-05,-5.00', 's.csv', 'USD')?.source).toBe(
      'csv'
    )
  })

  it('returns null for an unmappable CSV', () => {
    expect(detectAndParseStatement('foo,bar\n1,2', 's.csv', 'USD')).toBeNull()
  })

  it('projects existing entries onto an account for dedupe', () => {
    const txns = toLedgerTransactions(
      [{ id: 't1', date: 1, payee: 'Store' }],
      [
        {
          id: 'p1',
          transaction: 't1',
          account: 'cash',
          amount: { amount: -4000, currency: 'USD' }
        },
        { id: 'p2', transaction: 't1', account: 'exp', amount: { amount: 4000, currency: 'USD' } }
      ]
    )
    const entries = existingEntriesForAccount('cash', txns)
    expect(entries).toEqual([{ id: 't1', date: 1, amount: -4000, currency: 'USD', payee: 'Store' }])
  })
})
