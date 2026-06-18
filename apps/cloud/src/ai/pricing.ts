/**
 * xNet Cloud — managed-AI retail pricing table.
 *
 * Maps a model id to its provider token rates and applies our retail markup, so
 * the metered gateway charges cost-plus (exploration 0200). Rates are USD per 1M
 * tokens (June 2026 list prices; verify against the provider before launch). The
 * markup defaults to 1.25× (≈20% gross over provider cost, before gateway/Stripe
 * overhead) and is overridable with `AI_MARKUP`. An unknown model falls back to a
 * conservative default so we never charge $0 for a billable call.
 */

import type { TokenPricing } from '@xnetjs/cloud'

/** Provider list rates, USD per 1M tokens (input / output). Markup applied on top. */
export const PROVIDER_RATES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 }
}

/** Conservative fallback for an unmapped model — priced like a mid-tier model. */
export const DEFAULT_RATE = { input: 3, output: 15 }

/** Parse `AI_MARKUP` (default 1.25); clamp to >= 1 so we never charge below cost. */
export function markupFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.AI_MARKUP)
  return Number.isFinite(raw) && raw >= 1 ? raw : 1.25
}

/** A `pricingFor(model)` resolver for the metered gateway, with the env markup baked in. */
export function pricingFromEnv(env: NodeJS.ProcessEnv = process.env): (model: string) => TokenPricing {
  const markup = markupFromEnv(env)
  return (model: string): TokenPricing => {
    const rate = PROVIDER_RATES[model] ?? DEFAULT_RATE
    return { inputUsdPerMillion: rate.input, outputUsdPerMillion: rate.output, markup }
  }
}
