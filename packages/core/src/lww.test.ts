import { describe, expect, it } from 'vitest'
import {
  compareChangeApplicationOrder,
  compareLwwStamps,
  lwwUpdateGuardSql,
  lwwWins,
  type LwwStamp
} from './lww'

const stamp = (lamport: number, wallTime: number, author: string): LwwStamp => ({
  lamport,
  wallTime,
  author
})

/**
 * The four golden LWW scenarios from the protocol conformance corpus
 * (exploration 0200; `packages/runtime/src/conformance.test.ts` L1 suite).
 * If these move, the committed vectors under `conformance/vectors/` must be
 * regenerated — do not change the ordering rule here without a protocol bump.
 */
describe('compareLwwStamps (spec §L1.7)', () => {
  it('higher lamport wins regardless of wall time', () => {
    expect(lwwWins(stamp(2, 100, 'did:key:zB'), stamp(1, 999, 'did:key:zA'))).toBe(true)
    expect(lwwWins(stamp(1, 999, 'did:key:zA'), stamp(2, 100, 'did:key:zB'))).toBe(false)
  })

  it('lamport tie falls back to wall time', () => {
    expect(lwwWins(stamp(5, 501, 'did:key:zA'), stamp(5, 500, 'did:key:zB'))).toBe(true)
  })

  it('full tie resolved by higher author DID', () => {
    expect(lwwWins(stamp(5, 500, 'did:key:zB'), stamp(5, 500, 'did:key:zA'))).toBe(true)
    expect(lwwWins(stamp(5, 500, 'did:key:zA'), stamp(5, 500, 'did:key:zB'))).toBe(false)
  })

  it('author tiebreak is UTF-16 code-unit order, not locale collation', () => {
    // 'A' (U+0041) < 'a' (U+0061): the lowercase DID must win. localeCompare
    // would order these the other way in many locales.
    expect(lwwWins(stamp(1, 1, 'did:key:zaaa'), stamp(1, 1, 'did:key:zAAA'))).toBe(true)
    expect(compareLwwStamps(stamp(1, 1, 'did:key:zAAA'), stamp(1, 1, 'did:key:zaaa'))).toBeLessThan(
      0
    )
  })

  it('identical stamps compare equal (incoming does not replace)', () => {
    expect(compareLwwStamps(stamp(3, 3, 'did:key:zX'), stamp(3, 3, 'did:key:zX'))).toBe(0)
    expect(lwwWins(stamp(3, 3, 'did:key:zX'), stamp(3, 3, 'did:key:zX'))).toBe(false)
  })
})

describe('compareChangeApplicationOrder', () => {
  it('orders by lamport then author code units', () => {
    const changes = [
      { lamport: 2, author: 'did:key:zA' },
      { lamport: 1, author: 'did:key:zb' },
      { lamport: 1, author: 'did:key:zB' }
    ]
    const sorted = [...changes].sort(compareChangeApplicationOrder)
    expect(sorted).toEqual([
      { lamport: 1, author: 'did:key:zB' },
      { lamport: 1, author: 'did:key:zb' },
      { lamport: 2, author: 'did:key:zA' }
    ])
  })
})

describe('lwwUpdateGuardSql', () => {
  it('emits the nested lamport/wallTime/author guard', () => {
    const sql = lwwUpdateGuardSql({
      table: 'node_properties',
      lamportColumn: 'lamport_time',
      wallTimeColumn: 'updated_at',
      authorColumn: 'updated_by'
    })
    expect(sql).toContain('excluded.lamport_time > node_properties.lamport_time')
    expect(sql).toContain('excluded.updated_at = node_properties.updated_at')
    expect(sql).toContain('excluded.updated_by > node_properties.updated_by')
  })
})
