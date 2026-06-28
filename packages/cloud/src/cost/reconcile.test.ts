import { describe, expect, it } from 'vitest'
import {
  aggregateMargin,
  measuredCogs,
  reconcileTenantMargin,
  type TenantUsageMeasurement
} from './reconcile'

const GiB = 1024 * 1024 * 1024

const usage = (over: Partial<TenantUsageMeasurement> = {}): TenantUsageMeasurement => ({
  tenantId: 't1',
  storageBytes: 4 * GiB,
  activeHours: 60,
  warm: false,
  aiProviderCostUsd: 0,
  revenueUsd: 5,
  ...over
})

describe('measuredCogs', () => {
  it('prices a scale-to-zero personal tenant from measured usage', () => {
    const c = measuredCogs(usage())
    // storage: 4 GiB × $0.015 = $0.06; compute: 60h × $0.00266 = $0.1596
    expect(c.storageUsd).toBeCloseTo(0.06, 4)
    expect(c.computeUsd).toBeCloseTo(0.1596, 4)
    expect(c.identityUsd).toBe(0)
    expect(c.totalCogsUsd).toBeGreaterThan(0)
  })

  it('charges flat warm compute + AI provider cost + SSO when present', () => {
    const c = measuredCogs(usage({ warm: true, warmUnits: 2, aiProviderCostUsd: 3, ssoScim: true }))
    expect(c.computeUsd).toBeCloseTo(12, 4) // 2 × $6
    // $3 provider cost × 1.055 credit-purchase fee = $3.165 (exploration 0244)
    expect(c.aiUsd).toBeCloseTo(3.165, 4)
    expect(c.identityUsd).toBe(250)
  })

  it('lets the AI COGS multiplier be overridden (e.g. crypto top-up at 5%)', () => {
    const c = measuredCogs(usage({ aiProviderCostUsd: 10 }), 1.05)
    expect(c.aiUsd).toBeCloseTo(10.5, 4)
  })

  it('uses real Stripe fees when provided, else models them', () => {
    expect(measuredCogs(usage({ stripeFeesUsd: 0.5 })).stripeUsd).toBe(0.5)
    // modeled: 5 × 0.029 + 0.30 = 0.445
    expect(measuredCogs(usage()).stripeUsd).toBeCloseTo(0.445, 4)
  })
})

describe('reconcileTenantMargin', () => {
  it('reports a healthy positive margin', () => {
    const m = reconcileTenantMargin(usage({ revenueUsd: 5 }))
    expect(m.marginUsd).toBeGreaterThan(0)
    expect(m.healthy).toBe(true)
    expect(m.marginPct).toBeGreaterThan(0)
  })

  it('flags a tenant we lose money on (COGS > revenue)', () => {
    const m = reconcileTenantMargin(usage({ revenueUsd: 0.05, aiProviderCostUsd: 10 }))
    expect(m.marginUsd).toBeLessThan(0)
    expect(m.healthy).toBe(false)
  })
})

describe('aggregateMargin', () => {
  it('sums the fleet P&L and lists negative-margin tenants', () => {
    const a = reconcileTenantMargin(usage({ tenantId: 'a', revenueUsd: 15 }))
    const b = reconcileTenantMargin(
      usage({ tenantId: 'b', revenueUsd: 0.01, aiProviderCostUsd: 20 })
    )
    const fleet = aggregateMargin([a, b])
    expect(fleet.tenantCount).toBe(2)
    expect(fleet.revenueUsd).toBeCloseTo(15.01, 4)
    expect(fleet.negativeTenants).toEqual(['b'])
    expect(fleet.marginUsd).toBeCloseTo(a.marginUsd + b.marginUsd, 4)
  })
})
