/**
 * @xnetjs/billing — in-memory fake provider for keyless local dev + tests.
 *
 * Speaks Stripe-shaped events (so it exercises the real normalizer) but needs no
 * account, no keys, and no network. Webhook verification is optional: pass a
 * `secret` to require a Stripe-style signature, or omit it to trust the body
 * (handy when poking the local hub with curl). The repo prefers keyless-testable
 * integrations (exploration 0176).
 */

import type { CheckoutRequest, CheckoutSession, PaymentProvider } from '../provider'
import type { BillingMutation, ProviderEvent } from '../types'
import { asObj, str } from '../internal/coerce'
import { BillingSignatureError } from '../provider'
import { verifyStripeSignature } from '../stripe-signature'
import { normalizeStripeEvent } from './stripe'

export interface FakeProviderConfig {
  /** When set, webhooks must carry a valid `stripe-signature` for this secret. */
  secret?: string
}

export function createFakeProvider(config: FakeProviderConfig = {}): PaymentProvider {
  return {
    id: 'fake',

    async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
      const sep = req.successUrl.includes('#') ? '&' : '#'
      return {
        url: `${req.successUrl}${sep}fake_checkout=${encodeURIComponent(req.priceRef)}`,
        externalRef: `fake_${req.mode}_${req.did}`
      }
    },

    async parseWebhook(rawBody, headers): Promise<ProviderEvent> {
      if (config.secret) {
        const signature = headers['stripe-signature'] ?? headers['Stripe-Signature']
        if (!verifyStripeSignature(rawBody, signature, config.secret)) {
          throw new BillingSignatureError('Invalid fake webhook signature')
        }
      }
      const event = asObj(JSON.parse(rawBody))
      const id = str(event.id)
      const type = str(event.type)
      if (!id || !type) throw new Error('Malformed fake event')
      return { id, type, provider: 'fake', data: asObj(event.data).object ?? event.data }
    },

    normalize(event: ProviderEvent): BillingMutation[] {
      // Reuse the Stripe normalizer, then re-stamp the provider as `fake`.
      return normalizeStripeEvent({ ...event, provider: 'fake' }, Date.now()).map((m) => ({
        ...m,
        data: { ...m.data, provider: 'fake' }
      })) as BillingMutation[]
    }
  }
}
