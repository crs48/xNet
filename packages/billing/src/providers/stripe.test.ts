import type { ProviderEvent } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { createStripeProvider, normalizeStripeEvent } from './stripe'

const NOW = 1_000

const ev = (type: string, object: unknown): ProviderEvent => ({
  id: 'evt',
  type,
  provider: 'stripe',
  data: object
})

describe('normalizeStripeEvent', () => {
  it('maps checkout.session.completed → customer', () => {
    const [m] = normalizeStripeEvent(
      ev('checkout.session.completed', {
        client_reference_id: 'did:key:alice',
        customer: 'cus_1',
        customer_details: { email: 'a@x.io' }
      }),
      NOW
    )
    expect(m).toEqual({
      kind: 'customer',
      data: {
        id: 'cus_1',
        did: 'did:key:alice',
        provider: 'stripe',
        externalRef: 'cus_1',
        email: 'a@x.io',
        updatedAt: NOW
      }
    })
  })

  it('maps subscription.updated → subscription with period + price', () => {
    const [m] = normalizeStripeEvent(
      ev('customer.subscription.updated', {
        id: 'sub_1',
        status: 'past_due',
        metadata: { did: 'did:key:alice' },
        current_period_end: 2_000,
        cancel_at_period_end: true,
        items: { data: [{ price: { id: 'price_pro' } }] }
      }),
      NOW
    )
    expect(m.kind).toBe('subscription')
    expect(m.data).toMatchObject({
      id: 'sub_1',
      status: 'past_due',
      priceRef: 'price_pro',
      currentPeriodEnd: 2_000_000,
      cancelAtPeriodEnd: true
    })
  })

  it('forces canceled status on subscription.deleted', () => {
    const [m] = normalizeStripeEvent(
      ev('customer.subscription.deleted', {
        id: 'sub_1',
        status: 'active',
        metadata: { did: 'did:key:alice' },
        items: { data: [] }
      }),
      NOW
    )
    expect(m.data).toMatchObject({ status: 'canceled' })
  })

  it('maps invoice.paid → invoice with amount + customerRef', () => {
    const [m] = normalizeStripeEvent(
      ev('invoice.paid', {
        id: 'in_1',
        customer: 'cus_1',
        amount_due: 1999,
        currency: 'usd',
        status: 'paid',
        hosted_invoice_url: 'https://pay/x'
      }),
      NOW
    )
    expect(m).toMatchObject({
      kind: 'invoice',
      data: {
        id: 'in_1',
        customerRef: 'cus_1',
        amountDueMinor: 1999,
        currency: 'USD',
        status: 'paid'
      }
    })
  })

  it('maps payment_intent.succeeded → payment', () => {
    const [m] = normalizeStripeEvent(
      ev('payment_intent.succeeded', {
        id: 'pi_1',
        customer: 'cus_1',
        amount: 500,
        currency: 'usd',
        status: 'succeeded',
        metadata: { did: 'did:key:alice' }
      }),
      NOW
    )
    expect(m).toMatchObject({
      kind: 'payment',
      data: { id: 'pi_1', did: 'did:key:alice', amountMinor: 500, status: 'succeeded' }
    })
  })

  it('ignores unrelated event types and incomplete objects', () => {
    expect(normalizeStripeEvent(ev('charge.dispute.created', {}), NOW)).toEqual([])
    expect(
      normalizeStripeEvent(ev('checkout.session.completed', { customer: 'cus_1' }), NOW)
    ).toEqual([])
  })
})

describe('createStripeProvider.createCheckout', () => {
  it('POSTs a form-encoded checkout session and stamps the DID', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout/x' }), { status: 200 })
    )
    const provider = createStripeProvider({
      secretKey: 'sk_test',
      webhookSecret: 'whsec',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    const session = await provider.createCheckout({
      did: 'did:key:alice',
      priceRef: 'price_pro',
      mode: 'subscription',
      successUrl: 'https://app/ok',
      cancelUrl: 'https://app/cancel'
    })
    expect(session).toEqual({ url: 'https://checkout/x', externalRef: 'cs_1' })

    const [, init] = fetchImpl.mock.calls[0]
    const body = String((init as RequestInit).body)
    expect(body).toContain('client_reference_id=did%3Akey%3Aalice')
    expect(body).toContain('subscription_data%5Bmetadata%5D%5Bdid%5D=did%3Akey%3Aalice')
    expect(body).toContain('line_items%5B0%5D%5Bprice%5D=price_pro')
  })

  it('throws when Stripe returns an error status', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response('bad', { status: 400 })
    )
    const provider = createStripeProvider({
      secretKey: 'sk_test',
      webhookSecret: 'whsec',
      fetchImpl: fetchImpl as unknown as typeof fetch
    })
    await expect(
      provider.createCheckout({
        did: 'did:key:alice',
        priceRef: 'price_pro',
        mode: 'subscription',
        successUrl: 'https://app/ok',
        cancelUrl: 'https://app/cancel'
      })
    ).rejects.toThrow(/Stripe .* failed: 400/)
  })
})
