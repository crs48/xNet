/**
 * xNet Cloud — tenant-billing gateway (plan subscriptions).
 *
 * This is the **plan-subscription** surface ("$5/mo Personal"), keyed by the
 * WorkOS billing identity — deliberately separate from `@xnetjs/cloud/billing`
 * (AI usage metering) and from `@xnetjs/billing` (the hub's DID-scoped end-user
 * billing). Conflating them was called out as a trap in exploration 0192.
 *
 * The control plane talks only to this port, so the real adapter (Stripe Checkout
 * + Customer Portal, server-side secret key) is swappable and the fake is keyless-
 * testable (exploration 0176). The production adapter wraps Stripe (or reuses
 * `@xnetjs/billing`'s Stripe `PaymentProvider` keyed by the tenant) — deferred.
 */

import type { PlanId } from '@xnetjs/entitlements'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { isSubscriptionStatus, type SubscriptionStatus } from './reconcile/billing'

export interface CheckoutArgs {
  /** WorkOS billing user id this subscription belongs to (server-set from session). */
  customerRef: string
  plan: PlanId
  successUrl: string
  cancelUrl: string
  email?: string
  /**
   * Billed seats — the Stripe `SubscriptionItem.quantity` (exploration 0436 G5).
   *
   * Defaults to the plan's catalog seat count, NOT to 1. Checkout used to
   * hard-code `quantity: 1` against a pricing page advertising `$12/seat` from
   * three seats, so a 3-seat Team subscription billed $12.
   *
   * Ignored on a flat-billed plan (`seats === 0`), where members are unlimited
   * and uncounted and a quantity would be the per-member meter Charter §6
   * refuses.
   */
  seats?: number
}

export interface PortalArgs {
  customerRef: string
  returnUrl: string
}

/**
 * Bytes-per-unit of the storage add-on price. One Stripe Price sold in units of
 * 100 GiB, so the published +100/+500/+1000 packs are quantities 1/5/10 against
 * a single price id rather than three separate SKUs (exploration 0435).
 */
export const STORAGE_PACK_UNIT_GB = 100

/** Args for changing a tenant's storage add-on. `packGb: 0` removes it. */
export interface StoragePackArgs {
  customerRef: string
  /** Total add-on size in GiB; must be a multiple of {@link STORAGE_PACK_UNIT_GB}. */
  packGb: number
}

/** A verified, parsed provider webhook reduced to a control-plane action. */
export type WebhookResult =
  | {
      type: 'checkout.completed'
      customerRef: string
      plan: PlanId
      /** Billed seats from the line item, when the plan is seat-metered (0436 G5). */
      seats?: number
    }
  | { type: 'subscription.canceled'; customerRef: string }
  /**
   * The subscription's storage add-on changed (exploration 0435). Read from the
   * subscription's line ITEMS, never from checkout session metadata — the
   * metadata does not carry the quantity, so a pack bought through the customer
   * portal would be invisible to a metadata-only reader.
   */
  | { type: 'storage_pack'; customerRef: string; storagePackGb: number }
  /** An invoice payment attempt failed — dunning begins (exploration 0260). */
  | { type: 'payment_failed'; customerRef: string; attemptCount?: number }
  /** An invoice was paid — the subscription recovered. */
  | { type: 'payment_recovered'; customerRef: string }
  /** The subscription's status changed (`past_due` / `unpaid` / `active` / `canceled`). */
  | {
      type: 'subscription_status'
      customerRef: string
      status: SubscriptionStatus
      /**
       * Seats as Stripe now sees them, read off the subscription ITEM rather
       * than the checkout metadata — the metadata is a snapshot of the original
       * purchase and does not move when a customer adds a seat in the portal
       * (exploration 0436).
       */
      seats?: number
      /** Add-on storage read off the same event's items, when present (0435). */
      storagePackGb?: number
    }
  | { type: 'ignored' }

/** Thrown when a webhook fails signature verification (route → 401). */
export class WebhookSignatureError extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message)
    this.name = 'WebhookSignatureError'
  }
}

