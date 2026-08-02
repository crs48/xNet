/**
 * xNet Cloud — real Stripe plan-subscription gateway.
 *
 * Implements the provider-agnostic {@link TenantBillingGateway} over the Stripe
 * SDK: hosted Checkout for subscriptions, the Customer Portal for self-serve
 * management, and signed-webhook verification. Keyed by the WorkOS billing user
 * (`customerRef`), which we stamp into the Stripe customer + subscription metadata
 * so the portal lookup and the cancel webhook resolve the tenant without extra
 * state (exploration 0192). The SDK is reached through a narrow {@link StripeClient}
 * port so the gateway is unit-testable without a Stripe account.
 */

import { PLAN_CATALOG, isSeatMetered, type PlanId } from '@xnetjs/entitlements'
import Stripe from 'stripe'
import {
  STORAGE_PACK_UNIT_GB,
  WebhookSignatureError,
  type CheckoutArgs,
  type PortalArgs,
  type StoragePackArgs,
  type TenantBillingGateway,
  type WebhookResult
} from '../billing-gateway'
import { isSubscriptionStatus } from '../reconcile/billing'

/** Stripe proration modes this gateway uses (exploration 0435). */
export type StripeProration = 'always_invoice' | 'none'

/** The subscription shape the storage add-on needs (items + their prices). */
export interface StripeSubscription {
  id: string
  items: { data: Array<{ id: string; price: { id: string }; quantity?: number }> }
}

/** The slice of the Stripe SDK this gateway uses (mock it in tests). */
export interface StripeClient {
  customers: {
    search(params: { query: string; limit?: number }): Promise<{ data: Array<{ id: string }> }>
    create(params: { email?: string; metadata: Record<string, string> }): Promise<{ id: string }>
  }
  checkout: {
    sessions: {
      create(params: {
        mode: 'subscription'
        customer: string
        line_items: Array<{ price: string; quantity: number }>
        success_url: string
        cancel_url: string
        metadata: Record<string, string>
        subscription_data?: { metadata: Record<string, string> }
        automatic_tax?: { enabled: boolean }
        customer_update?: { address: 'auto'; name?: 'auto' }
        tax_id_collection?: { enabled: boolean }
      }): Promise<{ url: string | null }>
    }
  }
  billingPortal: {
    sessions: { create(params: { customer: string; return_url: string }): Promise<{ url: string }> }
  }
  subscriptions: {
    list(params: {
      customer: string
      status?: string
      limit?: number
    }): Promise<{ data: StripeSubscription[] }>
  }
  subscriptionItems: {
    create(params: {
      subscription: string
      price: string
      quantity: number
      proration_behavior: StripeProration
    }): Promise<{ id: string }>
    update(
      id: string,
      params: { quantity: number; proration_behavior: StripeProration }
    ): Promise<{ id: string }>
    del(id: string, params?: { proration_behavior?: StripeProration }): Promise<{ id: string }>
  }
  webhooks: {
    constructEvent(
      payload: string,
      header: string,
      secret: string
    ): { type: string; data: { object: unknown } }
  }
}

export interface StripeGatewayConfig {
  webhookSecret: string
  priceByPlan: Partial<Record<PlanId, string>>
  /**
   * Stripe Tax. On by default — a SaaS seller owes VAT/sales tax from the first
   * sale, so the safe default is to collect it. Set `false` only for a seller
   * with no collection obligation at all, and say so deliberately (0436).
   */
  automaticTax?: boolean
  /**
   * Stripe Price for the storage add-on, billed per 100 GiB unit (0435).
   * Unset ⇒ `setStoragePack` throws and the dashboard hides the picker, rather
   * than silently granting space nobody is billed for.
   */
  storagePriceId?: string
}

/**
 * The Stripe line-item quantity for a checkout.
 *
 * Flat-billed plans are always `1`: `community` serves an unlimited, uncounted
 * membership, and multiplying its price by headcount would be the per-member
 * meter Charter §6 refuses. Seat-metered plans bill their seat count, floored at
 * the plan's catalog minimum — you cannot buy `team` with one seat (0436).
 */
export function checkoutQuantity(plan: PlanId, seats?: number): number {
  const base = PLAN_CATALOG[plan]
  if (!isSeatMetered(base)) return 1
  const requested = Number.isInteger(seats) ? (seats as number) : base.seats
  return Math.max(base.seats, requested)
}

export class StripeTenantBillingGateway implements TenantBillingGateway {
  readonly id = 'stripe'
  constructor(
    private readonly stripe: StripeClient,
    private readonly config: StripeGatewayConfig
  ) {}

  private async findCustomer(customerRef: string): Promise<string | null> {
    const res = await this.stripe.customers.search({
      query: `metadata['customerRef']:'${customerRef}'`,
      limit: 1
    })
    return res.data[0]?.id ?? null
  }

  private async findOrCreateCustomer(customerRef: string, email?: string): Promise<string> {
    const existing = await this.findCustomer(customerRef)
    if (existing) return existing
    const created = await this.stripe.customers.create({
      ...(email ? { email } : {}),
      metadata: { customerRef }
    })
    return created.id
  }

