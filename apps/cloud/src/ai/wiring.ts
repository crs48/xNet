/**
 * xNet Cloud — managed-AI env wiring.
 *
 * Assembles the {@link AiChatDeps} for `POST /ai/chat` and the
 * {@link VirtualKeyManager} the control plane uses to mint per-tenant keys, both
 * from the environment (exploration 0200, slice A). Returns `undefined` when AI is
 * not configured, so the route stays unmounted and key provisioning is skipped —
 * the same null-fallback pattern as the rest of the control plane (PR #175).
 *
 * The thin SDK adapters (LiteLLM gateway/keys, real Stripe meters) need a live
 * smoke test at deploy; the logic around them is unit-tested with fakes.
 */

import type { ControlPlane } from '../control-plane'
import type { AiChatDeps, AiTenantContext } from './route'
import type { Context } from 'hono'
import {
  DEFAULT_BUDGET_WINDOW,
  FakeStripeBilling,
  GatewayClient,
  LiteLLMKeyManager,
  OpenRouterGatewayClient,
  OpenRouterKeyManager,
  StripeBillingAdapter,
  windowStartMs,
  type ChatGateway,
  type StripeBilling,
  type UsageLedger,
  type VirtualKeyManager
} from '@xnetjs/cloud'
import Stripe from 'stripe'
import { createModelCatalog } from './models'
import { pricingFromEnv } from './pricing'

/**
 * Which gateway the managed-AI path talks to. Set `AI_GATEWAY_PROVIDER`
 * (`openrouter` | `litellm`) explicitly, or we sniff it from the base URL
 * (`openrouter.ai` → OpenRouter, else LiteLLM). Drives both the chat client and
 * the key manager so they always agree (exploration 0201).
 */
export type AiGatewayProvider = 'openrouter' | 'litellm'

export function aiGatewayProvider(env: NodeJS.ProcessEnv = process.env): AiGatewayProvider {
  const explicit = env.AI_GATEWAY_PROVIDER?.trim().toLowerCase()
  if (explicit === 'openrouter' || explicit === 'litellm') return explicit
  return (env.AI_GATEWAY_BASE_URL ?? '').includes('openrouter.ai') ? 'openrouter' : 'litellm'
}

/** The OpenAI-compatible chat client for the configured provider. */
function gatewayFromEnv(env: NodeJS.ProcessEnv, baseUrl: string): ChatGateway {
  if (aiGatewayProvider(env) === 'openrouter') {
    return new OpenRouterGatewayClient({
      baseUrl,
      referer: env.AI_GATEWAY_REFERER ?? 'https://xnet.fyi',
      title: env.AI_GATEWAY_TITLE ?? 'xNet Cloud'
    })
  }
  return new GatewayClient({ baseUrl })
}

/**
 * The virtual-key manager the control plane uses to mint per-tenant budgeted keys.
 *
 * - OpenRouter: a management key (`OPENROUTER_MANAGEMENT_KEY`) over the Provisioning
 *   API; keys carry a USD `limit` that resets monthly.
 * - LiteLLM: a master key (`LITELLM_MASTER_KEY`) + base URL (`LITELLM_BASE_URL`,
 *   defaulting to the shared `AI_GATEWAY_BASE_URL`).
 *
 * Returns undefined when the chosen provider's admin credential is absent, so key
 * provisioning is simply skipped (null-fallback, like the rest of the control plane).
 */
export function aiKeysFromEnv(env: NodeJS.ProcessEnv = process.env): VirtualKeyManager | undefined {
  if (aiGatewayProvider(env) === 'openrouter') {
    if (!env.OPENROUTER_MANAGEMENT_KEY) return undefined
    return new OpenRouterKeyManager({
      managementKey: env.OPENROUTER_MANAGEMENT_KEY,
      ...(env.AI_GATEWAY_BASE_URL ? { baseUrl: env.AI_GATEWAY_BASE_URL } : {})
    })
  }
  const baseUrl = env.LITELLM_BASE_URL ?? env.AI_GATEWAY_BASE_URL
  if (!baseUrl || !env.LITELLM_MASTER_KEY) return undefined
  return new LiteLLMKeyManager({ baseUrl, masterKey: env.LITELLM_MASTER_KEY })
}

