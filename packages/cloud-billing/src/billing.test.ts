import Stripe from 'stripe'
import { describe, expect, it } from 'vitest'
import { FakeStripeBilling, StripeBillingAdapter, verifyWebhook, type MeterEvent } from './billing'

const ev = (identifier: string, value: string, customerId = 'cus_1'): MeterEvent => ({
  eventName: 'ai_usage_usd',
  customerId,
  value,
  identifier
})

describe('FakeStripeBilling', () => {
  it('aggregates values via sum per customer', async () => {
    const b = new FakeStripeBilling()
    await b.recordMeterEvent(ev('r1', '0.10'))
    await b.recordMeterEvent(ev('r2', '0.25'))
    expect(b.total('ai_usage_usd', 'cus_1')).toBeCloseTo(0.35, 8)
    expect(b.events()).toHaveLength(2)
  })

  it('dedupes by identifier (no double-count on retry)', async () => {
    const b = new FakeStripeBilling()
    await b.recordMeterEvent(ev('r1', '0.10'))
    await b.recordMeterEvent(ev('r1', '0.10')) // redelivered
    expect(b.total('ai_usage_usd', 'cus_1')).toBeCloseTo(0.1, 8)
    expect(b.events()).toHaveLength(1)
  })
})

describe('StripeBillingAdapter', () => {
  it('maps a MeterEvent to the Stripe Billing Meters payload shape', async () => {
    const calls: unknown[] = []
    const stub = {
      billing: { meterEvents: { create: async (p: unknown) => void calls.push(p) } }
    } as unknown as Stripe
    await new StripeBillingAdapter(stub).recordMeterEvent({
      eventName: 'ai_usage_usd',
      customerId: 'cus_42',
      value: '1.50',
      identifier: 't:s:r',
      timestampSec: 1700
    })
    expect(calls[0]).toEqual({
      event_name: 'ai_usage_usd',
      identifier: 't:s:r',
      payload: { stripe_customer_id: 'cus_42', value: '1.50' },
      timestamp: 1700
    })
  })
})

describe('verifyWebhook', () => {
  const stripe = new Stripe('sk_test_123')
  const secret = 'whsec_test'

  it('accepts a validly-signed payload (real HMAC, no network)', () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'customer.subscription.created' })
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret })
    expect(verifyWebhook(stripe, payload, header, secret).type).toBe(
      'customer.subscription.created'
    )
  })

  it('rejects a tampered payload', () => {
    const payload = JSON.stringify({ type: 'customer.subscription.deleted' })
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret })
    expect(() => verifyWebhook(stripe, payload + 'X', header, secret)).toThrow()
  })

  it('rejects the wrong secret', () => {
    const payload = JSON.stringify({ type: 'invoice.paid' })
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret })
    expect(() => verifyWebhook(stripe, payload, header, 'whsec_wrong')).toThrow()
  })
})
