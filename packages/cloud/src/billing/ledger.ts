/**
 * @xnetjs/cloud/billing — idempotent usage ledger.
 *
 * The authoritative, queryable record of metered usage (Stripe meter events are
 * write-only and can't be read back). The invariant: the same usage event — keyed
 * by `tenant:session:request` — must never be counted twice, even if the pipeline
 * receives duplicates (retries, redelivered webhooks).
 */

export interface UsageEntry {
  /** Idempotency key, e.g. `${tenantId}:${sessionId}:${requestId}`. */
  key: string
  tenantId: string
  inputTokens: number
  outputTokens: number
  model: string
  chargeUsd: number
  /** Provider's own cost, for margin reconciliation. */
  providerCostUsd: number
  timestampMs: number
}

export interface UsageLedger {
  /** Record an entry. Returns `{ recorded: false }` if the key was already seen. */
  record(entry: UsageEntry): Promise<{ recorded: boolean }>
  /**
   * Total marked-up charge for a tenant (omit for all tenants). Pass `sinceMs` to
   * scope to a billing period (entries with `timestampMs >= sinceMs`) — this is
   * how a *monthly* AI budget resets each period rather than accruing for life.
   */
  totalChargeUsd(tenantId?: string, sinceMs?: number): Promise<number>
  /** All entries for a tenant (omit for all), optionally scoped to `sinceMs`. */
  entries(tenantId?: string, sinceMs?: number): Promise<UsageEntry[]>
}

/** True when an entry is in scope for `(tenantId, sinceMs)` filters. */
export const inScope = (e: UsageEntry, tenantId?: string, sinceMs?: number): boolean =>
  (!tenantId || e.tenantId === tenantId) && (sinceMs === undefined || e.timestampMs >= sinceMs)

/** In-memory idempotent ledger for dev + tests; swap for a durable store in prod. */
export class MemoryUsageLedger implements UsageLedger {
  private readonly byKey = new Map<string, UsageEntry>()

  async record(entry: UsageEntry): Promise<{ recorded: boolean }> {
    if (this.byKey.has(entry.key)) return { recorded: false }
    this.byKey.set(entry.key, { ...entry })
    return { recorded: true }
  }

  async totalChargeUsd(tenantId?: string, sinceMs?: number): Promise<number> {
    let total = 0
    for (const e of this.byKey.values()) {
      if (inScope(e, tenantId, sinceMs)) total += e.chargeUsd
    }
    return total
  }

  async entries(tenantId?: string, sinceMs?: number): Promise<UsageEntry[]> {
    return [...this.byKey.values()]
      .filter((e) => inScope(e, tenantId, sinceMs))
      .map((e) => ({ ...e }))
  }
}
