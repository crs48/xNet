/**
 * xNet Cloud — managed AI chat route (`POST /ai/chat`).
 *
 * The server-side seam for managed AI (exploration 0200, slice A). A tenant's hub
 * forwards a chat request here; we resolve the tenant's virtual key + budget,
 * run it through the dormant {@link MeteredGateway} (budget hard-stop → meter →
 * Stripe), and return the answer plus the spend-this-period so the client can show
 * "used / included / cap". Over-budget tenants get a `402` and **no** provider call.
 *
 * `resolveTenant` is injected so the hub→control-plane auth mechanism is pluggable
 * and the route is testable with a fake gateway + fake resolver (no LiteLLM, no
 * Stripe keys).
 */

import type { Context } from 'hono'
import {
  aiBudgetStatus,
  BudgetExceededError,
  GatewayError,
  MeteredGateway,
  type ChatGateway,
  type ChatMessage,
  type StripeBilling,
  type TokenPricing,
  type UsageLedger
} from '@xnetjs/cloud'
import { Hono } from 'hono'

/** Everything the route needs to know about the calling tenant. */
export interface AiTenantContext {
  tenantId: string
  /** LiteLLM virtual key (server-side secret) sent as the gateway Bearer. */
  virtualKey: string
  /** Stripe customer id for the metered overage. */
  customerId: string
  /** Hard monthly cap (USD) — requests stop here. */
  budgetUsd: number
  /** Included (free first tier) USD — for the "used / included" display. */
  includedUsd: number
  /** Start of the current billing period (ms) — scopes the budget to the month. */
  periodStartMs: number
}

export interface AiChatDeps {
  gateway: ChatGateway
  ledger: UsageLedger
  billing: StripeBilling
  /** Provider rates × retail markup, per model. */
  pricingFor: (model: string) => TokenPricing
  /** Authenticate + resolve the calling tenant, or null for unauthorized. */
  resolveTenant: (c: Context) => Promise<AiTenantContext | null>
  /** Models the managed gateway will serve; omit to allow any. */
  allowedModels?: string[]
  timestampMs?: () => number
}

interface AiChatBody {
  model?: string
  messages?: ChatMessage[]
  sessionId?: string
  requestId?: string
  maxTokens?: number
  /** LiteLLM passthrough for CI/dev — returns canned text instead of a provider call. */
  mockResponse?: string
}

/** A Hono app exposing `POST /ai/chat`, mounted by the control plane when AI is configured. */
export function createAiRoute(deps: AiChatDeps): Hono {
  const app = new Hono()

  app.post('/ai/chat', async (c) => {
    const t = await deps.resolveTenant(c)
    if (!t) return c.json({ error: 'unauthorized' }, 401)

    const body = (await c.req.json().catch(() => ({}))) as AiChatBody
    if (!body.model || !Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: 'bad_request' }, 400)
    }
    if (deps.allowedModels && !deps.allowedModels.includes(body.model)) {
      return c.json({ error: 'model_not_allowed', model: body.model }, 400)
    }

    const gateway = new MeteredGateway({
      gateway: deps.gateway,
      ledger: deps.ledger,
      billing: deps.billing,
      pricingFor: deps.pricingFor,
      budgetUsdFor: async () => t.budgetUsd,
      customerIdFor: () => t.customerId,
      periodStartMsFor: async () => t.periodStartMs,
      ...(deps.timestampMs ? { timestampMs: deps.timestampMs } : {})
    })

    // Idempotency key: the same (session, request) must never be billed twice.
    const key = `${t.tenantId}:${body.sessionId ?? 'na'}:${body.requestId ?? 'na'}`
    try {
      const result = await gateway.chat({
        tenantId: t.tenantId,
        key,
        request: {
          virtualKey: t.virtualKey,
          model: body.model,
          messages: body.messages,
          ...(body.maxTokens ? { maxTokens: body.maxTokens } : {}),
          ...(body.mockResponse !== undefined ? { mockResponse: body.mockResponse } : {})
        }
      })
      const spent = await deps.ledger.totalChargeUsd(t.tenantId, t.periodStartMs)
      return c.json({
        text: result.text,
        model: result.model,
        usage: result.usage,
        spendThisPeriodUsd: spent,
        includedUsd: t.includedUsd,
        budgetUsd: t.budgetUsd,
        // 'included' | 'overage' | 'near-cap' | 'over-cap' — drives the client gauge.
        budgetState: aiBudgetStatus(spent, t.includedUsd, t.budgetUsd).state
      })
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        return c.json(
          { error: 'ai_budget_exceeded', spentUsd: err.spentUsd, budgetUsd: err.budgetUsd },
          402 // Payment Required — the surprise-bill guard
        )
      }
      if (err instanceof GatewayError) {
        return c.json({ error: 'gateway_error', status: err.status }, 502)
      }
      throw err
    }
  })

  return app
}
