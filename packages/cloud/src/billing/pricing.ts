/**
 * @xnetjs/cloud/billing — pure pricing math.
 *
 * Token usage → marked-up dollars. Pure and I/O-free so it can be exhaustively
 * unit-tested (exploration 0176). The cardinal rule: **always round UP** — a
 * rounding bug must never undercharge and erode margin.
 *
 * Rates are USD per million tokens, matching the `AICostModel` shape in
 * `@xnetjs/plugins` (`inputPerMillion` / `outputPerMillion`).
 */

export interface TokenPricing {
  /** Provider input price, USD per 1M tokens. */
  inputUsdPerMillion: number
  /** Provider output price, USD per 1M tokens. */
  outputUsdPerMillion: number
  /** Retail markup multiplier (e.g. 1.3 = 30% margin). Must be >= 1. */
  markup: number
}

/** Round up to 8 decimal places (sub-cent precision) — never undercharge. */
const ceil8 = (usd: number): number => Math.ceil(usd * 1e8) / 1e8

/**
 * The marked-up retail charge, in USD, for one model call.
 */
export function computeChargeUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: TokenPricing
): number {
  if (pricing.markup < 1) throw new Error(`markup must be >= 1, got ${pricing.markup}`)
  if (inputTokens < 0 || outputTokens < 0) throw new Error('token counts must be >= 0')
  const providerUsd =
    (inputTokens / 1_000_000) * pricing.inputUsdPerMillion +
    (outputTokens / 1_000_000) * pricing.outputUsdPerMillion
  return ceil8(providerUsd * pricing.markup)
}

/** The provider's own (un-marked-up) cost, for margin reconciliation/telemetry. */
export function computeProviderCostUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: TokenPricing
): number {
  return (
    (inputTokens / 1_000_000) * pricing.inputUsdPerMillion +
    (outputTokens / 1_000_000) * pricing.outputUsdPerMillion
  )
}
