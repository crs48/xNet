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
  /** Rolling availability over the plan's SLO window, as a percentage. */
  uptimePct: number | null
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

/** Pure composer: join the live hub health with the SLI window + AI spend. */
export function composeDashboardLive(input: {
  health: HubHealth | null
  sli: TenantSli | null
  aiUsedUsd: number | null
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
    uptimePct: input.sli ? Number((input.sli.availability * 100).toFixed(2)) : null,
    aiUsedUsd: input.aiUsedUsd
  }
}
