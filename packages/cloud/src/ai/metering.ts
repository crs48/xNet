/**
 * @xnetjs/cloud/ai — usage → marked-up dollars → ledger + Stripe meter.
 *
 * Bridges a model call's token usage into `@xnetjs/cloud/billing`: compute the
 * marked-up charge, record it in the idempotent ledger, and (only on first record)
 * emit a Stripe meter event. The idempotency key prevents double-billing on retries.
 */

import type { TokenUsage } from './gateway'
import {
  computeChargeFromCostUsd,
  computeChargeUsd,
  computeProviderCostUsd,
  type StripeBilling,
  type TokenPricing,
  type UsageLedger
} from '../billing'

export interface MeterUsageArgs {
  tenantId: string
  /** Stripe customer id for the meter event. */
  customerId: string
  /** Idempotency key, e.g. `${tenantId}:${sessionId}:${requestId}`. */
  key: string
  model: string
  usage: TokenUsage
  pricing: TokenPricing
  /**
   * Exact provider cost (USD) reported by the gateway (e.g. OpenRouter `usage.cost`).
   * When set, the charge is `providerCostUsd × markup` (rounded up) and this exact
   * value is recorded as the ledger's `providerCostUsd`. When omitted, both are
   * estimated from `usage` × `pricing` (the static-table path).
   */
  providerCostUsd?: number
  ledger: UsageLedger
  billing: StripeBilling
  /** Meter event name; defaults to `ai_usage_usd`. */
  eventName?: string
  timestampMs?: number
}

export interface MeterUsageResult {
  chargeUsd: number
  /** False if this key was already metered (duplicate) — no meter event emitted. */
  recorded: boolean
}

export async function meterUsage(args: MeterUsageArgs): Promise<MeterUsageResult> {
  // Prefer the gateway's ground-truth cost; fall back to the static-table estimate.
  const hasExactCost = args.providerCostUsd !== undefined
  const providerCostUsd = hasExactCost
    ? args.providerCostUsd!
    : computeProviderCostUsd(args.usage.inputTokens, args.usage.outputTokens, args.pricing)
  const chargeUsd = hasExactCost
    ? computeChargeFromCostUsd(providerCostUsd, args.pricing.markup)
    : computeChargeUsd(args.usage.inputTokens, args.usage.outputTokens, args.pricing)
  const { recorded } = await args.ledger.record({
    key: args.key,
    tenantId: args.tenantId,
    inputTokens: args.usage.inputTokens,
    outputTokens: args.usage.outputTokens,
    model: args.model,
    chargeUsd,
    providerCostUsd,
    timestampMs: args.timestampMs ?? 0
  })
  // Emit the meter event only the first time we see this key (idempotency).
  if (recorded) {
    await args.billing.recordMeterEvent({
      eventName: args.eventName ?? 'ai_usage_usd',
      customerId: args.customerId,
      value: chargeUsd.toFixed(8),
      identifier: args.key,
      ...(args.timestampMs ? { timestampSec: Math.floor(args.timestampMs / 1000) } : {})
    })
  }
  return { chargeUsd, recorded }
}
