/**
 * @xnetjs/cloud/ai — OpenRouter account credit balance.
 *
 * The managed fleet draws on one OpenRouter account; if its credit balance hits
 * zero, *every* tenant 402s. This reads `GET /api/v1/credits` so ops can alert
 * (and ideally auto-top-up) before that happens (exploration 0244). Thin +
 * `fetch`-injectable, so it's testable with no network and no real key.
 */

import { VirtualKeyError } from './keys'

export interface CreditBalance {
  /** Total credits purchased (USD). */
  totalCreditsUsd: number
  /** Total credits spent so far (USD). */
  totalUsageUsd: number
  /** Remaining balance (USD) = purchased − used. */
  remainingUsd: number
}

interface CreditsResponse {
  data?: { total_credits?: number; total_usage?: number }
}

export interface OpenRouterCreditsConfig {
  /** An OpenRouter API key (account-scoped) for the read. Never logged. */
  apiKey: string
  /** OpenRouter API base, e.g. `https://openrouter.ai/api/v1`. */
  baseUrl?: string
  fetchImpl?: typeof fetch
}

/** Reads the managed account's live credit balance from OpenRouter. */
export class OpenRouterCreditsClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: OpenRouterCreditsConfig) {
    this.baseUrl = (config.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    this.apiKey = config.apiKey
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  async getBalance(): Promise<CreditBalance> {
    const res = await this.fetchImpl(`${this.baseUrl}/credits`, {
      method: 'GET',
      headers: { authorization: `Bearer ${this.apiKey}` }
    })
    if (!res.ok) throw new VirtualKeyError(`openrouter GET /credits → ${res.status}`, res.status)
    const data = (await res.json().catch(() => ({}))) as CreditsResponse
    const totalCreditsUsd = data.data?.total_credits ?? 0
    const totalUsageUsd = data.data?.total_usage ?? 0
    return {
      totalCreditsUsd,
      totalUsageUsd,
      remainingUsd: totalCreditsUsd - totalUsageUsd
    }
  }
}

/** True when the remaining balance is at/under the alert threshold (USD). */
export function isLowBalance(balance: CreditBalance, thresholdUsd: number): boolean {
  return balance.remainingUsd <= thresholdUsd
}
