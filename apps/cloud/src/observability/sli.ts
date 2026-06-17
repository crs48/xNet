/**
 * xNet Cloud — Service Level Indicators (pure math).
 *
 * SLIs are derived from health probes against each tenant hub (exploration 0193).
 * Availability counts successful probes over valid probes — cold-start waits are
 * *valid* (the request eventually succeeds), so scale-to-zero tenants aren't
 * unfairly penalized. Everything here is content-free: a probe is ok/not-ok + a
 * latency number, never anything about the tenant's data.
 */

import { isReplicaFresh } from '@xnetjs/cloud/litestream'

/** One health observation for a tenant hub. */
export interface HealthSample {
  ok: boolean
  latencyMs: number
  atMs: number
}

/** Samples within `[nowMs - windowMs, nowMs]`. */
export function windowed(samples: HealthSample[], windowMs: number, nowMs: number): HealthSample[] {
  const floor = nowMs - windowMs
  return samples.filter((s) => s.atMs >= floor && s.atMs <= nowMs)
}

/** Availability = successful / valid probes. Empty window → 1 (no evidence of failure). */
export function availability(samples: HealthSample[]): number {
  if (samples.length === 0) return 1
  return samples.filter((s) => s.ok).length / samples.length
}

/** Error rate = 1 − availability. */
export function errorRate(samples: HealthSample[]): number {
  return 1 - availability(samples)
}

/** Latency percentile (q in [0,1]) over successful probes. Empty → 0. */
export function latencyPercentile(samples: HealthSample[], q: number): number {
  const oks = samples
    .filter((s) => s.ok)
    .map((s) => s.latencyMs)
    .sort((a, b) => a - b)
  if (oks.length === 0) return 0
  const idx = Math.min(oks.length - 1, Math.max(0, Math.floor(q * oks.length)))
  return oks[idx]
}

/**
 * Error budget remaining as a fraction of the allowance (1 = full, 0 = exhausted).
 * `objective` is the SLO as a fraction (e.g. 0.999); `null` = no published SLO →
 * always "full" (best-effort tiers never burn a budget they don't have).
 */
export function errorBudgetRemaining(sli: number, objective: number | null): number {
  if (objective === null) return 1
  const allowed = 1 - objective
  if (allowed <= 0) return sli >= 1 ? 1 : 0
  const used = Math.max(0, 1 - sli)
  return Math.max(0, 1 - used / allowed)
}

/** How fast the budget is burning: used / allowed (>1 means over budget). */
export function burnRate(sli: number, objective: number | null): number {
  if (objective === null) return 0
  const allowed = 1 - objective
  if (allowed <= 0) return sli >= 1 ? 0 : Infinity
  return Math.max(0, 1 - sli) / allowed
}

/** Backup-freshness SLI — reuses the shipped Litestream helper (5-min lag budget). */
export function backupHealthy(
  lastWriteMs: number,
  lastSyncMs: number,
  maxLagMs = 5 * 60_000
): boolean {
  return isReplicaFresh(lastWriteMs, lastSyncMs, maxLagMs)
}
