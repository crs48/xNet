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

import type { ModelCard } from './models'
import type { Context } from 'hono'
import {
  aiBudgetStatus,
  BudgetExceededError,
  GatewayError,
  isStreamingGateway,
  MeteredGateway,
  type ChatGateway,
  type ChatMessage,
  type StripeBilling,
  type TokenPricing,
  type UsageLedger
} from '@xnetjs/cloud'
import { aiModelAllowed } from '@xnetjs/entitlements'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'

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
  /**
   * Models this tenant's plan may pick (OpenRouter ids). `'all'`/undefined ⇒ any
   * model the gateway serves. Gates both `/ai/chat` and the `/ai/models` catalog.
   */
  aiModels?: 'all' | readonly string[]
  /** The model used when a chat request omits one (the plan's default). */
  defaultModel?: string
}

export interface AiChatDeps {
  gateway: ChatGateway
  ledger: UsageLedger
  billing: StripeBilling
  /** Provider rates × retail markup, per model. */
  pricingFor: (model: string) => TokenPricing
  /** Authenticate + resolve the calling tenant, or null for unauthorized. */
  resolveTenant: (c: Context) => Promise<AiTenantContext | null>
  /** Models the managed gateway will serve; omit to allow any. A global cap on top of the plan policy. */
  allowedModels?: string[]
  /** The OpenRouter model catalog (cached), powering `GET /ai/models`. Omit to disable the route. */
  modelCatalog?: () => Promise<ModelCard[]>
  /**
   * Retail markup applied to catalog prices in `GET /ai/models` so the picker shows
   * what the *user* pays, never the provider list price or our COGS (exploration
   * 0244). Defaults to 1 (pass-through). The markup multiplier itself is never sent.
   */
  retailMarkup?: number
  timestampMs?: () => number
}

/** Round a retail token price to 4 decimals (USD per 1M tokens) — display precision. */
const roundRetail = (usdPerM: number): number => Math.round(usdPerM * 1e4) / 1e4

/** Apply the retail markup to a card's (non-null) per-million prices. */
function toRetailCard(card: ModelCard, markup: number): ModelCard {
  if (markup === 1) return card
  return {
    ...card,
    inUsdPerM: card.inUsdPerM === null ? null : roundRetail(card.inUsdPerM * markup),
    outUsdPerM: card.outUsdPerM === null ? null : roundRetail(card.outUsdPerM * markup)
  }
}