/** Real Stripe meter adapter when a secret key is set, else the keyless fake. */
function billingFromEnv(env: NodeJS.ProcessEnv): StripeBilling {
  return env.STRIPE_SECRET_KEY
    ? new StripeBillingAdapter(new Stripe(env.STRIPE_SECRET_KEY))
    : new FakeStripeBilling()
}

/**
 * Resolve the calling tenant for `/ai/chat`. The tenant's hub forwards with the
 * shared internal secret + an `x-tenant-id` header; we look up the record and
 * project it into the budget context. (A per-tenant gateway token would tighten
 * the blast radius — a hardening follow-up.) Returns null = 401.
 */
function tenantResolver(
  env: NodeJS.ProcessEnv,
  controlPlane: ControlPlane,
  nowMs: () => number
): (c: Context) => Promise<AiTenantContext | null> {
  const secret = env.XNET_CLOUD_INTERNAL_SECRET
  return async (c) => {
    if (!secret || c.req.header('x-internal-secret') !== secret) return null
    const tenantId = c.req.header('x-tenant-id')
    if (!tenantId) return null
    const record = await controlPlane.getTenant(tenantId)
    if (!record || !record.aiKeyRef || !record.entitlements.aiEnabled) return null
    // The self-set cap: prefer the windowed `aiBudget`, fall back to the legacy
    // monthly `aiCapUsd` for tenants provisioned before exploration 0244.
    const userCap = record.aiBudget?.capUsd ?? record.aiCapUsd ?? Number.POSITIVE_INFINITY
    const window = record.aiBudget?.window ?? DEFAULT_BUDGET_WINDOW
    return {
      tenantId: record.tenantId,
      virtualKey: record.aiKeyRef,
      customerId: record.stripeCustomerId ?? record.billingUserId,
      // Enforce the lower of the plan's hard cap and the tenant's self-set cap.
      budgetUsd: Math.min(userCap, record.entitlements.aiMonthlyBudgetUsd),
      includedUsd: record.entitlements.includedAiUsd,
      // Scope the budget to the tenant's window (resets weekly/monthly/rolling).
      periodStartMs: windowStartMs(window, nowMs()),
      // Plan-driven model switching: which models this tenant may pick + the default.
      ...(record.entitlements.aiModels !== undefined
        ? { aiModels: record.entitlements.aiModels }
        : {}),
      ...(record.entitlements.aiDefaultModel !== undefined
        ? { defaultModel: record.entitlements.aiDefaultModel }
        : {})
    }
  }
}

/**
 * Build the managed-AI route deps from the environment, or null when the gateway
 * is unconfigured (route stays unmounted). The chat path uses `AI_GATEWAY_BASE_URL`
 * (any OpenAI-compatible proxy — LiteLLM or OpenRouter). The `ledger` is shared
 * with the dashboard so "used / included / cap" reads the same accrued spend.
 */
export function aiChatDepsFromEnv(
  controlPlane: ControlPlane,
  ledger: UsageLedger,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: () => number = () => Date.now()
): AiChatDeps | null {
  if (!env.AI_GATEWAY_BASE_URL) return null
  const allowedModels = env.AI_ALLOWED_MODELS
    ? env.AI_ALLOWED_MODELS.split(',')
        .map((m) => m.trim())
        .filter(Boolean)
    : undefined
  // The model picker is driven by OpenRouter's live catalog; on LiteLLM there is
  // no such endpoint, so the catalog (and the picker's price/context badges) is
  // OpenRouter-only — the route then falls back to id-only cards from the plan policy.
  const catalog =
    aiGatewayProvider(env) === 'openrouter'
      ? createModelCatalog({ baseUrl: env.AI_GATEWAY_BASE_URL })
      : undefined
  return {
    gateway: gatewayFromEnv(env, env.AI_GATEWAY_BASE_URL),
    ledger,
    billing: billingFromEnv(env),
    pricingFor: pricingFromEnv(env),
    resolveTenant: tenantResolver(env, controlPlane, nowMs),
    ...(allowedModels ? { allowedModels } : {}),
    ...(catalog ? { modelCatalog: () => catalog.get() } : {})
  }
}
