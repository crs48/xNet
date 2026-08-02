import { describe, expect, it } from 'vitest'
import { timingSafeEqualStr } from './secret-compare'

describe('timingSafeEqualStr', () => {
  it('accepts an exact match', () => {
    expect(timingSafeEqualStr('s3cret', 's3cret')).toBe(true)
  })

  it('rejects a mismatch, including a shared prefix', () => {
    expect(timingSafeEqualStr('s3crey', 's3cret')).toBe(false)
    expect(timingSafeEqualStr('s3cret-extra', 's3cret')).toBe(false)
    expect(timingSafeEqualStr('s3cre', 's3cret')).toBe(false)
  })

  // A missing header must never authenticate against an unconfigured secret —
  // otherwise a control plane with no secret set would accept every caller.
  it.each([
    [undefined, 's3cret'],
    [null, 's3cret'],
    ['', 's3cret'],
    ['s3cret', undefined],
    ['s3cret', ''],
    [undefined, undefined],
    ['', '']
  ])('rejects absent or empty inputs (%p vs %p)', (a, b) => {
    expect(timingSafeEqualStr(a, b)).toBe(false)
  })

  it('handles multi-byte characters without throwing', () => {
    expect(timingSafeEqualStr('sécret🔑', 'sécret🔑')).toBe(true)
    expect(timingSafeEqualStr('sécret🔑', 'sécret🔒')).toBe(false)
  })
})
