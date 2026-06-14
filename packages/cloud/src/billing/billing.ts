/**
 * @xnetjs/cloud/billing — Stripe meter + webhook adapter.
 *
 * A narrow `StripeBilling` port with two implementations:
 *  - `FakeStripeBilling` — an in-memory fake that DOES model idempotency and
 *    aggregation (so money logic is testable with no account / no Docker), and
 *  - `StripeBillingAdapter` — the real Stripe Billing Meters integration.
 *
 * No Stripe Connect (we are the sole seller reselling our own product — 0174).
 * Webhook verification is pure local HMAC and is fully testable via the Stripe
 * SDK's `generateTestHeaderString` (exploration 0176).
 */

import type Stripe from 'stripe'

/** One usage meter event (Stripe Billing Meters). */
export interface MeterEvent {
  /** The meter's `event_name`, e.g. `ai_usage_usd`. */
  eventName: string
  /** Stripe customer id the usage is attributed to. */
  customerId: string
  /** Numeric value as a string, per Stripe (e.g. marked-up USD). */
  value: string
  /** Idempotency identifier — Stripe dedupes events sharing one identifier. */
  identifier: string
  /** Event time (unix seconds); defaults to "now" at the adapter. */
  timestampSec?: number
}

export interface StripeBilling {
  recordMeterEvent(event: MeterEvent): Promise<void>
}

/** In-memory fake that models Stripe's identifier-based idempotency + sum aggregation. */
export class FakeStripeBilling implements StripeBilling {
  private readonly byIdentifier = new Map<string, MeterEvent>()

  async recordMeterEvent(event: MeterEvent): Promise<void> {
    // Stripe dedupes meter events by identifier; the last write for an id wins but
    // the value is not double-counted. Model that here.
    this.byIdentifier.set(event.identifier, { ...event })
  }

  /** All recorded events (deduped by identifier). */
  events(): MeterEvent[] {
    return [...this.byIdentifier.values()]
  }

  /** Summed value for an event name + customer (the meter's `sum` aggregation). */
  total(eventName: string, customerId: string): number {
    let total = 0
    for (const e of this.byIdentifier.values()) {
      if (e.eventName === eventName && e.customerId === customerId) total += Number(e.value)
    }
    return total
  }
}

/** Real Stripe Billing Meters adapter. */
export class StripeBillingAdapter implements StripeBilling {
  constructor(private readonly stripe: Stripe) {}

  async recordMeterEvent(event: MeterEvent): Promise<void> {
    await this.stripe.billing.meterEvents.create({
      event_name: event.eventName,
      identifier: event.identifier,
      payload: { stripe_customer_id: event.customerId, value: event.value },
      ...(event.timestampSec ? { timestamp: event.timestampSec } : {})
    })
  }
}

/**
 * Verify and parse a Stripe webhook. Throws if the signature is missing/invalid or
 * the timestamp is outside tolerance. Pure local HMAC — no network.
 */
export function verifyWebhook(
  stripe: Stripe,
  payload: string | Buffer,
  signature: string,
  secret: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(payload, signature, secret)
}
