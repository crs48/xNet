import { describe, expect, it, vi } from 'vitest'
import { WebhookSignatureError } from '../billing-gateway'
import { StripeTenantBillingGateway, type StripeClient } from './stripe-gateway'

const config = {
  webhookSecret: 'whsec',
  priceByPlan: { personal: 'price_p', team: 'price_t' } as Record<string, string>
}

interface FakeOpts {
  existingCustomer?: string | null
  event?: { type: string; data: { object: unknown } }
  throwVerify?: boolean
}

function makeStripe(opts: FakeOpts = {}) {
  const calls: Record<string, unknown> = {}
  const stripe: StripeClient = {
    customers: {
      search: vi.fn(async () => ({
        data: opts.existingCustomer ? [{ id: opts.existingCustomer }] : []
      })),
      create: vi.fn(async (p) => {
        calls.created = p
        return { id: 'cus_new' }
      })
    },
    checkout: {
      sessions: {
        create: vi.fn(async (p) => {
          calls.session = p
          return { url: 'https://checkout.stripe/x' }
        })
      }
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async (p) => {
          calls.portal = p
          return { url: 'https://portal.stripe/x' }
        })
      }
    },
    webhooks: {
      constructEvent: vi.fn(() => {
        if (opts.throwVerify) throw new Error('bad signature')
        return opts.event ?? { type: 'unknown', data: { object: {} } }
      })
    }
  }
  return { stripe, calls }
}

const gw = (s: StripeClient) => new StripeTenantBillingGateway(s, config)

describe('StripeTenantBillingGateway', () => {
  it('creates a customer + subscription checkout keyed by customerRef', async () => {
    const { stripe, calls } = makeStripe({ existingCustomer: null })
    const out = await gw(stripe).createCheckout({
      customerRef: 'user_a',
      plan: 'personal',
      successUrl: 's',
      cancelUrl: 'c',
      email: 'a@x'
    })
    expect(out).toEqual({ url: 'https://checkout.stripe/x', externalRef: 'cus_new' })
    expect((calls.created as { metadata: unknown }).metadata).toEqual({ customerRef: 'user_a' })
    const session = calls.session as {
      line_items: { price: string }[]
      metadata: unknown
      subscription_data: { metadata: unknown }
    }
    expect(session.line_items[0].price).toBe('price_p')
    expect(session.metadata).toEqual({ customerRef: 'user_a', plan: 'personal' })
    expect(session.subscription_data.metadata).toEqual({ customerRef: 'user_a', plan: 'personal' })
  })

  it('reuses an existing customer', async () => {
    const { stripe } = makeStripe({ existingCustomer: 'cus_existing' })
    const out = await gw(stripe).createCheckout({
      customerRef: 'user_a',
      plan: 'team',
      successUrl: 's',
      cancelUrl: 'c'
    })
    expect(out.externalRef).toBe('cus_existing')
    expect(stripe.customers.create).not.toHaveBeenCalled()
  })

  it('rejects a plan with no configured price', async () => {
    const { stripe } = makeStripe()
    await expect(
      gw(stripe).createCheckout({
        customerRef: 'u',
        plan: 'family',
        successUrl: 's',
        cancelUrl: 'c'
      })
    ).rejects.toThrow(/No Stripe price/)
  })

  it('opens the portal for a found customer and throws when none exists', async () => {
    const found = makeStripe({ existingCustomer: 'cus_x' })
    expect(
      (await gw(found.stripe).createPortal({ customerRef: 'u', returnUrl: 'r' })).url
    ).toContain('portal.stripe')
    const none = makeStripe({ existingCustomer: null })
    await expect(
      gw(none.stripe).createPortal({ customerRef: 'u', returnUrl: 'r' })
    ).rejects.toThrow(/No Stripe customer/)
  })

  it('maps checkout + cancel webhooks, ignores others, rejects bad signatures', async () => {
    const checkout = makeStripe({
      event: {
        type: 'checkout.session.completed',
        data: { object: { metadata: { customerRef: 'user_a', plan: 'personal' } } }
      }
    })
    expect(await gw(checkout.stripe).parseWebhook('{}', { 'stripe-signature': 'sig' })).toEqual({
      type: 'checkout.completed',
      customerRef: 'user_a',
      plan: 'personal'
    })

    const cancel = makeStripe({
      event: {
        type: 'customer.subscription.deleted',
        data: { object: { metadata: { customerRef: 'user_a' } } }
      }
    })
    expect(await gw(cancel.stripe).parseWebhook('{}', { 'stripe-signature': 'sig' })).toEqual({
      type: 'subscription.canceled',
      customerRef: 'user_a'
    })

    const other = makeStripe({ event: { type: 'invoice.paid', data: { object: {} } } })
    expect(await gw(other.stripe).parseWebhook('{}', {})).toEqual({ type: 'ignored' })

    const bad = makeStripe({ throwVerify: true })
    await expect(gw(bad.stripe).parseWebhook('{}', { 'stripe-signature': 'sig' })).rejects.toThrow(
      WebhookSignatureError
    )
  })
})
