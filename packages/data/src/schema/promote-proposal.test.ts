import { describe, it, expect } from 'vitest'
import {
  DEFAULT_PROMOTION_THRESHOLD,
  proposePromotion,
  proposePromotions
} from './promote-proposal'
import type { SchemaIRI } from './node'

const FROM = 'xnet://xnet.fyi/Contact@1.0.0' as SchemaIRI
const TO = 'xnet://xnet.fyi/Contact@2.0.0' as SchemaIRI
const KEY = 'ext:local/dueDate'

/** `n` rows carrying the overlay key, plus `padding` rows without it. */
function rows(n: number, padding = 0): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (let i = 0; i < n; i++) out.push({ name: `row ${i}`, [KEY]: '2026-08-0' + (i % 9) })
  for (let i = 0; i < padding; i++) out.push({ name: `bare ${i}` })
  return out
}

describe('proposePromotion', () => {
  it('returns null below the threshold', () => {
    expect(proposePromotion(rows(DEFAULT_PROMOTION_THRESHOLD - 1), KEY, FROM, TO)).toBeNull()
  })

  it('proposes at exactly the threshold', () => {
    const proposal = proposePromotion(rows(DEFAULT_PROMOTION_THRESHOLD), KEY, FROM, TO)
    expect(proposal).not.toBeNull()
    expect(proposal?.field).toBe('dueDate')
    expect(proposal?.authority).toBe('local')
    expect(proposal?.count).toBe(DEFAULT_PROMOTION_THRESHOLD)
  })

  it('reports coverage against all rows, not just carriers', () => {
    const proposal = proposePromotion(rows(10, 10), KEY, FROM, TO)
    expect(proposal?.count).toBe(10)
    expect(proposal?.coverage).toBe(0.5)
  })

  it('ignores null and undefined values when counting', () => {
    const mixed = [...rows(DEFAULT_PROMOTION_THRESHOLD), { [KEY]: null }, { [KEY]: undefined }]
    expect(proposePromotion(mixed, KEY, FROM, TO)?.count).toBe(DEFAULT_PROMOTION_THRESHOLD)
  })

  it('honors a custom threshold', () => {
    expect(proposePromotion(rows(3), KEY, FROM, TO, { threshold: 3 })).not.toBeNull()
    expect(proposePromotion(rows(3), KEY, FROM, TO, { threshold: 4 })).toBeNull()
  })

  it('never re-proposes a dismissed key', () => {
    expect(proposePromotion(rows(50), KEY, FROM, TO, { dismissed: [KEY] })).toBeNull()
  })

  it('throws on a malformed overlay key rather than returning null', () => {
    // "absent" and "unreadable" must be different values — a bad key silently
    // reading as below-threshold would hide the caller's bug.
    expect(() => proposePromotion(rows(50), 'dueDate', FROM, TO)).toThrow(/well-formed/)
  })

  describe('the lens it hands back', () => {
    const proposal = proposePromotion(rows(DEFAULT_PROMOTION_THRESHOLD), KEY, FROM, TO)!

    it('moves the overlay key onto the core property', () => {
      expect(proposal.lens.forward({ name: 'Ada', [KEY]: '2026-08-01' })).toEqual({
        name: 'Ada',
        dueDate: '2026-08-01'
      })
    })

    it('round-trips losslessly, so accepting is undoable', () => {
      const original = { name: 'Ada', [KEY]: '2026-08-01' }
      expect(proposal.lens.backward(proposal.lens.forward(original))).toEqual(original)
      expect(proposal.lens.lossless).toBe(true)
    })

    it('carries the source and target IRIs', () => {
      expect(proposal.lens.source).toBe(FROM)
      expect(proposal.lens.target).toBe(TO)
    })
  })
})

describe('proposePromotions', () => {
  it('finds every accumulated overlay key, most-used first', () => {
    const data = [
      ...Array.from({ length: 10 }, () => ({ 'ext:local/dueDate': 'x' })),
      ...Array.from({ length: 20 }, () => ({ 'ext:local/priority': 'high' }))
    ]
    const proposals = proposePromotions(data, FROM, TO)
    expect(proposals.map((p) => p.field)).toEqual(['priority', 'dueDate'])
  })

  it('skips keys that have not accumulated', () => {
    const data = [...rows(10), { 'ext:local/rare': 1 }]
    expect(proposePromotions(data, FROM, TO).map((p) => p.field)).toEqual(['dueDate'])
  })

  it('ignores core properties and malformed ext keys', () => {
    const data = Array.from({ length: 20 }, () => ({
      name: 'Ada',
      status: 'todo',
      'ext:/broken': 1,
      [KEY]: 'x'
    }))
    expect(proposePromotions(data, FROM, TO).map((p) => p.overlayKey)).toEqual([KEY])
  })

  it('returns nothing for rows with no overlay keys at all', () => {
    expect(
      proposePromotions(
        Array.from({ length: 50 }, () => ({ name: 'Ada' })),
        FROM,
        TO
      )
    ).toEqual([])
  })
})
