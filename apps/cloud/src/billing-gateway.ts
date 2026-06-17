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

export interface CheckoutArgs {
  /** WorkOS billing user id this subscription belongs to (server-set from session). */
  customerRef: string
  plan: PlanId
  successUrl: string
  cancelUrl: string
  email?: string
}

export interface PortalArgs {
  customerRef: string
  returnUrl: string
}

/** A verified, parsed provider webhook reduced to a control-plane action. */
export type WebhookResult =
  | { type: 'checkout.completed'; customerRef: string; plan: PlanId }
  | { type: 'subscription.canceled'; customerRef: string }
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
}

/**
 * Stripe price ids per plan. Mirrors the public prices in
 * `site/src/data/pricing.ts`; overridden from the environment in production.
 * `demo` is free (no checkout) and `enterprise` is contract-sales (no self-serve).
 */
export const PRICE_BY_PLAN: Partial<Record<PlanId, string>> = {
  personal: 'price_personal',
  family: 'price_family',
  team: 'price_team'
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
    let body: { type?: string; customerRef?: string; plan?: string }
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
    return { type: 'ignored' }
  }
}