interface AiChatBody {
  model?: string
  /** Optional same-tier fallback models (OpenRouter model-layer failover). */
  fallbackModels?: string[]
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
    // Fall back to the plan's default model when the client omits one.
    const model = body.model ?? t.defaultModel
    if (!model || !Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: 'bad_request' }, 400)
    }
    // Two gates: the global env allow-list (operator cap) and the per-plan policy.
    if (deps.allowedModels && !deps.allowedModels.includes(model)) {
      return c.json({ error: 'model_not_allowed', model }, 400)
    }
    if (!aiModelAllowed(t.aiModels, model)) {
      return c.json({ error: 'model_not_allowed', model }, 400)
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
          model,
          messages: body.messages,
          // Only forward fallbacks the plan also permits (defense-in-depth).
          ...(body.fallbackModels?.length
            ? { fallbackModels: body.fallbackModels.filter((m) => aiModelAllowed(t.aiModels, m)) }
            : {}),
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

  // Streaming variant of /ai/chat (SSE). Same auth + model gating + budget cap as
  // the unary path; deltas arrive as `event: delta`, then a single `event: done`
  // with the budget snapshot. Metering happens off the final chunk's usage.cost,
  // so a streamed call bills identically to the unary one (exploration 0244).
  app.post('/ai/chat/stream', async (c) => {
    const t = await deps.resolveTenant(c)
    if (!t) return c.json({ error: 'unauthorized' }, 401)
    if (!isStreamingGateway(deps.gateway)) {
      return c.json({ error: 'streaming_unsupported' }, 501)
    }

    const body = (await c.req.json().catch(() => ({}))) as AiChatBody
    const model = body.model ?? t.defaultModel
    if (!model || !Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json({ error: 'bad_request' }, 400)
    }
    if (deps.allowedModels && !deps.allowedModels.includes(model)) {
      return c.json({ error: 'model_not_allowed', model }, 400)
    }
    if (!aiModelAllowed(t.aiModels, model)) {
      return c.json({ error: 'model_not_allowed', model }, 400)
    }
    // Pre-flight the budget so an over-cap tenant gets a clean 402 instead of a
    // half-open SSE stream (status can't change once streaming has begun).
    const spentBefore = await deps.ledger.totalChargeUsd(t.tenantId, t.periodStartMs)
    if (spentBefore >= t.budgetUsd) {
      return c.json(
        { error: 'ai_budget_exceeded', spentUsd: spentBefore, budgetUsd: t.budgetUsd },
        402
      )
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
    const key = `${t.tenantId}:${body.sessionId ?? 'na'}:${body.requestId ?? 'na'}`

    return streamSSE(c, async (stream) => {
      try {
        for await (const chunk of gateway.chatStream({
          tenantId: t.tenantId,
          key,
          request: {
            virtualKey: t.virtualKey,
            model,
            messages: body.messages as ChatMessage[],
            ...(body.fallbackModels?.length
              ? { fallbackModels: body.fallbackModels.filter((m) => aiModelAllowed(t.aiModels, m)) }
              : {}),
            ...(body.maxTokens ? { maxTokens: body.maxTokens } : {}),
            ...(body.mockResponse !== undefined ? { mockResponse: body.mockResponse } : {})
          }
        })) {
          if (chunk.delta) {
            await stream.writeSSE({ event: 'delta', data: JSON.stringify({ text: chunk.delta }) })
          }
          if (chunk.result) {
            const spent = await deps.ledger.totalChargeUsd(t.tenantId, t.periodStartMs)
            await stream.writeSSE({
              event: 'done',
              data: JSON.stringify({
                model: chunk.result.model,
                usage: chunk.result.usage,
                spendThisPeriodUsd: spent,
                includedUsd: t.includedUsd,
                budgetUsd: t.budgetUsd,
                budgetState: aiBudgetStatus(spent, t.includedUsd, t.budgetUsd).state
              })
            })
          }
        }
      } catch (err) {
        const payload =
          err instanceof BudgetExceededError
            ? { error: 'ai_budget_exceeded', spentUsd: err.spentUsd, budgetUsd: err.budgetUsd }
            : err instanceof GatewayError
              ? { error: 'gateway_error', status: err.status }
              : { error: 'stream_error' }
        await stream.writeSSE({ event: 'error', data: JSON.stringify(payload) })
      }
    })
  })

  // The plan-gated model catalog that drives the client's model picker. The cards
  // are the cached OpenRouter catalog intersected with the tenant's `aiModels`
  // policy; when the catalog is unavailable but the plan names models, we still
  // return id-only cards so the picker is never empty.
  app.get('/ai/models', async (c) => {
    const t = await deps.resolveTenant(c)
    if (!t) return c.json({ error: 'unauthorized' }, 401)

    const policy = t.aiModels ?? 'all'
    const all = deps.modelCatalog ? await deps.modelCatalog().catch(() => []) : []
    const globalCap = deps.allowedModels ? new Set(deps.allowedModels) : null
    let models = all.filter(
      (m) => aiModelAllowed(policy, m.id) && (globalCap === null || globalCap.has(m.id))
    )
    if (models.length === 0 && Array.isArray(policy)) {
      models = policy
        .filter((id) => globalCap === null || globalCap.has(id))
        .map((id) => ({
          id,
          name: id,
          family: id.split('/')[0] ?? id,
          inUsdPerM: null,
          outUsdPerM: null,
          contextLength: null,
          modality: null
        }))
    }
    // Show retail prices (what the user pays), never the provider list price.
    const markup = deps.retailMarkup ?? 1
    return c.json({
      models: models.map((m) => toRetailCard(m, markup)),
      defaultModel: t.defaultModel ?? null
    })
  })

  return app
}
