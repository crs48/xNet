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
  /** Storage add-on items already on the active subscription (0435). */
  subscriptionItems?: Array<{ id: string; price: { id: string }; quantity?: number }>
  /** No active subscription at all. */
  noSubscription?: boolean
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
    subscriptions: {
      list: vi.fn(async () => ({
        data: opts.noSubscription
          ? []
          : [{ id: 'sub_1', items: { data: opts.subscriptionItems ?? [] } }]
      }))
    },
    subscriptionItems: {
      create: vi.fn(async (p) => {
        calls.itemCreate = p
        return { id: 'si_new' }
      }),
      update: vi.fn(async (id, p) => {
        calls.itemUpdate = { id, ...p }
        return { id }
      }),
      del: vi.fn(async (id, p) => {
        calls.itemDel = { id, ...p }
        return { id }
      })
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
            // Two items, storage FIRST: reading `items.data[0]` would report the
            // storage quantity as a seat count (exploration 0435 + 0436).
            items: {
              data: [
                { price: { id: 'price_storage' }, quantity: 5 },
                { price: { id: 'price_t' }, quantity: 7 }
              ]
            }
          }
        }
      }
    })
    const gw = new StripeTenantBillingGateway(stripe, config)
    const result = await gw.parseWebhook('{}', { 'stripe-signature': 'sig' })
    expect(result).toMatchObject({ type: 'subscription_status', seats: 7 })
  })
})

/**
 * Storage add-on line items (exploration 0435). The add-on is a SECOND
 * subscription item — the base plan's price, seats, AI budget and SLA are never
 * touched, which is the whole promise of a storage-only upgrade.
 */
describe('StripeTenantBillingGateway.setStoragePack (0435)', () => {
  const STORAGE_PRICE = 'price_storage_100gb'
  const storageGw = (s: StripeClient) =>
    new StripeTenantBillingGateway(s, { ...config, storagePriceId: STORAGE_PRICE })

  it('adds a new item and invoices the proration immediately on a first purchase', async () => {
    const s = makeStripe({ existingCustomer: 'cus_1' })

    await expect(
      storageGw(s.stripe).setStoragePack({ customerRef: 'user_a', packGb: 500 })
    ).resolves.toEqual({ storagePackGb: 500 })

    expect(s.calls.itemCreate).toEqual({
      subscription: 'sub_1',
      price: STORAGE_PRICE,
      quantity: 5, // 500 GiB / 100 GiB units
      proration_behavior: 'always_invoice'
    })
    // The base plan price is untouched — no checkout session, no price swap.
    expect(s.calls.session).toBeUndefined()
  })

  it('updates the quantity in place when a pack already exists', async () => {
    const s = makeStripe({
      existingCustomer: 'cus_1',
      subscriptionItems: [{ id: 'si_1', price: { id: STORAGE_PRICE }, quantity: 1 }]
    })

    await storageGw(s.stripe).setStoragePack({ customerRef: 'user_a', packGb: 1000 })

    expect(s.calls.itemUpdate).toEqual({
      id: 'si_1',
      quantity: 10,
      proration_behavior: 'always_invoice'
    })
    expect(s.calls.itemCreate).toBeUndefined()
  })

  // Shrinking waits for the period boundary: no refund to owe, and the
  // over-quota guard gets a whole cycle of runway to warn the tenant.
  it('does NOT prorate a reduction', async () => {
    const s = makeStripe({
      existingCustomer: 'cus_1',
      subscriptionItems: [{ id: 'si_1', price: { id: STORAGE_PRICE }, quantity: 10 }]
    })

    await storageGw(s.stripe).setStoragePack({ customerRef: 'user_a', packGb: 100 })

    expect(s.calls.itemUpdate).toEqual({ id: 'si_1', quantity: 1, proration_behavior: 'none' })
  })

  it('removes the item entirely at zero', async () => {
    const s = makeStripe({
      existingCustomer: 'cus_1',
      subscriptionItems: [{ id: 'si_1', price: { id: STORAGE_PRICE }, quantity: 5 }]
    })

    await storageGw(s.stripe).setStoragePack({ customerRef: 'user_a', packGb: 0 })

    expect(s.calls.itemDel).toEqual({ id: 'si_1', proration_behavior: 'none' })
  })

  it('is a no-op (not a crash) when removing a pack that was never bought', async () => {
    const s = makeStripe({ existingCustomer: 'cus_1' })
    await expect(
      storageGw(s.stripe).setStoragePack({ customerRef: 'user_a', packGb: 0 })
    ).resolves.toEqual({ storagePackGb: 0 })
    expect(s.calls.itemDel).toBeUndefined()
  })

  // Failing loudly beats granting space nobody is billed for.
  it('refuses when no storage price is configured', async () => {
    const s = makeStripe({ existingCustomer: 'cus_1' })
    await expect(
      gw(s.stripe).setStoragePack({ customerRef: 'user_a', packGb: 100 })
    ).rejects.toThrow(/No Stripe price configured for storage/)
  })

  it('refuses a size that is not a whole number of 100 GiB units', async () => {
    const s = makeStripe({ existingCustomer: 'cus_1' })
    await expect(
      storageGw(s.stripe).setStoragePack({ customerRef: 'user_a', packGb: 150 })
    ).rejects.toThrow(/multiple of 100/)
  })

  it('refuses a negative pack', async () => {
    const s = makeStripe({ existingCustomer: 'cus_1' })
    await expect(
      storageGw(s.stripe).setStoragePack({ customerRef: 'user_a', packGb: -100 })
    ).rejects.toThrow(/Invalid storage pack/)
  })

  it('refuses when the customer has no active subscription', async () => {
    const s = makeStripe({ existingCustomer: 'cus_1', noSubscription: true })
    await expect(
      storageGw(s.stripe).setStoragePack({ customerRef: 'user_a', packGb: 100 })
    ).rejects.toThrow(/No active subscription/)
  })
})