  async createCheckout(args: CheckoutArgs): Promise<{ url: string; externalRef: string }> {
    const price = this.config.priceByPlan[args.plan]
    if (!price) throw new Error(`No Stripe price configured for plan: ${args.plan}`)
    const customer = await this.findOrCreateCustomer(args.customerRef, args.email)
    // Stamp the binding into BOTH the session and the subscription so the cancel
    // webhook (a subscription event) can resolve the tenant without a lookup.
    const quantity = checkoutQuantity(args.plan, args.seats)
    // `seats` rides the metadata too, so `provisionForBilling` can resolve the
    // entitlement the customer actually paid for rather than the catalog default.
    const metadata = {
      customerRef: args.customerRef,
      plan: args.plan,
      ...(quantity > 1 ? { seats: String(quantity) } : {})
    }
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      metadata,
      subscription_data: { metadata },
      // VAT on B2C digital services is owed in the customer's member state from
      // the first sale — there is no registration threshold to grow into, and
      // retro-fitting it means eating the tax or raising every existing price.
      // Stripe REQUIRES `customer_update` alongside `automatic_tax` when a
      // customer is passed; without it the call fails rather than silently
      // skipping tax (exploration 0436 G10).
      ...(this.config.automaticTax === false
        ? {}
        : {
            automatic_tax: { enabled: true },
            customer_update: { address: 'auto' as const, name: 'auto' as const },
            tax_id_collection: { enabled: true }
          })
    })
    if (!session.url) throw new Error('Stripe returned no checkout URL')
    return { url: session.url, externalRef: customer }
  }

  async createPortal(args: PortalArgs): Promise<{ url: string }> {
    const customer = await this.findCustomer(args.customerRef)
    if (!customer) throw new Error(`No Stripe customer for ${args.customerRef}`)
    const session = await this.stripe.billingPortal.sessions.create({
      customer,
      return_url: args.returnUrl
    })
    return { url: session.url }
  }

  /**
   * Add, resize or remove the storage add-on line item (exploration 0435).
   *
   * Deliberately does NOT touch the base subscription price — the tenant keeps
   * their plan, seats, AI budget and SLA exactly as they were, which is the
   * whole promise of a storage-only upgrade.
   */
  async setStoragePack(args: StoragePackArgs): Promise<{ storagePackGb: number }> {
    const price = this.config.storagePriceId
    if (!price) throw new Error('No Stripe price configured for storage add-ons')
    if (!Number.isInteger(args.packGb) || args.packGb < 0) {
      throw new Error(`Invalid storage pack: ${args.packGb}`)
    }
    if (args.packGb % STORAGE_PACK_UNIT_GB !== 0) {
      throw new Error(`Storage pack must be a multiple of ${STORAGE_PACK_UNIT_GB} GiB`)
    }
    const customer = await this.findCustomer(args.customerRef)
    if (!customer) throw new Error(`No Stripe customer for ${args.customerRef}`)

    const subs = await this.stripe.subscriptions.list({ customer, status: 'active', limit: 1 })
    const sub = subs.data[0]
    if (!sub) throw new Error(`No active subscription for ${args.customerRef}`)

    const existing = sub.items.data.find((item) => item.price.id === price)
    const quantity = args.packGb / STORAGE_PACK_UNIT_GB
    const current = existing?.quantity ?? 0

    // Growing costs money now; shrinking waits for the period boundary so we
    // never owe a refund and the over-quota guard gets a full cycle of runway.
    const proration: StripeProration = quantity > current ? 'always_invoice' : 'none'

    if (quantity === 0) {
      if (existing)
        await this.stripe.subscriptionItems.del(existing.id, { proration_behavior: 'none' })
    } else if (existing) {
      await this.stripe.subscriptionItems.update(existing.id, {
        quantity,
        proration_behavior: proration
      })
    } else {
      await this.stripe.subscriptionItems.create({
        subscription: sub.id,
        price,
        quantity,
        proration_behavior: proration
      })
    }
    return { storagePackGb: args.packGb }
  }

  /**
   * Total add-on GiB on a subscription, read from its line items.
   *
   * Items are the only place the quantity exists — checkout session metadata
   * carries the plan and nothing else, so a pack bought or resized through the
   * customer portal is invisible to a metadata-only reader (0435).
   */
  private storagePackFromItems(obj: unknown): number | undefined {
    const price = this.config.storagePriceId
    if (!price) return undefined
    const items = (obj as StripeSubscription | undefined)?.items?.data
    if (!Array.isArray(items)) return undefined
    const item = items.find((i) => i?.price?.id === price)
    // An active subscription with no storage item means the pack is zero, which
    // is a real value (someone removed it) — distinct from "no items at all",
    // which means this event cannot tell us and must not be read as a removal.
    return (item?.quantity ?? 0) * STORAGE_PACK_UNIT_GB
  }

  /**
   * Billed seats, read off the subscription ITEM rather than the metadata.
   *
   * Metadata records what was bought at checkout and never moves when a customer
   * adds a seat in the portal, which is exactly the drift that made "add seats
   * any time" untrue (exploration 0436 G5).
   *
   * Matched by PRICE ID, not by position: a subscription now routinely carries
   * two items — the plan and a storage add-on (0435) — so `items.data[0]` would
   * read the storage quantity as a seat count whenever Stripe ordered them the
   * other way round.
   */
  private seatsFromItems(obj: unknown, plan: PlanId | undefined): number | undefined {
    const price = plan ? this.config.priceByPlan[plan] : undefined
    if (!price) return undefined
    const items = (obj as StripeSubscription | undefined)?.items?.data
    if (!Array.isArray(items)) return undefined
    const quantity = items.find((i) => i?.price?.id === price)?.quantity
    return Number.isInteger(quantity) && (quantity as number) > 0 ? quantity : undefined
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult> {
    const sig = headers['stripe-signature'] ?? headers['Stripe-Signature'] ?? ''
    let event: { type: string; data: { object: unknown } }
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, sig, this.config.webhookSecret)
    } catch {
      throw new WebhookSignatureError()
    }
    const obj = (event.data.object ?? {}) as {
      metadata?: Record<string, string>
      // Invoice events don't carry the checkout metadata; Stripe copies the
      // subscription's metadata onto the invoice under `subscription_details`.
      subscription_details?: { metadata?: Record<string, string> }
      status?: string
      attempt_count?: number
      /** Subscription items — where the LIVE seat quantity lives (0436 G5). */
      items?: { data?: Array<{ quantity?: number }> }
    }
    const meta = obj.metadata ?? {}
    // customerRef was stamped onto the customer + subscription metadata at checkout
    // (exploration 0192); for invoice events read it from subscription_details.
    const customerRef = meta.customerRef ?? obj.subscription_details?.metadata?.customerRef
    if (event.type === 'checkout.session.completed' && meta.customerRef && meta.plan) {
      const seats = Number(meta.seats)
      return {
        type: 'checkout.completed',
        customerRef: meta.customerRef,
        plan: meta.plan as PlanId,
        ...(Number.isInteger(seats) && seats > 0 ? { seats } : {})
      }
    }
    if (event.type === 'customer.subscription.deleted' && meta.customerRef) {
      return { type: 'subscription.canceled', customerRef: meta.customerRef }
    }
    // Dunning events (exploration 0260).
    if (event.type === 'invoice.payment_failed' && customerRef) {
      return {
        type: 'payment_failed',
        customerRef,
        ...(typeof obj.attempt_count === 'number' ? { attemptCount: obj.attempt_count } : {})
      }
    }
    if (
      (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') &&
      customerRef
    ) {
      return { type: 'payment_recovered', customerRef }
    }
    if (event.type === 'customer.subscription.updated' && meta.customerRef) {
      const storagePackGb = this.storagePackFromItems(event.data.object)
      const seats = this.seatsFromItems(event.data.object, meta.plan as PlanId | undefined)
      if (isSubscriptionStatus(obj.status)) {
        return {
          type: 'subscription_status',
          customerRef: meta.customerRef,
          status: obj.status,
          ...(storagePackGb !== undefined ? { storagePackGb } : {}),
          ...(seats !== undefined ? { seats } : {})
        }
      }
      // A pure add-on change carries no status transition; still actionable.
      if (storagePackGb !== undefined) {
        return { type: 'storage_pack', customerRef: meta.customerRef, storagePackGb }
      }
    }
    return { type: 'ignored' }
  }
}

