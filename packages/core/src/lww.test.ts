import { describe, expect, it } from 'vitest'
import {
  compareChangeApplicationOrder,
  compareLwwStamps,
  computeLwwTiebreakKey,
  lwwUpdateGuardSql,
  lwwWins,
  type LwwStamp
} from './lww'

const stamp = (
  lamport: number,
  wallTime: number,
  author: string,
  tiebreakKey?: string
): LwwStamp => ({
  lamport,
  wallTime,
  author,
  ...(tiebreakKey !== undefined ? { tiebreakKey } : {})
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

describe('grinding-resistant tiebreak key (exploration 0300)', () => {
  it('when BOTH stamps carry a key, the larger key wins — author is ignored', () => {
    // Attacker holds the lexically-maximal DID but loses because the key,
    // not the DID, decides the tie.
    const attacker = stamp(5, 500, 'did:key:zzzzzzzz', 'aa')
    const victim = stamp(5, 500, 'did:key:zAAAAAAA', 'bb')
    expect(lwwWins(victim, attacker)).toBe(true) // bb > aa despite lower DID
    expect(lwwWins(attacker, victim)).toBe(false)
  })

  it('falls back to author DID when either stamp lacks a key (mixed fleet)', () => {
    // A v4 change (has key) vs a legacy v3 change (no key): both old and new
    // code must agree, so the rule degrades to the author-DID tiebreak.
    const withKey = stamp(5, 500, 'did:key:zA', 'ffff')
    const legacy = stamp(5, 500, 'did:key:zB')
    expect(lwwWins(legacy, withKey)).toBe(true) // zB > zA by author
    expect(lwwWins(withKey, legacy)).toBe(false)
  })

  it('equal keys fall through to the author tiebreak', () => {
    // Same (author,property,value) → same key → author decides (here identical).
    expect(compareLwwStamps(stamp(1, 1, 'did:key:zX', 'kk'), stamp(1, 1, 'did:key:zX', 'kk'))).toBe(
      0
    )
  })

  it('key derivation is deterministic and salts by property + value', () => {
    const a = computeLwwTiebreakKey('did:key:zA', 'title', 'hello')
    expect(a).toBe(computeLwwTiebreakKey('did:key:zA', 'title', 'hello'))
    expect(a).not.toBe(computeLwwTiebreakKey('did:key:zA', 'title', 'world'))
    expect(a).not.toBe(computeLwwTiebreakKey('did:key:zA', 'status', 'hello'))
    expect(a).not.toBe(computeLwwTiebreakKey('did:key:zB', 'title', 'hello'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('no fixed identity wins a majority of ties across many (property,value) pairs', () => {
    // The security property: a single DID does not universally win. Sweep one
    // fixed "attacker" DID against a fixed "victim" DID over many distinct
    // (property, value) tie matchups; wins should be ~half, never ~all.
    const attackerDid = 'did:key:zzzzzzzzzzzzzzzz'
    const victimDid = 'did:key:zAAAAAAAAAAAAAAAA'
    let attackerWins = 0
    const N = 400
    for (let i = 0; i < N; i++) {
      const key = `prop-${i}`
      const value = `value-${i}`
      const atk = computeLwwTiebreakKey(attackerDid, key, value)
      const vic = computeLwwTiebreakKey(victimDid, key, value)
      if (atk > vic) attackerWins++
    }
    // Under the OLD rule the attacker (max DID) won 100%. Under the new rule
    // it is a coin flip per matchup — assert it is nowhere near universal.
    expect(attackerWins).toBeGreaterThan(N * 0.3)
    expect(attackerWins).toBeLessThan(N * 0.7)
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

  it('emits the tiebreak-key rung when a key column is supplied', () => {
    const sql = lwwUpdateGuardSql({
      table: 'node_properties',
      lamportColumn: 'lamport_time',
      wallTimeColumn: 'updated_at',
      authorColumn: 'updated_by',
      tiebreakKeyColumn: 'tiebreak_key'
    })
    // Larger key wins when both present…
    expect(sql).toContain('excluded.tiebreak_key > node_properties.tiebreak_key')
    // …else author decides.
    expect(sql).toContain('excluded.updated_by > node_properties.updated_by')
    expect(sql).toContain('IS NOT NULL')
  })
})
