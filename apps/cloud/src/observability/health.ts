/**
 * xNet Cloud — fleet health probing + per-tenant SLI summaries (exploration 0193).
 *
 * The control plane polls each hot tenant's `/health` (or `/ready`) and records a
 * content-free {@link HealthSample}. A rolling in-memory window per tenant feeds
 * the SLI math in `sli.ts`; production swaps the store for a durable one (same
 * stance as the tenant registry). The probe is a port so it's keyless-testable.
 */

import { type PlanId } from '@xnetjs/entitlements'
import {
  availability,
  errorRate,
  latencyPercentile,
  errorBudgetRemaining,
  windowed,
  type HealthSample
} from './sli'
import { budgetPolicy, sloForPlan, type BudgetPolicy } from './slo'
import { type ProbeOutcome, type SliBucketStore } from './buckets'

/** One probe result. `coldStart` means it answered, but only after waking. */
export interface ProbeResult {
  ok: boolean
  latencyMs: number
  coldStart?: boolean
}

/** Probes a single hub. The real adapter hits `${hubUrl}/health`. */
export interface HealthProbe {
  probe(hubUrl: string): Promise<ProbeResult>
}

/**
 * How long a hub may take to answer before we call it down.
 *
 * Deliberately generous, and deliberately NOT the old 5s: a scale-to-zero hub
 * has to cold-start Cloud Run and restore a SQLite database from R2 before it
 * can answer, and 5s recorded that as an outage — the opposite of what `sli.ts`
 * documents (exploration 0431 Finding 2).
 *
 * @remarks **This number is not measured.** Exploration 0433 open question 1: no
 * cold-start figure exists anywhere in the repo. 30s is a placeholder chosen to
 * be safely above a plausible restore, not a value anyone has observed. Measure a
 * real Litestream restore-on-boot and replace it; until then, over-waiting costs
 * a slow probe while under-waiting fabricates downtime.
 */
export const DEFAULT_PROBE_TIMEOUT_MS = 30_000

/**
 * Above this, an answering hub is recorded as having cold-started rather than
 * served promptly. Cold starts count as available (they answered) but are tracked
 * separately so the console can say "sleeping, woke in 8s" instead of "degraded".
 */
export const DEFAULT_COLD_START_MS = 2_000

/** Default probe: GET `${hubUrl}/health`, ok on a 2xx within the timeout. */
export function httpHealthProbe(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  coldStartMs = DEFAULT_COLD_START_MS
): HealthProbe {
  return {
    async probe(hubUrl: string) {
      const startedAtMs = Date.now()
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetchImpl(`${hubUrl.replace(/\/$/, '')}/health`, { signal: ctrl.signal })
        const latencyMs = Date.now() - startedAtMs
        return { ok: res.ok, latencyMs, coldStart: res.ok && latencyMs >= coldStartMs }
      } catch {
        return { ok: false, latencyMs: Date.now() - startedAtMs }
      } finally {
        clearTimeout(timer)
      }
    }
  }
}

/** The bucket outcome a probe result folds into. */
export function outcomeOf(result: ProbeResult): ProbeOutcome {
  if (!result.ok) return 'failed'
  return result.coldStart ? 'cold-start' : 'ok'
}

/** Scripted probe for tests — maps a hubUrl to a fixed result. */
export class FakeHealthProbe implements HealthProbe {
  constructor(private readonly results: Record<string, ProbeResult>) {}
  async probe(hubUrl: string): Promise<ProbeResult> {
    return this.results[hubUrl] ?? { ok: false, latencyMs: 0 }
  }
}

/** A bounded per-tenant ring of health samples. */
export class HealthSampleStore {
  private readonly byTenant = new Map<string, HealthSample[]>()
  constructor(private readonly capacity = 2000) {}

  record(tenantId: string, sample: HealthSample): void {
    const arr = this.byTenant.get(tenantId) ?? []
    arr.push(sample)
    if (arr.length > this.capacity) arr.splice(0, arr.length - this.capacity)
    this.byTenant.set(tenantId, arr)
  }

  samples(tenantId: string): HealthSample[] {
    return [...(this.byTenant.get(tenantId) ?? [])]
  }
}

