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

import type { PlanId } from '@xnetjs/entitlements'
import Stripe from 'stripe'
import {
  WebhookSignatureError,
  type CheckoutArgs,
  type PortalArgs,
  type TenantBillingGateway,
  type WebhookResult
} from '../billing-gateway'
import { isSubscriptionStatus } from '../reconcile/billing'

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
      }): Promise<{ url: string | null }>
    }
  }
  billingPortal: {
    sessions: { create(params: { customer: string; return_url: string }): Promise<{ url: string }> }
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
    const metadata = { customerRef: args.customerRef, plan: args.plan }
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      line_items: [{ price, quantity: 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      metadata,
      subscription_data: { metadata }
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
    }
    const meta = obj.metadata ?? {}
    // customerRef was stamped onto the customer + subscription metadata at checkout
    // (exploration 0192); for invoice events read it from subscription_details.
    const customerRef = meta.customerRef ?? obj.subscription_details?.metadata?.customerRef
    if (event.type === 'checkout.session.completed' && meta.customerRef && meta.plan) {
      return {
        type: 'checkout.completed',
        customerRef: meta.customerRef,
        plan: meta.plan as PlanId
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
    if (
      event.type === 'customer.subscription.updated' &&
      meta.customerRef &&
      isSubscriptionStatus(obj.status)
    ) {
      return { type: 'subscription_status', customerRef: meta.customerRef, status: obj.status }
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
    priceByPlan: {
      ...(env.STRIPE_PRICE_PERSONAL ? { personal: env.STRIPE_PRICE_PERSONAL } : {}),
      ...(env.STRIPE_PRICE_FAMILY ? { family: env.STRIPE_PRICE_FAMILY } : {}),
      ...(env.STRIPE_PRICE_TEAM ? { team: env.STRIPE_PRICE_TEAM } : {})
    }
  })
}
