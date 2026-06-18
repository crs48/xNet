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

import {
  FakeStripeBilling,
  GatewayClient,
  LiteLLMKeyManager,
  StripeBillingAdapter,
  type StripeBilling,
  type UsageLedger,
  type VirtualKeyManager
} from '@xnetjs/cloud'
import type { Context } from 'hono'
import Stripe from 'stripe'
import type { ControlPlane } from '../control-plane'
import { currentPeriodStartMs } from '../control-plane'
import type { AiChatDeps, AiTenantContext } from './route'
import { pricingFromEnv } from './pricing'

/** The LiteLLM virtual-key manager when LITELLM_BASE_URL + LITELLM_MASTER_KEY are set. */
export function aiKeysFromEnv(env: NodeJS.ProcessEnv = process.env): VirtualKeyManager | undefined {
  if (!env.LITELLM_BASE_URL || !env.LITELLM_MASTER_KEY) return undefined
  return new LiteLLMKeyManager({ baseUrl: env.LITELLM_BASE_URL, masterKey: env.LITELLM_MASTER_KEY })
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
    return {
      tenantId: record.tenantId,
      virtualKey: record.aiKeyRef,
      customerId: record.stripeCustomerId ?? record.billingUserId,
      budgetUsd: record.entitlements.aiMonthlyBudgetUsd,
      includedUsd: record.entitlements.includedAiUsd,
      periodStartMs: currentPeriodStartMs(nowMs())
    }
  }
}

/**
 * Build the managed-AI route deps from the environment, or null when LiteLLM is
 * unconfigured (route stays unmounted). The `ledger` is shared with the dashboard
 * so "used / included / cap" reads the same accrued spend.
 */
export function aiChatDepsFromEnv(
  controlPlane: ControlPlane,
  ledger: UsageLedger,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: () => number = () => Date.now()
): AiChatDeps | null {
  if (!env.LITELLM_BASE_URL) return null
  const allowedModels = env.AI_ALLOWED_MODELS
    ? env.AI_ALLOWED_MODELS.split(',').map((m) => m.trim()).filter(Boolean)
    : undefined
  return {
    gateway: new GatewayClient({ baseUrl: env.LITELLM_BASE_URL }),
    ledger,
    billing: billingFromEnv(env),
    pricingFor: pricingFromEnv(env),
    resolveTenant: tenantResolver(env, controlPlane, nowMs),
    ...(allowedModels ? { allowedModels } : {})
  }
}
