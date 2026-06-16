/**
 * @xnetjs/billing — resolve a provider from the environment.
 *
 * The hub calls this once at startup. With no billing env set it returns `null`
 * and the billing routes respond 503 ("not configured") — billing is strictly
 * opt-in. Mirrors `entitlementsFromEnv` from `@xnetjs/entitlements`.
 *
 *   XNET_BILLING_PROVIDER = stripe | btcpay | fake   (optional; inferred otherwise)
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 *   BTCPAY_URL, BTCPAY_API_KEY, BTCPAY_STORE_ID, BTCPAY_WEBHOOK_SECRET
 *   BILLING_FAKE_SECRET                              (optional, for the fake provider)
 */

import type { PaymentProvider } from './provider'
import { createBtcpayProvider } from './providers/btcpay'
import { createFakeProvider } from './providers/fake'
import { createStripeProvider } from './providers/stripe'

type Env = Record<string, string | undefined>

/** Resolve the configured payment provider, or `null` when billing is not set up. */
export function billingProviderFromEnv(env: Env = process.env): PaymentProvider | null {
  const which = env.XNET_BILLING_PROVIDER?.toLowerCase()

  if (which === 'stripe' || (!which && env.STRIPE_SECRET_KEY)) {
    if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return null
    return createStripeProvider({
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET
    })
  }

  if (which === 'btcpay' || (!which && env.BTCPAY_URL)) {
    if (
      !env.BTCPAY_URL ||
      !env.BTCPAY_API_KEY ||
      !env.BTCPAY_STORE_ID ||
      !env.BTCPAY_WEBHOOK_SECRET
    ) {
      return null
    }
    return createBtcpayProvider({
      url: env.BTCPAY_URL,
      apiKey: env.BTCPAY_API_KEY,
      storeId: env.BTCPAY_STORE_ID,
      webhookSecret: env.BTCPAY_WEBHOOK_SECRET,
      defaultCurrency: env.BTCPAY_DEFAULT_CURRENCY
    })
  }

  if (which === 'fake') {
    return createFakeProvider({ secret: env.BILLING_FAKE_SECRET })
  }

  return null
}
