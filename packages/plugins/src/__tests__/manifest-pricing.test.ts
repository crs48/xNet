/**
 * Manifest pricing/license/publisherDid validation + isPaidPricing (0196).
 */

import { describe, it, expect } from 'vitest'
import {
  validateManifest,
  defineExtension,
  isPaidPricing,
  PluginValidationError
} from '../manifest'

const base = { id: 'com.acme.pro', name: 'Acme Pro', version: '1.0.0' } as const

describe('isPaidPricing', () => {
  it('is false for undefined and free', () => {
    expect(isPaidPricing(undefined)).toBe(false)
    expect(isPaidPricing({ mode: 'free' })).toBe(false)
  })
  it('is true for one-time and subscription', () => {
    expect(isPaidPricing({ mode: 'one-time', amountMinor: 500, currency: 'USD' })).toBe(true)
    expect(isPaidPricing({ mode: 'subscription', amountMinor: 500, currency: 'USD' })).toBe(true)
  })
})

describe('validateManifest — pricing/license/publisherDid', () => {
  it('accepts a well-formed paid manifest', () => {
    expect(() =>
      defineExtension({
        ...base,
        license: 'FSL-1.1-MIT',
        publisherDid: 'did:key:zPub',
        pricing: { mode: 'one-time', amountMinor: 999, currency: 'USD', billing: 'managed' }
      })
    ).not.toThrow()
  })

  it('accepts a free manifest with no pricing', () => {
    expect(() => defineExtension({ ...base })).not.toThrow()
  })

  it('rejects an unknown pricing mode', () => {
    expect(() => validateManifest({ ...base, pricing: { mode: 'rental' } })).toThrow(
      PluginValidationError
    )
  })

  it('requires a currency when amountMinor > 0', () => {
    expect(() =>
      validateManifest({ ...base, pricing: { mode: 'one-time', amountMinor: 500 } })
    ).toThrow(/currency is required/)
  })

  it('rejects a non-integer amount', () => {
    expect(() =>
      validateManifest({
        ...base,
        pricing: { mode: 'one-time', amountMinor: 9.99, currency: 'USD' }
      })
    ).toThrow(/non-negative integer/)
  })

  it('rejects a malformed currency', () => {
    expect(() =>
      validateManifest({
        ...base,
        pricing: { mode: 'one-time', amountMinor: 5, currency: 'dollars' }
      })
    ).toThrow(/ISO-4217/)
  })

  it('rejects an unknown billing kind', () => {
    expect(() =>
      validateManifest({ ...base, pricing: { mode: 'free', billing: 'paypal' } })
    ).toThrow(/billing must be/)
  })

  it('rejects an empty license and non-string publisherDid', () => {
    expect(() => validateManifest({ ...base, license: '' })).toThrow(/license must be/)
    expect(() => validateManifest({ ...base, publisherDid: 42 })).toThrow(/publisherDid must be/)
  })
})