/** Build the Stripe gateway from the environment, or null when Stripe is unconfigured. */
export function stripeGatewayFromEnv(
  env: NodeJS.ProcessEnv = process.env
): StripeTenantBillingGateway | null {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return null
  const stripe = new Stripe(env.STRIPE_SECRET_KEY) as unknown as StripeClient
  return new StripeTenantBillingGateway(stripe, {
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    // Opt OUT explicitly, never by omission — a missing variable must not mean
    // "don't collect tax".
    ...(env.STRIPE_AUTOMATIC_TAX === 'false' ? { automaticTax: false } : {}),
    priceByPlan: {
      ...(env.STRIPE_PRICE_PERSONAL ? { personal: env.STRIPE_PRICE_PERSONAL } : {}),
      ...(env.STRIPE_PRICE_FAMILY ? { family: env.STRIPE_PRICE_FAMILY } : {}),
      ...(env.STRIPE_PRICE_TEAM ? { team: env.STRIPE_PRICE_TEAM } : {}),
      ...(env.STRIPE_PRICE_COMMUNITY ? { community: env.STRIPE_PRICE_COMMUNITY } : {})
    },
    // Unset ⇒ storage add-ons stay off entirely rather than being granted free.
    ...(env.STRIPE_PRICE_STORAGE_100GB ? { storagePriceId: env.STRIPE_PRICE_STORAGE_100GB } : {})
  })
}
