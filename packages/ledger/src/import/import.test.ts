import { describe, expect, it } from 'vitest'
import { importCsv, parseCsv } from './csv'
import { importOfx } from './ofx'
import { importQif } from './qif'

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d)

describe('parseCsv tokenizer', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    const rows = parseCsv('a,"b,c","d""e"\n1,2,3')
    expect(rows[0]).toEqual(['a', 'b,c', 'd"e'])
    expect(rows[1]).toEqual(['1', '2', '3'])
  })
})

describe('importCsv', () => {
  it('maps a signed-amount CSV by header name', () => {
    const csv = [
      'Date,Description,Amount',
      '2026-01-05,Grocery Store,-40.00',
      '2026-01-06,Paycheck,1500.00'
    ].join('\n')
    const { rows, skipped } = importCsv(csv, {
      date: 'Date',
      payee: 'Description',
      amount: 'Amount',
      currency: 'USD'
    })
    expect(skipped).toEqual([])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ date: day(2026, 1, 5), amount: -4000, payee: 'Grocery Store' })
    expect(rows[1].amount).toBe(150000)
  })

  it('combines separate debit/credit columns (credit = money in)', () => {
    const csv = [
      'Date,Payee,Debit,Credit',
      '01/05/2026,Coffee,4.50,',
      '01/06/2026,Refund,,12.00'
    ].join('\n')
    const { rows } = importCsv(csv, {
      date: 'Date',
      payee: 'Payee',
      debit: 'Debit',
      credit: 'Credit',
      currency: 'USD'
    })
    expect(rows[0].amount).toBe(-450) // debit → outflow
    expect(rows[1].amount).toBe(1200) // credit → inflow
  })

  it('supports index-based mapping without a header', () => {
    const { rows } = importCsv('2026-02-01,Rent,-1200.00', {
      hasHeader: false,
      date: 0,
      payee: 1,
      amount: 2,
      currency: 'USD'
    })
    expect(rows[0]).toMatchObject({ date: day(2026, 2, 1), amount: -120000, payee: 'Rent' })
  })

  it('records skipped rows with unparseable dates', () => {
    const csv = ['Date,Amount', 'not-a-date,5.00', '2026-01-01,6.00'].join('\n')
    const { rows, skipped } = importCsv(csv, { date: 'Date', amount: 'Amount', currency: 'USD' })
    expect(rows).toHaveLength(1)
    expect(skipped).toEqual([2]) // 1-based source line of the bad row
  })
})

describe('importOfx', () => {
  it('parses STMTTRN blocks and the statement currency', () => {
    const ofx = `
OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>USD
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260105120000<TRNAMT>-40.00<FITID>ABC123<NAME>Grocery Store<MEMO>card</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260106<TRNAMT>1500.00<FITID>ABC124<NAME>Paycheck</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
    const { rows, currency } = importOfx(ofx)
    expect(currency).toBe('USD')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      externalId: 'ABC123',
      date: day(2026, 1, 5),
      amount: -4000,
      payee: 'Grocery Store',
      memo: 'card'
    })
    expect(rows[1].amount).toBe(150000)
  })
})

describe('importQif', () => {
  it('parses ^-separated records', () => {
    const qif = [
      '!Type:Bank',
      'D01/05/2026',
      'T-40.00',
      'PGrocery Store',
      'MMemo',
      'N100',
      '^',
      'D01/06/2026',
      'T1500.00',
      'PPaycheck',
      '^'
    ].join('\n')
    const { rows } = importQif(qif, 'USD')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      date: day(2026, 1, 5),
      amount: -4000,
      payee: 'Grocery Store',
      memo: 'Memo',
      externalId: '100'
    })
    expect(rows[1].amount).toBe(150000)
  })

  it('tolerates a missing trailing ^', () => {
    const qif = ['D01/01/2026', 'T-5.00', 'PCoffee'].join('\n')
    const { rows } = importQif(qif, 'USD')
    expect(rows).toHaveLength(1)
  })
})
