import { describe, it, expect } from 'vitest'
import { crxIdFromKey, crxOriginFromKey } from '../scripts/crx-id.mjs'

describe('crxIdFromKey', () => {
  it('produces a 32-char id in the a–p alphabet', () => {
    // A throwaway SPKI DER (base64) — value is arbitrary; we assert shape + determinism.
    const key =
      'MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAKt2m1r0Xh0Z3wZ0J0mI0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0m0CAwEAAQ=='
    const id = crxIdFromKey(key)
    expect(id).toHaveLength(32)
    expect(id).toMatch(/^[a-p]{32}$/)
  })

  it('is deterministic for a given key', () => {
    const key = Buffer.from('a stable public key blob').toString('base64')
    expect(crxIdFromKey(key)).toBe(crxIdFromKey(key))
  })

  it('changes when the key changes', () => {
    const a = crxIdFromKey(Buffer.from('key-a').toString('base64'))
    const b = crxIdFromKey(Buffer.from('key-b').toString('base64'))
    expect(a).not.toBe(b)
  })

  it('formats the chrome-extension origin the native host allowlists', () => {
    const key = Buffer.from('origin key').toString('base64')
    expect(crxOriginFromKey(key)).toBe(`chrome-extension://${crxIdFromKey(key)}/`)
  })
})
