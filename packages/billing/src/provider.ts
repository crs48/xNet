/**
 * @xnetjs/billing — the PaymentProvider port.
 *
 * One narrow interface that Stripe, BTCPay, and the in-memory fake all implement.
 * The hub talks only to this port, so a billing-enabled app is provider-agnostic:
 * swap `XNET_BILLING_PROVIDER=stripe` for `=btcpay` and the same routes + the same
 * `useBilling()` hook keep working (exploration 0187).
 */

import type { BillingMutation, DID, ProviderEvent, ProviderId } from './types'

/** Thrown when a webhook fails signature verification. The route maps it to 401. */
export class BillingSignatureError extends Error {
  constructor(message = 'Invalid webhook signature') {
    super(message)
    this.name = 'BillingSignatureError'
  }
}

export interface CheckoutRequest {
  /** The DID to bind the checkout to. Server-set — NEVER trusted from a client body. */
  did: DID
  /** Provider price/plan id (Stripe) or an amount spec (BTCPay). */
  priceRef: string
  mode: 'subscription' | 'payment'
  successUrl: string
  cancelUrl: string
  customerEmail?: string
}

export interface CheckoutSession {
  /** Hosted checkout URL to redirect the buyer to. */
  url: string
  /** Provider id for the created session/invoice. */
  externalRef: string
}

export interface PortalRequest {
  customerExternalRef: string
  returnUrl: string
}

export interface PaymentProvider {
  readonly id: ProviderId
  /**
   * Create a hosted checkout session / invoice. The secret key call happens here,
   * server-side; the client only ever receives the returned URL.
   */
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>
  /**
   * Verify a webhook's signature against the raw request body and parse it into a
   * `ProviderEvent`. Throws `BillingSignatureError` if the signature is invalid.
   */
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<ProviderEvent>
  /** Normalize a verified event into canonical billing mutations (may be empty). */
  normalize(event: ProviderEvent): BillingMutation[]
  /**
   * Optional hosted portal for an existing customer to manage their subscription
   * (Stripe). Providers without a portal (BTCPay) omit this.
   */
  createPortalSession?(req: PortalRequest): Promise<{ url: string }>
}
