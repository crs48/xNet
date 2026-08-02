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

  it('maps invoice.payment_failed to a dunning payment_failed with the attempt count', async () => {
    // Invoice events carry customerRef under subscription_details.metadata, not top-level.
    const s = makeStripe({
      event: {
        type: 'invoice.payment_failed',
        data: {
          object: {
            subscription_details: { metadata: { customerRef: 'user_a' } },
            attempt_count: 2
          }
        }
      }
    })
    expect(await gw(s.stripe).parseWebhook('{}', { 'stripe-signature': 'sig' })).toEqual({
      type: 'payment_failed',
      customerRef: 'user_a',
      attemptCount: 2
    })
  })

  it('maps invoice.paid to payment_recovered', async () => {
    const s = makeStripe({
      event: {
        type: 'invoice.paid',
        data: { object: { subscription_details: { metadata: { customerRef: 'user_a' } } } }
      }
    })
    expect(await gw(s.stripe).parseWebhook('{}', { 'stripe-signature': 'sig' })).toEqual({
      type: 'payment_recovered',
      customerRef: 'user_a'
    })
  })

  it('maps customer.subscription.updated to a subscription_status with the new status', async () => {
    const s = makeStripe({
      event: {
        type: 'customer.subscription.updated',
        data: { object: { metadata: { customerRef: 'user_a' }, status: 'past_due' } }
      }
    })
    expect(await gw(s.stripe).parseWebhook('{}', { 'stripe-signature': 'sig' })).toEqual({
      type: 'subscription_status',
      customerRef: 'user_a',
      status: 'past_due'
    })
  })

  it('ignores a subscription update with an unrecognized status', async () => {
    const s = makeStripe({
      event: {
        type: 'customer.subscription.updated',
        data: { object: { metadata: { customerRef: 'user_a' }, status: 'trialing' } }
      }
    })
    expect(await gw(s.stripe).parseWebhook('{}', { 'stripe-signature': 'sig' })).toEqual({
      type: 'ignored'
    })
  })
})

/**
 * Seats and tax (exploration 0436 G5/G10).
 *
 * Checkout hard-coded `quantity: 1` against a pricing page advertising
 * `$12/seat/mo` from three seats, and passed no tax parameters at all — so a
 * three-seat Team subscription billed $12 with no VAT, in a business that owes
 * VAT on B2C digital services from the first sale.
 */
describe('seats and tax on checkout', () => {
  const args = {
    customerRef: 'user_a',
    successUrl: 'https://cloud/ok',
    cancelUrl: 'https://cloud/no'
  }

  it('bills the seats asked for, not one', async () => {
    const { stripe, calls } = makeStripe({ existingCustomer: 'cus_1' })
    const gw = new StripeTenantBillingGateway(stripe, config)
    await gw.createCheckout({ ...args, plan: 'team', seats: 3 })
    const session = calls.session as { line_items: Array<{ price: string; quantity: number }> }
    expect(session.line_items).toEqual([{ price: 'price_t', quantity: 3 }])
  })

  // A Team checkout with no explicit seats must not silently become one seat —
  // `team` starts at three, and the margin model assumes three.
  it('defaults a seat-metered plan to its catalog minimum', async () => {
    const { stripe, calls } = makeStripe({ existingCustomer: 'cus_1' })
    const gw = new StripeTenantBillingGateway(stripe, config)
    await gw.createCheckout({ ...args, plan: 'team' })
    expect(
      (calls.session as { line_items: Array<{ quantity: number }> }).line_items[0].quantity
    ).toBe(3)
  })

  it('floors a below-minimum request rather than accepting it', async () => {
    const { stripe, calls } = makeStripe({ existingCustomer: 'cus_1' })
    const gw = new StripeTenantBillingGateway(stripe, config)
    await gw.createCheckout({ ...args, plan: 'team', seats: 1 })
    expect(
      (calls.session as { line_items: Array<{ quantity: number }> }).line_items[0].quantity
    ).toBe(3)
  })

  // Charter §6: a flat plan's price must never be multiplied by headcount.
  it('never multiplies a flat-billed plan', async () => {
    const { stripe, calls } = makeStripe({ existingCustomer: 'cus_1' })
    const gw = new StripeTenantBillingGateway(stripe, {
      ...config,
      priceByPlan: { ...config.priceByPlan, community: 'price_c' }
    })
    await gw.createCheckout({ ...args, plan: 'community', seats: 500 })
    expect(
      (calls.session as { line_items: Array<{ quantity: number }> }).line_items[0].quantity
    ).toBe(1)
  })

  it('enables Stripe Tax, with the customer_update Stripe requires alongside it', async () => {
    const { stripe, calls } = makeStripe({ existingCustomer: 'cus_1' })
    const gw = new StripeTenantBillingGateway(stripe, config)
    await gw.createCheckout({ ...args, plan: 'personal' })
    const session = calls.session as Record<string, unknown>
    expect(session.automatic_tax).toEqual({ enabled: true })
    // Without this the Stripe call FAILS when a customer is passed — it is not
    // an optional nicety that can be dropped.
    expect(session.customer_update).toEqual({ address: 'auto', name: 'auto' })
    expect(session.tax_id_collection).toEqual({ enabled: true })
  })

  it('only skips tax when a seller opts out explicitly', async () => {
    const { stripe, calls } = makeStripe({ existingCustomer: 'cus_1' })
    const gw = new StripeTenantBillingGateway(stripe, { ...config, automaticTax: false })
    await gw.createCheckout({ ...args, plan: 'personal' })
    expect((calls.session as Record<string, unknown>).automatic_tax).toBeUndefined()
  })

  // Seats bought later in the Customer Portal arrive on the subscription ITEM.
  // Checkout metadata is a snapshot of the original purchase and never moves.
  it('reads live seats off the subscription item, not the metadata', async () => {
    const { stripe } = makeStripe({
      event: {
        type: 'customer.subscription.updated',
        data: {
          object: {
            metadata: { customerRef: 'user_a', plan: 'team', seats: '3' },
            status: 'active',
            items: { data: [{ quantity: 7 }] }
          }
        }
      }
    })
    const gw = new StripeTenantBillingGateway(stripe, config)
    const result = await gw.parseWebhook('{}', { 'stripe-signature': 'sig' })
    expect(result).toMatchObject({ type: 'subscription_status', seats: 7 })
  })
})
