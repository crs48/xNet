import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  verifyGithubSignature,
  verifyPagerDutySignature,
  verifySentrySignature,
  verifyStandardWebhooksSignature,
  verifyStripeSignature,
  verifyUrlToken
} from './webhook-verify'

const NOW = 1_700_000_000

describe('verifyGithubSignature', () => {
  const secret = 'gh-secret'
  const body = JSON.stringify({ action: 'opened' })
  const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`

  it('accepts a valid signature', () => {
    expect(verifyGithubSignature(secret, body, sig)).toBe(true)
  })
  it('rejects a tampered body', () => {
    expect(verifyGithubSignature(secret, body + 'x', sig)).toBe(false)
  })
  it('rejects a missing / malformed header', () => {
    expect(verifyGithubSignature(secret, body, undefined)).toBe(false)
    expect(verifyGithubSignature(secret, body, 'md5=deadbeef')).toBe(false)
  })
  it('returns false (not throws) for a multibyte signature matching code-unit length', () => {
    // 63 ASCII + 1 multibyte char = 64 UTF-16 code units (== hex digest length)
    // but 65 UTF-8 bytes — must not throw RangeError in timingSafeEqual.
    const crafted = `sha256=${'a'.repeat(63)}é`
    expect(() => verifyGithubSignature(secret, body, crafted)).not.toThrow()
    expect(verifyGithubSignature(secret, body, crafted)).toBe(false)
  })
})

describe('verifyStripeSignature', () => {
  const secret = 'whsec_stripe'
  const body = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' })
  const sign = (ts: number) => createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')

  it('accepts a fresh, valid signature', () => {
    const header = `t=${NOW},v1=${sign(NOW)}`
    expect(
      verifyStripeSignature({ secret, rawBody: body, signatureHeader: header, nowSeconds: NOW })
    ).toBe(true)
  })

  it('accepts when one of several v1 candidates matches (rotation)', () => {
    const header = `t=${NOW},v1=deadbeef,v1=${sign(NOW)}`
    expect(
      verifyStripeSignature({ secret, rawBody: body, signatureHeader: header, nowSeconds: NOW })
    ).toBe(true)
  })

  it('rejects an expired timestamp (replay)', () => {
    const old = NOW - 10_000
    const header = `t=${old},v1=${sign(old)}`
    expect(
      verifyStripeSignature({ secret, rawBody: body, signatureHeader: header, nowSeconds: NOW })
    ).toBe(false)
  })

  it('rejects a tampered body', () => {
    const header = `t=${NOW},v1=${sign(NOW)}`
    expect(
      verifyStripeSignature({
        secret,
        rawBody: body + ' ',
        signatureHeader: header,
        nowSeconds: NOW
      })
    ).toBe(false)
  })

  it('rejects missing secret or header', () => {
    expect(
      verifyStripeSignature({ secret: undefined, rawBody: body, signatureHeader: 't=1,v1=x' })
    ).toBe(false)
    expect(verifyStripeSignature({ secret, rawBody: body, signatureHeader: undefined })).toBe(false)
  })
})

describe('verifyStandardWebhooksSignature', () => {
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw' // base64-ish payload
  const body = JSON.stringify({ hello: 'world' })
  const id = 'msg_123'
  const rawKey = Buffer.from(secret.slice('whsec_'.length), 'base64')
  const sign = (ts: number) =>
    createHmac('sha256', rawKey).update(`${id}.${ts}.${body}`).digest('base64')

  it('accepts a valid signature', () => {
    const header = `v1,${sign(NOW)}`
    expect(
      verifyStandardWebhooksSignature({
        secret,
        rawBody: body,
        id,
        timestamp: String(NOW),
        signatureHeader: header,
        nowSeconds: NOW
      })
    ).toBe(true)
  })

  it('accepts a space-delimited list with one match', () => {
    const header = `v1,bm90LXJpZ2h0 v1,${sign(NOW)}`
    expect(
      verifyStandardWebhooksSignature({
        secret,
        rawBody: body,
        id,
        timestamp: String(NOW),
        signatureHeader: header,
        nowSeconds: NOW
      })
    ).toBe(true)
  })

  it('rejects an expired timestamp', () => {
    const old = NOW - 10_000
    expect(
      verifyStandardWebhooksSignature({
        secret,
        rawBody: body,
        id,
        timestamp: String(old),
        signatureHeader: `v1,${sign(old)}`,
        nowSeconds: NOW
      })
    ).toBe(false)
  })

  it('rejects a missing id', () => {
    expect(
      verifyStandardWebhooksSignature({
        secret,
        rawBody: body,
        id: undefined,
        timestamp: String(NOW),
        signatureHeader: `v1,${sign(NOW)}`,
        nowSeconds: NOW
      })
    ).toBe(false)
  })
})

describe('verifySentrySignature', () => {
  const secret = 'sentry-client-secret'
  const body = JSON.stringify({ action: 'created', data: { issue: {} } })
  const sig = createHmac('sha256', secret).update(body).digest('hex')

  it('accepts a valid signature and rejects tampering', () => {
    expect(verifySentrySignature(secret, body, sig)).toBe(true)
    expect(verifySentrySignature(secret, body + 'x', sig)).toBe(false)
    expect(verifySentrySignature(undefined, body, sig)).toBe(false)
    expect(verifySentrySignature(secret, body, undefined)).toBe(false)
  })
})

describe('verifyPagerDutySignature', () => {
  const secret = 'pd-secret'
  const body = JSON.stringify({ event: { event_type: 'incident.triggered' } })
  const hex = createHmac('sha256', secret).update(body).digest('hex')

  it('accepts a valid v1 signature (including rotation lists)', () => {
    expect(verifyPagerDutySignature(secret, body, `v1=${hex}`)).toBe(true)
    expect(verifyPagerDutySignature(secret, body, `v1=deadbeef,v1=${hex}`)).toBe(true)
  })
  it('rejects tampering and missing inputs', () => {
    expect(verifyPagerDutySignature(secret, body + 'x', `v1=${hex}`)).toBe(false)
    expect(verifyPagerDutySignature(secret, body, undefined)).toBe(false)
    expect(verifyPagerDutySignature(undefined, body, `v1=${hex}`)).toBe(false)
  })
})

describe('verifyUrlToken', () => {
  it('accepts a matching token and rejects mismatches', () => {
    expect(verifyUrlToken('tok-abc', 'tok-abc')).toBe(true)
    expect(verifyUrlToken('tok-abc', 'tok-xyz')).toBe(false)
    expect(verifyUrlToken(undefined, 'tok-abc')).toBe(false)
    expect(verifyUrlToken('tok-abc', '')).toBe(false)
  })
})
