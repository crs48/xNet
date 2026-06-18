/**
 * xNet Cloud — the PUBLIC, aggregate-only status surface (exploration 0201).
 *
 * `/status.json` is the one observability surface served unauthenticated, so it
 * must never carry anything tenant-identifying. {@link publicStatus} is the
 * chokepoint: it accepts only pre-aggregated primitives — never a `TenantSli`,
 * a `hubUrl`, or a `tenantId` — so it is *structurally* impossible to leak
 * per-tenant data (the same stance as the run-in-public metrics rollup). A
 * k-anonymity floor suppresses the fleet availability number until enough hot
 * tenants exist to hide any individual.
 */

import type { FleetSummary } from './health'
import type { BudgetPolicy } from './slo'

export type ComponentStatus = 'operational' | 'degraded' | 'down' | 'not-configured'

export interface StatusComponent {
  id: string
  status: ComponentStatus
  /** Rolling availability fraction (0..1), or null when suppressed / not applicable. */
  availability?: number | null
}

export interface PublicStatus {
  updatedMs: number
  /** Worst component state, for an at-a-glance banner. */
  overall: ComponentStatus
  components: StatusComponent[]
  /** Count of hot tenants in each error-budget policy bucket (counts only, no ids). */
  errorBudgetPolicy: Record<BudgetPolicy, number>
}

export interface PublicStatusInput {
  nowMs: number
  fleet: FleetSummary
  /** Per-tenant availability fractions only — never ids or urls. */
  availabilities: number[]
  /** Whether managed AI is configured (the gateway is reachable). */
  aiConfigured: boolean
  /** `null` = backups not configured; otherwise whether the replica is fresh. */
  backupsHealthy: boolean | null
  /** Suppress the fleet availability number below this many hot tenants. */
  kAnonFloor?: number
}

/** Default k-anonymity floor — matches the run-in-public metrics cohort floor. */
export const STATUS_K_ANON_FLOOR = 5

/** Severity ordering so the banner reflects the worst non-trivial component. */
const SEVERITY: Record<ComponentStatus, number> = {
  'not-configured': 0,
  operational: 1,
  degraded: 2,
  down: 3
}

function worstStatus(components: StatusComponent[]): ComponentStatus {
  let acc: ComponentStatus = 'operational'
  for (const c of components) if (SEVERITY[c.status] > SEVERITY[acc]) acc = c.status
  return acc
}

/**
 * Build the public status payload from aggregates only. The control plane is
 * always `operational` here (it answered the request); the hub fleet degrades
 * when any tenant's error budget has frozen; backups reflect replica freshness
 * when configured; AI reflects whether the gateway is wired.
 */
export function publicStatus(input: PublicStatusInput): PublicStatus {
  const floor = input.kAnonFloor ?? STATUS_K_ANON_FLOOR
  const n = input.availabilities.length
  const mean = n ? input.availabilities.reduce((sum, a) => sum + a, 0) / n : 1
  const fleetAvailability = n >= floor ? Number(mean.toFixed(4)) : null

  const hubFleet: ComponentStatus = input.fleet.freezing > 0 ? 'degraded' : 'operational'
  const backups: ComponentStatus =
    input.backupsHealthy === null
      ? 'not-configured'
      : input.backupsHealthy
        ? 'operational'
        : 'degraded'

  const components: StatusComponent[] = [
    { id: 'control-plane', status: 'operational' },
    { id: 'hub-fleet', status: hubFleet, availability: fleetAvailability },
    { id: 'ai-gateway', status: input.aiConfigured ? 'operational' : 'not-configured' },
    { id: 'backups', status: backups }
  ]

  return {
    updatedMs: input.nowMs,
    overall: worstStatus(components),
    components,
    errorBudgetPolicy: input.fleet.byPolicy
  }
}
