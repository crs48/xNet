/**
 * xNet Cloud — live hub status for the dashboard (exploration 0207).
 *
 * The dashboard's tiles (is my hub up? how many devices are connected? what
 * region/version?) come from the tenant hub's *public* `GET /health` — provisioned
 * hubs are `allow-unauthenticated` and self-auth their data plane (0205), so the
 * control plane can read health without a token. `fetchHubHealth` is injectable +
 * timeout-bounded (a sleeping/slow hub must never hang the dashboard), and
 * `composeDashboardLive` is pure so the join with the SLI engine + AI ledger is
 * unit-testable without a network.
 */

import type { TenantSli } from './observability/health'

/** The slice of the hub's `/health` payload the dashboard renders. */
export interface HubHealth {
  status?: string
  uptime?: number
  version?: string
  region?: string
  rooms?: number
  docs?: { hot?: number; warm?: number; total?: number }
  connections?: { active?: number; max?: number }
  memory?: { rss?: number; heapUsed?: number }
  storage?: { usedBytes?: number }
  backup?: {
    replicating?: boolean
    lastWriteMs?: number | null
    /** Measured R2 replica sync time (exploration 0288); absent on older hubs. */
    lastSyncMs?: number | null
    /** Hub's own freshness verdict — the cold-demotion gate (fails closed). */
    fresh?: boolean
  }
}

/** The composed payload returned by `GET /dashboard/live.json`. */
export interface DashboardLive {
  /** Whether the hub answered its health probe just now. */
  reachable: boolean
  /** 'active' | 'sleeping' (scale-to-zero) | 'suspended' (canceled). */
  state: 'active' | 'sleeping' | 'suspended'
  uptimeSec: number | null
  version: string | null
  region: string | null
  connections: { active: number; max: number } | null
  rooms: number | null
  docs: { hot: number; warm: number; total: number } | null
  memoryRssBytes: number | null
  /** On-disk data used (from the hub), the plan quota, and the percentage. */
  storageUsedBytes: number | null
  storageQuotaBytes: number | null
  storagePct: number | null
  /**
   * True when stored data exceeds the plan quota — the hub is read-only for new
   * writes (it 507s). `storagePct` saturates at 100, so this is the only signal
   * that distinguishes "exactly full" from "over". Null when usage is unknown
   * (exploration 0216).
   */
  overQuota: boolean | null
  /**
   * Backup state: replicating to R2, "data as of" (≈ newest write), and — when the
   * hub measures it — the confirmed R2 replica sync time for a "data safe as of"
   * line (exploration 0288). `lastSyncMs` is null on older hubs / unknown scrapes.
   */
  backup: {
    replicating: boolean
    lastWriteMs: number | null
    lastSyncMs: number | null
  } | null
  /** Rolling availability over the plan's SLO window, as a percentage. */
  uptimePct: number | null
  /** p95 probe latency over the SLO window, in ms (from the control-plane probes). */
  p95LatencyMs: number | null
  /** Error budget remaining over the window, as a percentage (0..100). */
  errorBudgetPct: number | null
  /** Deploy-freeze signal: ship | caution | freeze. */
  errorBudgetPolicy: 'ship' | 'caution' | 'freeze' | null
  /** Human SLO label (e.g. "99.9% uptime"). */
  sloLabel: string | null
  /** Managed-AI spend this billing period (only when AI is enabled). */
  aiUsedUsd: number | null
}

export interface FetchHubHealthOpts {
  timeoutMs?: number
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
  nowMs?: () => number
}

/**
 * Fetch a hub's public `/health`, or null on any failure/timeout. Never throws —
 * the dashboard treats null as "unreachable / sleeping".
 */
export async function fetchHubHealth(
  hubUrl: string,
  opts: FetchHubHealthOpts = {}
): Promise<HubHealth | null> {
  if (!hubUrl) return null
  const timeoutMs = opts.timeoutMs ?? 2500
  const doFetch = opts.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await doFetch(`${hubUrl.replace(/\/$/, '')}/health`, {
      signal: controller.signal
    })
    if (!res.ok) return null
    return (await res.json()) as HubHealth
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null)

const storagePct = (used: number | null, quota: number | null): number | null =>
  used != null && quota != null && quota > 0
    ? Number(Math.min(100, (used / quota) * 100).toFixed(1))
    : null

const overQuota = (used: number | null, quota: number | null): boolean | null =>
  used != null && quota != null && quota > 0 ? used > quota : null

/** Pure composer: join the live hub health with the SLI window + AI spend. */
export function composeDashboardLive(input: {
  health: HubHealth | null
  sli: TenantSli | null
  aiUsedUsd: number | null
  /** The plan's storage quota, for the used/quota bar. */
  quotaBytes?: number
  subscriptionStatus?: 'active' | 'canceled'
  dataTier?: 'hot' | 'cold'
}): DashboardLive {
  const h = input.health
  const reachable = Boolean(h && (h.status === 'ok' || h.status === undefined))
  const state: DashboardLive['state'] =
    input.subscriptionStatus === 'canceled'
      ? 'suspended'
      : reachable
        ? 'active'
        : input.dataTier === 'cold'
          ? 'sleeping'
          : 'sleeping'
  return {
    reachable,
    state,
    uptimeSec: h ? num(h.uptime) : null,
    version: h?.version ?? null,
    region: h?.region ?? null,
    connections: h?.connections
      ? { active: num(h.connections.active) ?? 0, max: num(h.connections.max) ?? 0 }
      : null,
    rooms: h ? num(h.rooms) : null,
    docs: h?.docs
      ? {
          hot: num(h.docs.hot) ?? 0,
          warm: num(h.docs.warm) ?? 0,
          total: num(h.docs.total) ?? 0
        }
      : null,
    memoryRssBytes: h?.memory ? num(h.memory.rss) : null,
    storageUsedBytes: h?.storage ? num(h.storage.usedBytes) : null,
    storageQuotaBytes: num(input.quotaBytes),
    storagePct: storagePct(h?.storage ? num(h.storage.usedBytes) : null, num(input.quotaBytes)),
    overQuota: overQuota(h?.storage ? num(h.storage.usedBytes) : null, num(input.quotaBytes)),
    backup: h?.backup
      ? {
          replicating: Boolean(h.backup.replicating),
          lastWriteMs: num(h.backup.lastWriteMs),
          lastSyncMs: num(h.backup.lastSyncMs)
        }
      : null,
    uptimePct: input.sli ? Number((input.sli.availability * 100).toFixed(2)) : null,
    p95LatencyMs:
      input.sli && input.sli.sampleCount > 0 ? Math.round(input.sli.p95LatencyMs) : null,
    errorBudgetPct: input.sli ? Number((input.sli.budgetRemaining * 100).toFixed(1)) : null,
    errorBudgetPolicy: input.sli ? input.sli.policy : null,
    sloLabel: input.sli ? input.sli.sloLabel : null,
    aiUsedUsd: input.aiUsedUsd
  }
}
