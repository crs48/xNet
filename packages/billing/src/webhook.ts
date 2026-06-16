/**
 * @xnetjs/billing — transport-agnostic webhook processing.
 *
 * The heart of "stream all the data in": verify → dedupe → normalize → apply.
 * Pure logic, no Hono/HTTP — the hub route is a thin shell over this, and it is
 * fully unit-testable with the fake provider + the in-memory store.
 */

import type { PaymentProvider } from './provider'
import type { BillingStore } from './store'

export interface WebhookResult {
  received: true
  /** True when the event id was already applied (idempotent no-op). */
  duplicate: boolean
  /** Number of mutations applied (0 for duplicates and no-op event types). */
  mutations: number
  /** The provider event type that was processed. */
  type: string
}

/**
 * Verify and apply one provider webhook delivery.
 *
 * Throws `BillingSignatureError` if the signature is invalid — the caller maps
 * that to HTTP 401. Idempotent: a redelivered event id is a no-op.
 */
export async function processWebhook(
  provider: PaymentProvider,
  store: BillingStore,
  rawBody: string,
  headers: Record<string, string>
): Promise<WebhookResult> {
  const event = await provider.parseWebhook(rawBody, headers)

  if (await store.hasSeenEvent(event.id)) {
    return { received: true, duplicate: true, mutations: 0, type: event.type }
  }

  const mutations = provider.normalize(event)
  for (const mutation of mutations) {
    await store.applyMutation(mutation)
  }
  await store.markEventSeen(event.id)

  return { received: true, duplicate: false, mutations: mutations.length, type: event.type }
}
