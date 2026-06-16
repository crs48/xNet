/**
 * @xnetjs/hub - Billing → entitlements tie-in (exploration 0187 deferred item).
 *
 * Bridges `@xnetjs/billing` (subscriptions) and `@xnetjs/entitlements` (plan
 * limits) in the hub — the only place that depends on both, keeping
 * `@xnetjs/billing` decoupled from `@xnetjs/entitlements`. An active subscription
 * whose price maps to a known plan grants that plan's entitlements; otherwise the
 * hub keeps its own defaults (free tier).
 *
 * The price→plan mapping is deployment config (the operator maps their Stripe
 * prices to plan tiers) via `XNET_BILLING_PRICE_PLANS` (a JSON object).
 */

import type { BillingState, Subscription } from '@xnetjs/billing'
import { asPlanId, resolveEntitlements, type PlanEntitlements } from '@xnetjs/entitlements'

/** Maps a provider price/plan ref (e.g. Stripe `price_pro`) to a `PlanId`. */
export type PriceToPlan = Record<string, string>

/** Parse the `XNET_BILLING_PRICE_PLANS` JSON map, tolerating absence/garbage. */
export function parsePricePlans(raw: string | undefined): PriceToPlan {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: PriceToPlan = {}
    for (const [price, plan] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof plan === 'string') out[price] = plan
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Resolve a subscription to its `PlanEntitlements`. An active/trialing
 * subscription whose `priceRef` maps to a known plan yields that plan's
 * entitlements; anything else (no sub, inactive, unmapped price, unknown plan)
 * yields `null`.
 */
export function entitlementsForSubscription(
  subscription: Subscription | null,
  priceToPlan: PriceToPlan
): PlanEntitlements | null {
  if (!subscription) return null
  if (subscription.status !== 'active' && subscription.status !== 'trialing') return null
  const planId = priceToPlan[subscription.priceRef]
  if (!planId) return null
  try {
    return resolveEntitlements(asPlanId(planId))
  } catch {
    return null // unknown plan id in the operator's mapping
  }
}

/** Convenience over a full `BillingState` (uses its current subscription). */
export function entitlementsForBillingState(
  state: BillingState,
  priceToPlan: PriceToPlan
): PlanEntitlements | null {
  return entitlementsForSubscription(state.subscription, priceToPlan)
}
