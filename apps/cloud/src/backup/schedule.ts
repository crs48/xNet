/**
 * xNet Cloud — backup job scheduling helpers (exploration 0288).
 *
 * The restore drill and cold-demotion sweep are wired onto timers in `index.ts`;
 * the decision logic lives here as pure functions so it is unit-testable without a
 * clock or a network: which day's drill sample to pick, whether a drill run should
 * page someone, and which tenants are due for demotion.
 */

import type { TenantRecord } from '../registry'
import type { RestoreDrillResult, RestoreProbe } from './restore-drill'
import { fetchHubHealth } from '../hub-status'

/** Rotating day index (UTC) — feeds `pickDrillSample` so coverage rotates nightly. */
export function dayIndex(nowMs: number): number {
  return Math.floor(nowMs / 86_400_000)
}

export interface DrillSummary {
  total: number
  ok: number
  failed: number
  /** Tenant ids that failed to restore — the actionable list. */
  failures: string[]
  /** True when at least one restore failed → operators should be paged. */
  alert: boolean
}

/** Roll per-tenant drill results into a summary + a page/no-page decision. */
export function summarizeDrill(results: RestoreDrillResult[]): DrillSummary {
  const failures = results.filter((r) => !r.ok).map((r) => r.tenantId)
  return {
    total: results.length,
    ok: results.length - failures.length,
    failed: failures.length,
    failures,
    alert: failures.length > 0
  }
}

/**
 * A hot tenant is due for cold demotion once it has been idle past `coldAfterMs`.
 * (The final sync gate is enforced separately by `demoteIfCold`'s `assertSynced`.)
 */
export function demotionDue(
  record: Pick<TenantRecord, 'dataTier' | 'lastActiveMs'>,
  nowMs: number,
  coldAfterMs: number
): boolean {
  return record.dataTier === 'hot' && nowMs - record.lastActiveMs >= coldAfterMs
}

/**
 * A `RestoreProbe` that treats a hub as ready once its public `/health` answers —
 * a restored hub that serves health has opened its DB. Injectable for tests.
 */
export function httpReadyProbe(fetchHealth: typeof fetchHubHealth = fetchHubHealth): RestoreProbe {
  return { ready: async (hubUrl: string): Promise<boolean> => Boolean(await fetchHealth(hubUrl)) }
}
