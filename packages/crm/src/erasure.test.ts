import { describe, expect, it } from 'vitest'
import { anonymizeContactPatch, isErased } from './erasure'

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
})
