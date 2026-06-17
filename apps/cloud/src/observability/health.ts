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

/** Probes a single hub. The real adapter hits `${hubUrl}/health`. */
export interface HealthProbe {
  probe(hubUrl: string): Promise<{ ok: boolean; latencyMs: number }>
}

/** Default probe: GET `${hubUrl}/health`, ok on a 2xx within the timeout. */
export function httpHealthProbe(fetchImpl: typeof fetch = fetch, timeoutMs = 5000): HealthProbe {
  return {
    async probe(hubUrl: string) {
      const startedAtMs = Date.now()
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      try {
        const res = await fetchImpl(`${hubUrl.replace(/\/$/, '')}/health`, { signal: ctrl.signal })
        return { ok: res.ok, latencyMs: Date.now() - startedAtMs }
      } catch {
        return { ok: false, latencyMs: Date.now() - startedAtMs }
      } finally {
        clearTimeout(timer)
      }
    }
  }
}

/** Scripted probe for tests — maps a hubUrl to a fixed result. */
export class FakeHealthProbe implements HealthProbe {
  constructor(private readonly results: Record<string, { ok: boolean; latencyMs: number }>) {}
  async probe(hubUrl: string): Promise<{ ok: boolean; latencyMs: number }> {
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
  nowMs: number
): Promise<HealthSample> {
  const r = await probe.probe(tenant.hubUrl)
  const sample: HealthSample = { ok: r.ok, latencyMs: r.latencyMs, atMs: nowMs }
  store.record(tenant.tenantId, sample)
  return sample
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
