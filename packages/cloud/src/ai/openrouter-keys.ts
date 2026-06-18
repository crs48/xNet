/**
 * @xnetjs/cloud/ai — OpenRouter provisioned-key manager.
 *
 * The OpenRouter analogue of {@link LiteLLMKeyManager}: each tenant gets its own
 * OpenRouter API key with a USD spend `limit` that resets monthly, minted via the
 * **Provisioning API** with a server-side *management* key (exploration 0201).
 *
 * Impedance note: `POST /keys` returns the secret `key` (used as the gateway
 * Bearer — our `VirtualKey.key`) **and** a `data.hash`. The secret is shown only
 * once; update/delete address the key by hash. So we surface the hash as
 * {@link VirtualKey.manageId} and the control plane stores it alongside the secret.
 *
 * Thin + `fetch`-injectable; validated against a live account at deploy.
 */

import type { CreateVirtualKeyInput, VirtualKey, VirtualKeyManager } from './keys'
import { VirtualKeyError } from './keys'

export interface OpenRouterKeyManagerConfig {
  /** Management API key (Bearer for `/keys` admin calls). Mint-only; never logged. */
  managementKey: string
  /** OpenRouter API base, e.g. `https://openrouter.ai/api/v1`. */
  baseUrl?: string
  fetchImpl?: typeof fetch
}

interface CreateKeyResponse {
  /** The secret key string — returned only once, at create. */
  key?: string
  data?: { hash?: string }
}

/**
 * Real manager over OpenRouter's Provisioning API (`POST/PATCH/DELETE /keys`).
 * `limit` is the hard USD cap OpenRouter enforces; `limit_reset: 'monthly'` mirrors
 * LiteLLM's `budget_duration: '30d'`.
 */
export class OpenRouterKeyManager implements VirtualKeyManager {
  private readonly baseUrl: string
  private readonly managementKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: OpenRouterKeyManagerConfig) {
    this.baseUrl = (config.baseUrl ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
    this.managementKey = config.managementKey
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  async create(input: CreateVirtualKeyInput): Promise<VirtualKey> {
    const data = (await this.call('POST', '/keys', {
      name: input.alias,
      limit: input.maxBudgetUsd,
      limit_reset: 'monthly'
    })) as CreateKeyResponse
    const key = data.key
    const hash = data.data?.hash
    if (!key || !hash) {
      throw new VirtualKeyError('openrouter POST /keys returned no key/hash', 502)
    }
    return { key, manageId: hash, alias: input.alias, maxBudgetUsd: input.maxBudgetUsd }
  }

  async update(manageId: string, patch: { maxBudgetUsd?: number }): Promise<void> {
    if (patch.maxBudgetUsd === undefined) return
    await this.call('PATCH', `/keys/${encodeURIComponent(manageId)}`, {
      limit: patch.maxBudgetUsd
    })
  }

  async remove(manageId: string): Promise<void> {
    await this.call('DELETE', `/keys/${encodeURIComponent(manageId)}`, undefined)
  }

  private async call(method: string, path: string, body: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.managementKey}`
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    })
    if (!res.ok) throw new VirtualKeyError(`openrouter ${method} ${path} → ${res.status}`, res.status)
    return res.json().catch(() => ({}))
  }
}
