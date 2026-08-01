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

/**
 * Whether the fleet's backups are believed to work — and, crucially, how we know
 * (exploration 0418).
 *
 * This replaces `backupsConfigured: Boolean(env.R2_BUCKET)`, which reported a
 * *bucket name in an env var* as if it were a working backup. A bucket name
 * proves nothing: not that the credentials are right, not that Litestream is
 * replicating, and certainly not that a restore succeeds. The four states below
 * keep "absent", "unproven" and "broken" distinguishable, per the repo's rule
 * that a value callers cannot tell apart from success is a bug.
 */
export type BackupHealth =
  /** No object store configured — this deployment does not back up at all. */
  | { state: 'off' }
  /** Configured, but no restore drill has passed yet. NOT the same as healthy. */
  | { state: 'unproven' }
  /** A drill restored a real tenant from the replica and it came up ready. */
  | { state: 'healthy'; lastDrillMs: number }
  /** A drill ran and failed. The most important state to not round down to 'off'. */
  | { state: 'failing'; lastDrillMs: number; failures: string[] }

/** The last drill's outcome, as recorded by the `restore-drill` job. */
export interface LastDrill {
  ranAtMs: number
  failures: string[]
}

/**
 * Map {@link BackupHealth} onto the public status page's tri-state.
 *
 * `unproven` deliberately becomes `null` (unknown) rather than `true`. The
 * status page is a promise to customers, and "we configured a bucket" is not a
 * promise we have earned the right to make.
 */
export function backupsHealthyFor(health: BackupHealth | undefined): boolean | null {
  if (!health) return null
  if (health.state === 'healthy') return true
  if (health.state === 'failing') return false
  return null
}

/**
 * Derive backup health from configuration + the last drill result.
 *
 * Order matters: an unconfigured deployment is `off` regardless of history, and
 * a configured one with no drill yet is `unproven` — never `healthy` by default.
 * Backups are guilty until proven innocent, because the alternative is a
 * dashboard that says "backed up" about a bucket nobody has ever restored from.
 */
export function backupHealthFrom(
  configured: boolean,
  lastDrill: LastDrill | null | undefined
): BackupHealth {
  if (!configured) return { state: 'off' }
  if (!lastDrill) return { state: 'unproven' }
  if (lastDrill.failures.length > 0) {
    return { state: 'failing', lastDrillMs: lastDrill.ranAtMs, failures: lastDrill.failures }
  }
  return { state: 'healthy', lastDrillMs: lastDrill.ranAtMs }
}

/**
 * How many tenants tonight's drill should cover.
 *
 * A constant 20 is wrong at both ends: it drills the whole fleet twice over when
 * there are three tenants, and covers 4% of it when there are five hundred —
 * while provisioning 20 throwaway Cloud Run services every single night either
 * way. Scale with the fleet (a fraction, floored at 1), and keep a ceiling so the
 * nightly cost stays bounded as the fleet grows.
 */
export function drillSampleSize(
  fleetSize: number,
  { fraction = 0.1, min = 1, max = 20 }: { fraction?: number; min?: number; max?: number } = {}
): number {
  if (fleetSize <= 0) return 0
  return Math.min(max, Math.max(min, Math.ceil(fleetSize * fraction)))
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
