/**
 * @xnetjs/billing — public API.
 *
 * Plug-and-play, provider-agnostic billing for the self-hostable hub: a
 * `PaymentProvider` port, a canonical billing model, Stripe + Bitcoin (BTCPay) +
 * fake adapters, webhook verification, and an idempotent billing store. Zero
 * runtime dependencies — `node:crypto` + `fetch` only — so the MIT hub can import
 * it without pulling in the `stripe` SDK or taking an FSL dependency on
 * `@xnetjs/cloud`. See exploration 0187.
 */

export type {
  DID,
  ProviderId,
  SubscriptionStatus,
  InvoiceStatus,
  PaymentStatus,
  Customer,
  Subscription,
  Invoice,
  Payment,
  ProviderEvent,
  BillingMutation,
  BillingState
} from './types'

export { BillingSignatureError } from './provider'
export type { PaymentProvider, CheckoutRequest, CheckoutSession, PortalRequest } from './provider'

export { MemoryBillingStore, isActiveSubscription, pickCurrentSubscription } from './store'
export type { BillingStore } from './store'

export { processWebhook, type WebhookResult } from './webhook'

export { verifyStripeSignature, signStripePayload } from './stripe-signature'
export type { StripeSignatureOptions } from './stripe-signature'

export { createStripeProvider, normalizeStripeEvent } from './providers/stripe'
export type { StripeProviderConfig } from './providers/stripe'

export {
  createBtcpayProvider,
  normalizeBtcpayEvent,
  verifyBtcpaySignature,
  signBtcpayPayload
} from './providers/btcpay'
export type { BtcpayProviderConfig } from './providers/btcpay'

export { createFakeProvider } from './providers/fake'
export type { FakeProviderConfig } from './providers/fake'

export { billingProviderFromEnv } from './config'
