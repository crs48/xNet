/**
 * @xnetjs/cloud/ai — budget-guarded, metered gateway.
 *
 * Wraps a `ChatGateway` with the two protections from explorations 0148/0175:
 *  1. a **client-side budget hard-stop** (check accrued spend before calling), and
 *  2. **metering** of every successful call into the ledger + Stripe.
 *
 * LiteLLM enforces the per-virtual-key budget too; this is defense-in-depth so we
 * never even issue a provider call for an over-budget tenant.
 */

import type { ChatGateway, ChatRequest, ChatResult, ChatStreamChunk } from './gateway'
import type { StripeBilling, TokenPricing, UsageLedger } from '../billing'
import { isStreamingGateway } from './gateway'
import { meterUsage } from './metering'

export class BudgetExceededError extends Error {
  constructor(
    readonly tenantId: string,
    readonly spentUsd: number,
    readonly budgetUsd: number
  ) {
    super(`tenant ${tenantId} over budget: $${spentUsd.toFixed(4)} >= $${budgetUsd.toFixed(4)}`)
    this.name = 'BudgetExceededError'
  }
}

export interface MeteredGatewayDeps {
  gateway: ChatGateway
  ledger: UsageLedger
  billing: StripeBilling
  /** Resolve token pricing for a model (with markup baked in). */
  pricingFor: (model: string) => TokenPricing
  /** The tenant's prepaid budget / hard cap, in USD. */
  budgetUsdFor: (tenantId: string) => Promise<number>
  /** Map a tenant to its Stripe customer id. */
  customerIdFor: (tenantId: string) => string
  /**
   * Start of the tenant's current billing period (ms). The budget check sums only
   * spend since this instant, so a *monthly* cap resets each period. Omit for an
   * all-time budget (the default — preserves the original behavior).
   */
  periodStartMsFor?: (tenantId: string) => Promise<number>
  timestampMs?: () => number
}

export interface MeteredChatArgs {
  tenantId: string
  /** Idempotency key for this call, e.g. `${tenantId}:${sessionId}:${requestId}`. */
  key: string
  request: ChatRequest
}

export class MeteredGateway {
  constructor(private readonly deps: MeteredGatewayDeps) {}

  async chat(args: MeteredChatArgs): Promise<ChatResult> {
    await this.assertUnderBudget(args.tenantId)
    const result = await this.deps.gateway.chat(args.request)
    await this.meter(args, result)
    return result
  }

  /**
   * Streaming variant: same budget hard-stop, then proxy the gateway's SSE deltas,
   * and meter off the **final** `result` chunk — so a streamed call bills exactly
   * the same retail charge as the unary path for an identical `usage.cost`
   * (exploration 0244). Requires a {@link StreamingChatGateway}.
   */
  async *chatStream(args: MeteredChatArgs): AsyncIterable<ChatStreamChunk> {
    await this.assertUnderBudget(args.tenantId)
    const gateway = this.deps.gateway
    if (!isStreamingGateway(gateway)) {
      throw new Error('gateway does not support streaming')
    }
    for await (const chunk of gateway.chatStream(args.request)) {
      if (chunk.delta) yield { delta: chunk.delta }
      if (chunk.result) {
        await this.meter(args, chunk.result)
        yield { result: chunk.result }
      }
    }
  }

  /** Throw {@link BudgetExceededError} if the tenant is already at/over budget. */
  private async assertUnderBudget(tenantId: string): Promise<void> {
    const periodStartMs = await this.deps.periodStartMsFor?.(tenantId)
    const spent = await this.deps.ledger.totalChargeUsd(tenantId, periodStartMs)
    const budget = await this.deps.budgetUsdFor(tenantId)
    if (spent >= budget) {
      throw new BudgetExceededError(tenantId, spent, budget) // hard stop — no provider call
    }
  }

  /** Record one completed call into the ledger + Stripe (idempotent by key). */
  private async meter(args: MeteredChatArgs, result: ChatResult): Promise<void> {
    await meterUsage({
      tenantId: args.tenantId,
      customerId: this.deps.customerIdFor(args.tenantId),
      key: args.key,
      model: result.model,
      usage: result.usage,
      pricing: this.deps.pricingFor(result.model),
      ...(result.providerCostUsd !== undefined ? { providerCostUsd: result.providerCostUsd } : {}),
      ledger: this.deps.ledger,
      billing: this.deps.billing,
      timestampMs: this.deps.timestampMs?.() ?? 0
    })
  }
}
