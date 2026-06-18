import { describe, expect, it } from 'vitest'
import {
  FakeHealthProbe,
  HealthSampleStore,
  probeFleet,
  sampleTenantHealth,
  tenantSli
} from './health'
import {
  availability,
  backupHealthy,
  burnRate,
  errorBudgetRemaining,
  errorRate,
  latencyPercentile,
  windowed,
  type HealthSample
} from './sli'
import { budgetPolicy, errorBudgetMs, sloForPlan, sloForSla } from './slo'

const ok = (atMs: number, latencyMs = 20): HealthSample => ({ ok: true, latencyMs, atMs })
const bad = (atMs: number): HealthSample => ({ ok: false, latencyMs: 0, atMs })

describe('SLI math', () => {
  it('availability counts successes over valid probes; empty → 1', () => {
    expect(availability([])).toBe(1)
    expect(availability([ok(1), ok(2), bad(3), ok(4)])).toBe(0.75)
    expect(errorRate([ok(1), bad(2)])).toBe(0.5)
  })

  it('windows samples by time', () => {
    const s = [ok(0), ok(50), ok(100)]
    expect(windowed(s, 60, 100).map((x) => x.atMs)).toEqual([50, 100])
  })

  it('takes latency percentiles over successful probes', () => {
    const s = [ok(1, 10), ok(2, 20), ok(3, 30), ok(4, 100), bad(5)]
    expect(latencyPercentile(s, 0.95)).toBe(100)
    expect(latencyPercentile([], 0.95)).toBe(0)
  })

  it('computes error budget remaining + burn rate against an objective', () => {
    // 99.9% objective, observed 99.95% availability → half the budget left.
    expect(errorBudgetRemaining(0.9995, 0.999)).toBeCloseTo(0.5, 5)
    expect(burnRate(0.9995, 0.999)).toBeCloseTo(0.5, 5)
    // Exactly at objective → exhausted.
    expect(errorBudgetRemaining(0.999, 0.999)).toBeCloseTo(0, 5)
    // Below objective → over budget, clamped to 0 remaining.
    expect(errorBudgetRemaining(0.99, 0.999)).toBe(0)
    // No objective (best-effort) → always full, never burns.
    expect(errorBudgetRemaining(0.5, null)).toBe(1)
    expect(burnRate(0.5, null)).toBe(0)
  })

  it('reports backup freshness from replica lag', () => {
    expect(backupHealthy(1000, 1000)).toBe(true)
    expect(backupHealthy(1_000_000, 0)).toBe(false)
  })
})

describe('SLO catalog + budget policy', () => {
  it('maps SLA levels to objectives', () => {
    expect(sloForSla('99.9').objective).toBe(0.999)
    expect(sloForSla('custom').objective).toBe(0.9995)
    expect(sloForSla('best-effort').objective).toBeNull()
    expect(sloForSla('none').objective).toBeNull()
  })

  it('derives the SLO from the plan tier', () => {
    expect(sloForPlan('community').objective).toBe(0.999) // dedicated-project, 99.9
    expect(sloForPlan('company').objective).toBe(0.999)
    expect(sloForPlan('team').objective).toBeNull() // best-effort
    expect(sloForPlan('personal').objective).toBeNull() // best-effort
    expect(sloForPlan('enterprise').objective).toBe(0.9995)
  })

  it('converts an objective to allowed downtime', () => {
    // 99.9% over 30d ≈ 43.2 minutes.
    expect(Math.round(errorBudgetMs(sloForSla('99.9')) / 60000)).toBe(43)
    expect(errorBudgetMs(sloForSla('best-effort'))).toBe(Number.POSITIVE_INFINITY)
  })

  it('applies the Google error-budget policy thresholds', () => {
    expect(budgetPolicy(0.6)).toBe('ship')
    expect(budgetPolicy(0.2)).toBe('caution')
    expect(budgetPolicy(0)).toBe('freeze')
    expect(budgetPolicy(-0.1)).toBe('freeze')
  })
})

describe('health sampling → tenant SLI', () => {
  it('probes a hub, records, and summarizes SLIs', async () => {
    const probe = new FakeHealthProbe({ 'wss://t.hub': { ok: true, latencyMs: 30 } })
    const store = new HealthSampleStore()
    const tenant = { tenantId: 't_a', plan: 'community' as const, hubUrl: 'wss://t.hub' }
    for (let i = 0; i < 10; i++) await sampleTenantHealth(probe, store, tenant, 1000 + i)

    const sli = tenantSli(store, tenant, 1100)
    expect(sli.availability).toBe(1)
    expect(sli.budgetRemaining).toBe(1)
    expect(sli.policy).toBe('ship')
    expect(sli.p95LatencyMs).toBe(30)
    expect(sli.sampleCount).toBe(10)
    expect(sli.sloLabel).toContain('99.9')
  })

  it('drains the budget and flips policy to freeze when a 99.9 hub is mostly down', () => {
    const store = new HealthSampleStore()
    const tenant = { tenantId: 't_b', plan: 'community' as const, hubUrl: 'wss://b.hub' }
    // 50% failures over the window vastly exceeds a 0.1% budget.
    for (let i = 0; i < 100; i++) store.record('t_b', i % 2 ? ok(i) : bad(i))
    const sli = tenantSli(store, tenant, 200)
    expect(sli.availability).toBeCloseTo(0.5, 5)
    expect(sli.budgetRemaining).toBe(0)
    expect(sli.policy).toBe('freeze')
  })

  it('caps the ring buffer at capacity', () => {
    const store = new HealthSampleStore(5)
    for (let i = 0; i < 20; i++) store.record('t_c', ok(i))
    expect(store.samples('t_c')).toHaveLength(5)
  })

  it('probeFleet samples only hot tenants with a live hub', async () => {
    const probe = new FakeHealthProbe({
      'wss://a.hub': { ok: true, latencyMs: 10 },
      'wss://b.hub': { ok: true, latencyMs: 20 }
    })
    const store = new HealthSampleStore()
    const probed = await probeFleet(
      probe,
      store,
      [
        { tenantId: 'a', hubUrl: 'wss://a.hub', dataTier: 'hot' },
        { tenantId: 'b', hubUrl: 'wss://b.hub', dataTier: 'hot' },
        { tenantId: 'c', hubUrl: '', dataTier: 'hot' }, // hot but no live hub → skipped
        { tenantId: 'd', hubUrl: 'wss://d.hub', dataTier: 'cold' } // cold → skipped
      ],
      1000
    )
    expect(probed).toBe(2)
    expect(store.samples('a')).toHaveLength(1)
    expect(store.samples('b')).toHaveLength(1)
    expect(store.samples('c')).toHaveLength(0)
    expect(store.samples('d')).toHaveLength(0)
  })
})
