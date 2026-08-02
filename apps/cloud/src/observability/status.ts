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

/**
 * `unmeasured` is not a degraded state — it is the absence of evidence
 * (exploration 0433, decision 10). Before it existed, a component with no SLI
 * window at all reported `operational`, which is the same defect as an empty
 * sample window reading as 100% available: "absent" and "unreadable" must not
 * look like "fine" (`AGENTS.md`).
 */
export type ComponentStatus =
  | 'operational'
  | 'degraded'
  | 'down'
  | 'not-configured'
  | 'unmeasured'

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
  /**
   * Whether the hub fleet's SLI window is actually being measured right now.
   * `false` renders `unmeasured` instead of `operational` — the public page must
   * not assert health nobody has observed (decision 10). Defaults to `true` so
   * existing callers keep their behaviour until they pass the real signal.
   */
  fleetMeasured?: boolean
  /**
   * Whether the control plane's own periodic jobs are completing. The old code
   * hardcoded `control-plane: operational`, which was tautological — it said only
   * that the process had answered THIS request. `false` means a leased job has
   * gone stale; `undefined` means job reporting is not wired, which renders
   * `unmeasured` rather than green.
   */
  controlPlaneJobsHealthy?: boolean
}

/** Default k-anonymity floor — matches the run-in-public metrics cohort floor. */
export const STATUS_K_ANON_FLOOR = 5

/**
 * Severity ordering so the banner reflects the worst non-trivial component.
 *
 * `unmeasured` sits just ABOVE `operational`: it must be able to displace a green
 * banner (we are not claiming health we cannot show) but must never masquerade as
 * an outage, which would page someone over a missing probe.
 */
const SEVERITY: Record<ComponentStatus, number> = {
  'not-configured': 0,
  operational: 1,
  unmeasured: 2,
  degraded: 3,
  down: 4
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

  // A frozen error budget is still the degraded signal, but only when there IS a
  // measurement behind it. Unmeasured outranks operational so the banner cannot
  // read green on no evidence.
  const measured = input.fleetMeasured ?? true
  const hubFleet: ComponentStatus = !measured
    ? 'unmeasured'
    : input.fleet.freezing > 0
      ? 'degraded'
      : 'operational'

  const backups: ComponentStatus =
    input.backupsHealthy === null
      ? 'not-configured'
      : input.backupsHealthy
        ? 'operational'
        : 'degraded'

  // The control plane reports from its periodic jobs, not from the fact that it
  // answered this request — a process can serve /status.json perfectly while every
  // background reconciler has silently stopped.
  const controlPlane: ComponentStatus =
    input.controlPlaneJobsHealthy === undefined
      ? 'unmeasured'
      : input.controlPlaneJobsHealthy
        ? 'operational'
        : 'degraded'

  const components: StatusComponent[] = [
    { id: 'control-plane', status: controlPlane },
    {
      id: 'hub-fleet',
      status: hubFleet,
      availability: measured ? fleetAvailability : null
    },
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
