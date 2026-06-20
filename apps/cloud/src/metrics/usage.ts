/**
 * xNet Cloud — public usage/scale snapshot for the `/open` dashboard (exploration 0207).
 *
 * The business rollup (`rollup.ts`) tells the *financial* story (customers, MRR,
 * cost). This tells the *scale* story — how much product is actually being used —
 * which is the most persuasive, because it's measured, not projected:
 *
 *   • Tier 0 (live data we already collect): workspaces hosted, documents synced,
 *     AI tokens + requests metered.
 *   • Tier 1 (optional `StorageUsageReader`): gigabytes under management.
 *   • Tier 2 (optional, hub-reported via `HubUsageProbe.members`): people on xNet.
 *
 * Everything emitted is a FLEET-WIDE AGGREGATE — never per-tenant — and the whole
 * block is suppressed below the cohort floor (a tiny fleet is re-identifiable),
 * mirroring the k-anonymity rule the business rollup uses (`gateUsage`, in
 * `rollup.ts`). Pure orchestration over injected ports, so it's exhaustively
 * unit-testable with fakes and tolerant of a single hub being down.
 */

import type { UsageSnapshot } from './rollup'
import type { UsageLedger } from '@xnetjs/cloud/billing'

/** The slice of a `TenantRecord` the collector needs (decoupled for testing). */
export interface UsageTenant {
  tenantId: string
  hubUrl: string
  dataTier: 'hot' | 'cold'
}

/** Per-hub usage read from a live hub's `/health` (`docs.total`, optional members). */
export interface HubUsageStats {
  documents: number
  /** Distinct member identities on the hub (Tier 2); omitted until hubs report it. */
  members?: number
}

/** Reads per-hub usage from a live hub. The real adapter GETs `${hubUrl}/health`. */
export interface HubUsageProbe {
  stats(hubUrl: string): Promise<HubUsageStats | null>
}

/** Sums bulk storage bytes across the fleet (the real adapter lists R2 objects). */
export interface StorageUsageReader {
  totalBytes(tenantIds: string[]): Promise<number>
}

export interface CollectUsageDeps {
  listTenants: () => Promise<UsageTenant[]>
  ledger: UsageLedger
  /** Optional per-hub doc/member counts (Tier 0 documents + Tier 2 members). */
  hubStats?: HubUsageProbe
  /** Optional total bulk storage in bytes (Tier 1 GB stored). */
  storage?: StorageUsageReader
  /** Optional billing-period start for AI totals; omit for all-time. */
  sinceMs?: number
}

const GB = 1e9
const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Collect the fleet-wide usage snapshot from live ports. Only *hot* hubs are
 * probed for documents/members — probing a cold (scale-to-zero) hub would force a
 * cold start — and a single hub failing to answer is tolerated (its counts are
 * simply omitted, never a thrown rollup).
 */
export async function collectUsage(deps: CollectUsageDeps): Promise<UsageSnapshot> {
  const tenants = await deps.listTenants()
  const hot = tenants.filter((t) => t.dataTier === 'hot' && Boolean(t.hubUrl))

  let documentsSynced = 0
  let members = 0
  let membersKnown = false
  if (deps.hubStats) {
    const results = await Promise.allSettled(hot.map((t) => deps.hubStats!.stats(t.hubUrl)))
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value) continue
      documentsSynced += r.value.documents
      if (typeof r.value.members === 'number') {
        members += r.value.members
        membersKnown = true
      }
    }
  }

  // AI: aggregate the durable ledger fleet-wide (no tenantId → every tenant).
  const entries = await deps.ledger.entries(undefined, deps.sinceMs)
  const aiTokensTotal = entries.reduce((n, e) => n + e.inputTokens + e.outputTokens, 0)

  const snapshot: UsageSnapshot = {
    hubsHosted: tenants.length,
    hubsHot: hot.length,
    documentsSynced,
    aiTokensTotal,
    aiRequestsTotal: entries.length
  }

  if (deps.storage) {
    const bytes = await deps.storage.totalBytes(tenants.map((t) => t.tenantId))
    snapshot.storageGb = round2(bytes / GB)
  }
  if (membersKnown) snapshot.peopleOnPlatform = members

  return snapshot
}

/**
 * Real per-hub probe: GET `${hubUrl}/health` and read `docs.total` (the hub's
 * pool stats — `packages/hub/src/server.ts`) plus an optional `members` count.
 * Returns null on any failure so the collector omits that hub rather than crash.
 */
export function httpHubUsageProbe(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000
): HubUsageProbe {
  return {
    async stats(hubUrl: string): Promise<HubUsageStats | null> {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetchImpl(`${hubUrl.replace(/\/$/, '')}/health`, { signal: ctrl.signal })
        if (!res.ok) return null
        const body = (await res.json()) as {
          docs?: { total?: number }
          members?: number
        }
        const documents = Number(body.docs?.total ?? 0)
        return {
          documents: Number.isFinite(documents) ? documents : 0,
          ...(typeof body.members === 'number' ? { members: body.members } : {})
        }
      } catch {
        return null
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