/** Probe one tenant and record the sample. Returns the sample. */
export async function sampleTenantHealth(
  probe: HealthProbe,
  store: HealthSampleStore,
  tenant: { tenantId: string; hubUrl: string },
  nowMs: number,
  /**
   * Durable bucket store (exploration 0433). The in-memory `store` above stays as
   * the short-window view the live dashboard tiles poll; `buckets` is what the SLO
   * window, the error budget, and the deploy gate actually read, because it is the
   * only one that survives a restart.
   */
  buckets?: SliBucketStore
): Promise<HealthSample> {
  const r = await probe.probe(tenant.hubUrl)
  const sample: HealthSample = {
    ok: r.ok,
    latencyMs: r.latencyMs,
    atMs: nowMs,
    ...(r.coldStart ? { coldStart: true } : {})
  }
  store.record(tenant.tenantId, sample)
  buckets?.record(tenant.tenantId, outcomeOf(r), r.latencyMs, nowMs)
  return sample
}

/**
 * Probe every *hot* tenant once, recording a sample for each. The cold tenants
 * (scale-to-zero, no live hub) are skipped — probing them would force a cold
 * start. Used by the control plane's background loop (`apps/cloud/src/index.ts`)
 * and exhaustively testable with a {@link FakeHealthProbe}. Returns the count probed.
 */
export async function probeFleet(
  probe: HealthProbe,
  store: HealthSampleStore,
  tenants: { tenantId: string; hubUrl: string; dataTier: 'hot' | 'cold' }[],
  nowMs: number,
  buckets?: SliBucketStore
): Promise<number> {
  const hot = tenants.filter((t) => t.dataTier === 'hot' && Boolean(t.hubUrl))
  await Promise.all(
    hot.map((t) =>
      sampleTenantHealth(probe, store, { tenantId: t.tenantId, hubUrl: t.hubUrl }, nowMs, buckets)
    )
  )
  // Persist immediately: a flush deferred to an hourly timer would lose the whole
  // current hour to a deploy, which is the amnesia this replaced.
  if (buckets) await buckets.flush(nowMs)
  return hot.length
}

/** The derived SLI summary for one tenant against its plan's SLO. */
export interface TenantSli {
  tenantId: string
  plan: PlanId
  sloLabel: string
  availability: number
  errorRate: number
  p95LatencyMs: number
  budgetRemaining: number
  policy: BudgetPolicy
  sampleCount: number
}

/** A fleet-wide rollup of per-tenant SLIs (the operator's at-a-glance health). */
export interface FleetSummary {
  tenantCount: number
  worstBudgetRemaining: number
  /** Tenants whose policy is `freeze` (a deploy freeze should be in effect). */
  freezing: number
  byPolicy: Record<BudgetPolicy, number>
}

export function fleetSummary(slis: TenantSli[]): FleetSummary {
  const byPolicy: Record<BudgetPolicy, number> = { ship: 0, caution: 0, freeze: 0 }
  let worst = 1
  for (const s of slis) {
    byPolicy[s.policy] += 1
    worst = Math.min(worst, s.budgetRemaining)
  }
  return {
    tenantCount: slis.length,
    worstBudgetRemaining: slis.length ? worst : 1,
    freezing: byPolicy.freeze,
    byPolicy
  }
}

/** Summarize a tenant's SLIs over the SLO window. */
export function tenantSli(
  store: HealthSampleStore,
  tenant: { tenantId: string; plan: PlanId; hubUrl: string },
  nowMs: number
): TenantSli {
  const slo = sloForPlan(tenant.plan)
  const windowMs = slo.windowDays * 24 * 60 * 60 * 1000
  const samples = windowed(store.samples(tenant.tenantId), windowMs, nowMs)
  const avail = availability(samples)
  const remaining = errorBudgetRemaining(avail, slo.objective)
  return {
    tenantId: tenant.tenantId,
    plan: tenant.plan,
    sloLabel: slo.label,
    availability: avail,
    errorRate: errorRate(samples),
    p95LatencyMs: latencyPercentile(samples, 0.95),
    budgetRemaining: remaining,
    policy: budgetPolicy(remaining),
    sampleCount: samples.length
  }
}
