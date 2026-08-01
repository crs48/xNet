import { describe, expect, it } from 'vitest'
import { anonymizeContactPatch, isErased, practiceErasureIds } from './erasure'

describe('erasure', () => {
  it('produces an anonymizing patch with a timestamp', () => {
    const at = Date.UTC(2026, 5, 15)
    const patch = anonymizeContactPatch(at)
    expect(patch).toEqual({
      displayName: 'Erased contact',
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      howWeMet: null,
      piiErasedAt: at
    })
  })

  it('detects an erased contact', () => {
    expect(isErased({ piiErasedAt: 123 })).toBe(true)
    expect(isErased({})).toBe(false)
    expect(isErased({ piiErasedAt: null })).toBe(false)
  })

  describe('practiceErasureIds (0422)', () => {
    const practices = [
      { id: 'p1', from: 'c1', to: 'c2' },
      { id: 'p2', from: 'c3', to: 'c1' },
      { id: 'p3', from: 'c2', to: 'c3' }
    ]

    it('collects practices at either end of the erased contact', () => {
      // Both directions — the claim is about the pair, so which end authored it
      // does not make it less about the erased person.
      expect(practiceErasureIds('c1', practices)).toEqual(['p1', 'p2'])
    })

    it('leaves practices between other people alone', () => {
      expect(practiceErasureIds('c4', practices)).toEqual([])
    })

    it('returns an empty list for a contact with no practices, not a failure', () => {
      expect(practiceErasureIds('c1', [])).toEqual([])
    })
  })
})
