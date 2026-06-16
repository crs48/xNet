import { describe, expect, it } from 'vitest'
import { signStripePayload, verifyStripeSignature } from './stripe-signature'

const SECRET = 'whsec_test'
const BODY = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated' })

describe('verifyStripeSignature', () => {
  it('accepts a freshly signed payload', () => {
    const ts = 1_700_000_000
    const header = signStripePayload(BODY, SECRET, ts)
    expect(verifyStripeSignature(BODY, header, SECRET, { nowSec: ts })).toBe(true)
  })

  it('rejects a payload signed with a different secret', () => {
    const ts = 1_700_000_000
    const header = signStripePayload(BODY, 'other', ts)
    expect(verifyStripeSignature(BODY, header, SECRET, { nowSec: ts })).toBe(false)
  })

  it('rejects a tampered body', () => {
    const ts = 1_700_000_000
    const header = signStripePayload(BODY, SECRET, ts)
    expect(verifyStripeSignature(BODY + ' ', header, SECRET, { nowSec: ts })).toBe(false)
  })

  it('rejects a stale timestamp outside tolerance', () => {
    const ts = 1_700_000_000
    const header = signStripePayload(BODY, SECRET, ts)
    expect(verifyStripeSignature(BODY, header, SECRET, { nowSec: ts + 10_000 })).toBe(false)
  })

  it('honors tolerance=0 (skip freshness check)', () => {
    const ts = 1_000
    const header = signStripePayload(BODY, SECRET, ts)
    expect(
      verifyStripeSignature(BODY, header, SECRET, { nowSec: 9_999_999, toleranceSec: 0 })
    ).toBe(true)
  })

  it('rejects missing/blank header or secret', () => {
    const ts = 1_700_000_000
    const header = signStripePayload(BODY, SECRET, ts)
    expect(verifyStripeSignature(BODY, undefined, SECRET)).toBe(false)
    expect(verifyStripeSignature(BODY, header, '', { nowSec: ts })).toBe(false)
    expect(verifyStripeSignature(BODY, 't=1', SECRET, { nowSec: 1 })).toBe(false)
  })
})
