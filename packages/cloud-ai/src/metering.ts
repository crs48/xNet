/**
 * @xnetjs/cloud-ai — usage → marked-up dollars → ledger + Stripe meter.
 *
 * Bridges a model call's token usage into `@xnetjs/cloud-billing`: compute the
 * marked-up charge, record it in the idempotent ledger, and (only on first record)
 * emit a Stripe meter event. The idempotency key prevents double-billing on retries.
 */

import type { TokenUsage } from './gateway'
import {
  computeChargeUsd,
  computeProviderCostUsd,
  type StripeBilling,
  type TokenPricing,
  type UsageLedger
} from '@xnetjs/cloud-billing'

export interface MeterUsageArgs {
  tenantId: string
  /** Stripe customer id for the meter event. */
  customerId: string
  /** Idempotency key, e.g. `${tenantId}:${sessionId}:${requestId}`. */
  key: string
  model: string
  usage: TokenUsage
  pricing: TokenPricing
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
  const chargeUsd = computeChargeUsd(args.usage.inputTokens, args.usage.outputTokens, args.pricing)
  const providerCostUsd = computeProviderCostUsd(
    args.usage.inputTokens,
    args.usage.outputTokens,
    args.pricing
  )
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
