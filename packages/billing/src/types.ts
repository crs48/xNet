/**
 * @xnetjs/billing — canonical, provider-agnostic billing model.
 *
 * Stripe and Bitcoin/Lightning are genuinely different billing shapes: Stripe has
 * native recurring `Subscription`s; BTCPay/Lightning has one-shot `Payment`s and
 * no native subscription primitive. This model carries both so a single
 * `useBilling()` surface can cover either rail honestly (exploration 0187).
 *
 * Money is always integer **minor units** (cents, or sats for BTC) — never a
 * float — matching the repo's `money()` convention from the accounting ledger.
 */

/** A decentralized identifier. Kept as a local alias so this package has zero deps. */
export type DID = string

/** Which payment rail a record came from. `fake` is the keyless dev/test provider. */
export type ProviderId = 'stripe' | 'btcpay' | 'fake'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'unpaid'

export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded'

/** A billing customer, mapped to the xNet identity (DID) that owns it. */
export interface Customer {
  /** Canonical id (the provider's customer id). */
  id: string
  did: DID
  provider: ProviderId
  /** The provider's own customer id (e.g. Stripe `cus_…`). */
  externalRef: string
  email?: string
  updatedAt: number
}

/** A recurring subscription (Stripe-native; BTCPay does not produce these). */
export interface Subscription {
  id: string
  did: DID
  provider: ProviderId
  /** Provider subscription id (e.g. Stripe `sub_…`). */
  externalRef: string
  status: SubscriptionStatus
  /** Provider price/plan id the subscription is on. */
  priceRef: string
  /** End of the current paid period (epoch ms), if known. */
  currentPeriodEnd: number | null
  cancelAtPeriodEnd: boolean
  /** The full provider object, for fidelity / forward-compat (Sync-Engine JSONB pattern). */
  raw?: unknown
  updatedAt: number
}

/** An invoice (Stripe). */
export interface Invoice {
  id: string
  did: DID
  provider: ProviderId
  externalRef: string
  /** Provider customer ref, used to resolve `did` when the object lacks our metadata. */
  customerRef?: string
  /** Amount due, integer minor units. */
  amountDueMinor: number
  currency: string
  status: InvoiceStatus
  hostedUrl?: string
  raw?: unknown
  updatedAt: number
}

/** A one-shot payment (Stripe charge, or a settled BTCPay/Lightning invoice). */
export interface Payment {
  id: string
  did: DID
  provider: ProviderId
  externalRef: string
  customerRef?: string
  /** Amount, integer minor units (cents, or sats for BTC). */
  amountMinor: number
  currency: string
  status: PaymentStatus
  raw?: unknown
  updatedAt: number
}

/** A verified, parsed provider webhook event. */
export interface ProviderEvent {
  /** Provider event id — the idempotency key. */
  id: string
  /** Provider event type, e.g. `customer.subscription.updated` or `InvoiceSettled`. */
  type: string
  provider: ProviderId
  /** The provider object the event is about (already unwrapped from any envelope). */
  data: unknown
}

/** A normalized change to apply to the billing store (last-write-wins by `updatedAt`). */
export type BillingMutation =
  | { kind: 'customer'; data: Customer }
  | { kind: 'subscription'; data: Subscription }
  | { kind: 'invoice'; data: Invoice }
  | { kind: 'payment'; data: Payment }

/** The DID-scoped read shape returned by `GET /billing/me` and surfaced by `useBilling()`. */
export interface BillingState {
  did: DID
  customer: Customer | null
  /** The most relevant subscription (active/trialing first, else most recent). */
  subscription: Subscription | null
  subscriptions: Subscription[]
  invoices: Invoice[]
  payments: Payment[]
}