export interface TenantBillingGateway {
  /** Telemetry/display label, e.g. `stripe` or `fake`. */
  readonly id: string
  /** Create a hosted checkout for a plan subscription; returns the URL to redirect to. */
  createCheckout(args: CheckoutArgs): Promise<{ url: string; externalRef: string }>
  /** Create a hosted customer portal session for managing/canceling the subscription. */
  createPortal(args: PortalArgs): Promise<{ url: string }>
  /** Verify + parse a provider webhook. Throws `WebhookSignatureError` on a bad signature. */
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult>
  /**
   * Set the storage add-on on an existing subscription (exploration 0435).
   *
   * A second line ITEM, never a swap of the base price: the plan keeps its own
   * price id and its invoice, so the tenant's plan, seats and AI budget are
   * untouched and the marginal payment cost is the percentage only. An increase
   * prorates and invoices immediately (they want the space now); a decrease
   * takes effect at period end with no proration, which also gives the
   * over-quota guard a full cycle of runway.
   *
   * Optional: gateways without a configured storage price omit it, and the
   * route reports the feature as unavailable rather than half-charging.
   */
  setStoragePack?(args: StoragePackArgs): Promise<{ storagePackGb: number }>
}

/**
 * Stripe price ids per plan. Mirrors the public prices in
 * `site/src/data/pricing.ts`; overridden from the environment in production.
 * `demo` is free (no checkout) and `enterprise` is contract-sales (no self-serve).
 */
export const PRICE_BY_PLAN: Partial<Record<PlanId, string>> = {
  personal: 'price_personal',
  family: 'price_family',
  team: 'price_team',
  // `community` is self-serve (exploration 0436 G7): flat-billed, no residency,
  // no contract — the only thing keeping it unbuyable was a missing price.
  community: 'price_community'
}

const HEADER = 'x-xnet-signature'

/**
 * Keyless in-memory gateway for local dev + tests. `createCheckout` echoes a
 * marker onto the success URL (so the dashboard can show "provisioning…"), and
 * `parseWebhook` accepts a JSON body `{ type, customerRef, plan }` — optionally
 * gated by an HMAC signature when a secret is configured.
 */
export class FakeTenantBillingGateway implements TenantBillingGateway {
  readonly id = 'fake'
  constructor(private readonly secret?: string) {}

  async createCheckout(args: CheckoutArgs): Promise<{ url: string; externalRef: string }> {
    const sep = args.successUrl.includes('?') ? '&' : '?'
    return {
      url: `${args.successUrl}${sep}fake_checkout=${encodeURIComponent(args.plan)}`,
      externalRef: `fake_sub_${args.customerRef}`
    }
  }

  async createPortal(args: PortalArgs): Promise<{ url: string }> {
    return { url: `https://billing.local/portal?return=${encodeURIComponent(args.returnUrl)}` }
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookResult> {
    if (this.secret) {
      const sig = headers[HEADER] ?? headers[HEADER.toUpperCase()]
      const expected = createHmac('sha256', this.secret).update(rawBody).digest('hex')
      const got = Buffer.from(sig ?? '')
      const want = Buffer.from(expected)
      if (got.length !== want.length || !timingSafeEqual(got, want)) {
        throw new WebhookSignatureError()
      }
    }
    let body: {
      type?: string
      customerRef?: string
      plan?: string
      status?: string
      attemptCount?: number
    }
    try {
      body = JSON.parse(rawBody)
    } catch {
      return { type: 'ignored' }
    }
    if (
      (body.type === 'checkout.session.completed' || body.type === 'checkout.completed') &&
      body.customerRef &&
      body.plan
    ) {
      return {
        type: 'checkout.completed',
        customerRef: body.customerRef,
        plan: body.plan as PlanId
      }
    }
    if (body.type === 'customer.subscription.deleted' && body.customerRef) {
      return { type: 'subscription.canceled', customerRef: body.customerRef }
    }
    // Dunning events (exploration 0260).
    if (body.type === 'invoice.payment_failed' && body.customerRef) {
      return {
        type: 'payment_failed',
        customerRef: body.customerRef,
        ...(typeof body.attemptCount === 'number' ? { attemptCount: body.attemptCount } : {})
      }
    }
    if (
      (body.type === 'invoice.paid' || body.type === 'invoice.payment_succeeded') &&
      body.customerRef
    ) {
      return { type: 'payment_recovered', customerRef: body.customerRef }
    }
    if (
      body.type === 'customer.subscription.updated' &&
      body.customerRef &&
      isSubscriptionStatus(body.status)
    ) {
      return { type: 'subscription_status', customerRef: body.customerRef, status: body.status }
    }
    return { type: 'ignored' }
  }
}