describe('storage pack on the subscription webhook (0435)', () => {
  const STORAGE_PRICE = 'price_storage_100gb'
  const storageGw = (s: StripeClient) =>
    new StripeTenantBillingGateway(s, { ...config, storagePriceId: STORAGE_PRICE })

  const updatedEvent = (object: unknown) => ({
    type: 'customer.subscription.updated',
    data: { object }
  })

  // The quantity exists ONLY on the items — session metadata carries the plan
  // and nothing else, so a portal-bought pack is invisible to a metadata reader.
  it('reads the pack size off the subscription ITEMS, not metadata', async () => {
    const s = makeStripe({
      event: updatedEvent({
        metadata: { customerRef: 'user_a' },
        status: 'active',
        items: { data: [{ id: 'si_1', price: { id: STORAGE_PRICE }, quantity: 5 }] }
      })
    })

    expect(await storageGw(s.stripe).parseWebhook('{}', { 'stripe-signature': 'sig' })).toEqual({
      type: 'subscription_status',
      customerRef: 'user_a',
      status: 'active',
      storagePackGb: 500
    })
  })

  it('reports a removed pack as zero, not as absent', async () => {
    const s = makeStripe({
      event: updatedEvent({
        metadata: { customerRef: 'user_a' },
        status: 'active',
        items: { data: [{ id: 'si_base', price: { id: 'price_p' }, quantity: 1 }] }
      })
    })

    expect(
      await storageGw(s.stripe).parseWebhook('{}', { 'stripe-signature': 'sig' })
    ).toMatchObject({ storagePackGb: 0 })
  })

  // "No items on the event" is unreadable, not "the pack was removed" — the
  // difference between those two is a tenant silently losing paid-for space.
  it('omits the pack entirely when the event carries no items', async () => {
    const s = makeStripe({
      event: updatedEvent({ metadata: { customerRef: 'user_a' }, status: 'active' })
    })

    const result = await storageGw(s.stripe).parseWebhook('{}', { 'stripe-signature': 'sig' })
    expect(result).toEqual({ type: 'subscription_status', customerRef: 'user_a', status: 'active' })
    expect(result).not.toHaveProperty('storagePackGb')
  })

  it('surfaces a pure add-on change that carries no status transition', async () => {
    const s = makeStripe({
      event: updatedEvent({
        metadata: { customerRef: 'user_a' },
        status: 'trialing', // not a status we act on
        items: { data: [{ id: 'si_1', price: { id: STORAGE_PRICE }, quantity: 10 }] }
      })
    })

    expect(await storageGw(s.stripe).parseWebhook('{}', { 'stripe-signature': 'sig' })).toEqual({
      type: 'storage_pack',
      customerRef: 'user_a',
      storagePackGb: 1000
    })
  })
})
