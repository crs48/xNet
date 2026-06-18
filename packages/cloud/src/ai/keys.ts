/**
 * @xnetjs/cloud/ai — LiteLLM virtual-key manager.
 *
 * Each tenant on a paid plan gets its own LiteLLM **virtual key** (`sk-…`) that
 * carries a hard budget LiteLLM enforces per window. The control plane creates
 * one when it provisions an `aiEnabled` hub and stores the key server-side (it is
 * the credential the metered gateway sends as `Bearer`; it never reaches the
 * client). This is the provisioning seam from exploration 0200, slice A.
 *
 * The port is testable with no LiteLLM proxy (`FakeVirtualKeyManager`); the real
 * `LiteLLMKeyManager` is a thin wrapper over LiteLLM's admin API with an injected
 * `fetch` — validated against a live proxy at deploy time.
 */

export interface CreateVirtualKeyInput {
  /** Stable alias (we use the `tenantId`) so re-provision is idempotent. */
  alias: string
  /** Hard budget LiteLLM enforces per window, in USD. */
  maxBudgetUsd: number
  /** Optional model allow-list; omit for the proxy's default set. */
  models?: string[]
  /** Budget reset window, e.g. `'30d'` (LiteLLM resets accrued spend each window). */
  budgetDuration?: string
}

export interface VirtualKey {
  /** The virtual key (`sk-…`) used as the gateway Bearer. A server-side secret. */
  key: string
  /**
   * Handle for management calls (`update`/`remove`). Equals `key` for LiteLLM; for
   * OpenRouter it's the key's `hash` — the secret is only returned once at create
   * and the Provisioning API addresses keys by hash. Falls back to `key` when omitted.
   */
  manageId?: string
  alias: string
  maxBudgetUsd: number
}

/** Create / update / remove a tenant's managed-AI virtual key. */
export interface VirtualKeyManager {
  create(input: CreateVirtualKeyInput): Promise<VirtualKey>
  /** `manageId` is {@link VirtualKey.manageId} (= `key` for LiteLLM, the hash for OpenRouter). */
  update(manageId: string, patch: { maxBudgetUsd?: number; models?: string[] }): Promise<void>
  remove(manageId: string): Promise<void>
}

/** In-memory manager for dev + tests: deterministic keys, no proxy required. */
export class FakeVirtualKeyManager implements VirtualKeyManager {
  private readonly byKey = new Map<string, VirtualKey>()

  async create(input: CreateVirtualKeyInput): Promise<VirtualKey> {
    const key = `sk-fake-${input.alias}`
    const vk: VirtualKey = {
      key,
      manageId: key, // LiteLLM-style: the secret is also the management handle
      alias: input.alias,
      maxBudgetUsd: input.maxBudgetUsd
    }
    this.byKey.set(vk.key, vk)
    return vk
  }
  async update(key: string, patch: { maxBudgetUsd?: number }): Promise<void> {
    const vk = this.byKey.get(key)
    if (vk && patch.maxBudgetUsd !== undefined) vk.maxBudgetUsd = patch.maxBudgetUsd
  }
  async remove(key: string): Promise<void> {
    this.byKey.delete(key)
  }
  /** Test/inspection helper — the keys this fake currently holds. */
  list(): VirtualKey[] {
    return [...this.byKey.values()]
  }
}

export class VirtualKeyError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'VirtualKeyError'
  }
}

export interface LiteLLMKeyManagerConfig {
  /** LiteLLM proxy base URL, e.g. `http://localhost:4000`. */
  baseUrl: string
  /** LiteLLM master key (admin). Stays server-side; never logged. */
  masterKey: string
  fetchImpl?: typeof fetch
}

/**
 * Real manager over LiteLLM's admin API (`/key/generate`, `/key/update`,
 * `/key/delete`). Thin + injectable; the proxy enforces the budget per window.
 */
export class LiteLLMKeyManager implements VirtualKeyManager {
  private readonly baseUrl: string
  private readonly masterKey: string
  private readonly fetchImpl: typeof fetch

  constructor(config: LiteLLMKeyManagerConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.masterKey = config.masterKey
    this.fetchImpl = config.fetchImpl ?? fetch
  }

  private async call(path: string, body: unknown): Promise<unknown> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.masterKey}` },
      body: JSON.stringify(body)
    })
    if (!res.ok) throw new VirtualKeyError(`litellm ${path} → ${res.status}`, res.status)
    return res.json().catch(() => ({}))
  }

  async create(input: CreateVirtualKeyInput): Promise<VirtualKey> {
    const data = (await this.call('/key/generate', {
      key_alias: input.alias,
      max_budget: input.maxBudgetUsd,
      ...(input.models ? { models: input.models } : {}),
      ...(input.budgetDuration ? { budget_duration: input.budgetDuration } : {})
    })) as { key?: string }
    if (!data.key) throw new VirtualKeyError('litellm /key/generate returned no key', 502)
    // LiteLLM addresses keys by the key value itself, so manageId === key.
    return {
      key: data.key,
      manageId: data.key,
      alias: input.alias,
      maxBudgetUsd: input.maxBudgetUsd
    }
  }

  async update(key: string, patch: { maxBudgetUsd?: number; models?: string[] }): Promise<void> {
    await this.call('/key/update', {
      key,
      ...(patch.maxBudgetUsd !== undefined ? { max_budget: patch.maxBudgetUsd } : {}),
      ...(patch.models ? { models: patch.models } : {})
    })
  }

  async remove(key: string): Promise<void> {
    await this.call('/key/delete', { keys: [key] })
  }
}
