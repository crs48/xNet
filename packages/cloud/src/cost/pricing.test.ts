import { describe, expect, it } from 'vitest'
import { PLAN_PRICING, estimateCogs, type PricingScenario } from './pricing'

describe('estimateCogs — $5 Personal', () => {
  // Personal is Model B (cold-capable): the DB lives in R2, not on a volume — so the
  // ~1 GB DB is counted as R2 storage (3 GB blobs + 1 GB DB ≈ 4 GB), no hot volume.
  const inputs = {
    storageGbTypical: 4,
    activeHoursPerMonth: 60,
    warm: false
  }

  it('is profitable at ~85% margin billed monthly (Stripe fixed fee is the drag)', () => {
    const c = estimateCogs({ priceUsd: 5, period: 'month', inputs })
    // Stripe monthly = 5*0.029 + 0.30 = 0.445 — the dominant cost.
    expect(c.stripeUsd).toBeCloseTo(0.445, 3)
    expect(c.totalCogsUsd).toBeLessThan(0.8)
    expect(c.grossMarginPct).toBeGreaterThan(0.8)
  })

  it('improves to ~90% margin billed annually ($50/yr amortizes the $0.30 fee)', () => {
    const monthly = estimateCogs({ priceUsd: 5, period: 'month', inputs })
    const annual = estimateCogs({ priceUsd: 50, period: 'year', inputs })
    expect(annual.stripeUsd).toBeLessThan(monthly.stripeUsd) // fixed fee amortized
    expect(annual.grossMarginPct).toBeGreaterThan(monthly.grossMarginPct)
    expect(annual.grossMarginPct).toBeGreaterThan(0.88)
  })

  it('keeps infra COGS (compute+storage) tiny — under ~$0.30/mo', () => {
    const c = estimateCogs({ priceUsd: 5, period: 'month', inputs })
    expect(c.computeUsd + c.storageUsd).toBeLessThan(0.3)
  })
})

describe('estimateCogs — cost drivers', () => {
  it('charges always-warm compute only when warm', () => {
    const idle = estimateCogs({
      priceUsd: 10,
      period: 'month',
      inputs: { storageGbTypical: 1, activeHoursPerMonth: 30, warm: false }
    })
    const warm = estimateCogs({
      priceUsd: 10,
      period: 'month',
      inputs: { storageGbTypical: 1, activeHoursPerMonth: 0, warm: true }
    })
    expect(idle.computeUsd).toBeLessThan(0.2) // scale-to-zero ≈ free
    expect(warm.computeUsd).toBeGreaterThanOrEqual(6) // always-on pays real compute
  })

  it('adds SSO/SCIM only for enterprise', () => {
    const c = estimateCogs({
      priceUsd: 2000,
      period: 'month',
      inputs: { storageGbTypical: 0, activeHoursPerMonth: 0, warm: false, ssoScim: true }
    })
    expect(c.identityUsd).toBe(250)
  })

  it('prices hot DB on the chosen volume rate', () => {
    const fly = estimateCogs({
      priceUsd: 5,
      period: 'month',
      inputs: {
        storageGbTypical: 0,
        activeHoursPerMonth: 0,
        warm: false,
        hotDbGb: 10,
        volume: 'fly'
      }
    })
    const hetzner = estimateCogs({
      priceUsd: 5,
      period: 'month',
      inputs: {
        storageGbTypical: 0,
        activeHoursPerMonth: 0,
        warm: false,
        hotDbGb: 10,
        volume: 'hetzner'
      }
    })
    expect(fly.storageUsd).toBeCloseTo(1.5, 4) // 10 × $0.15
    expect(hetzner.storageUsd).toBeCloseTo(0.48, 4) // 10 × $0.048 — ~3× cheaper
  })
})

describe('PLAN_PRICING — margin floors (typical usage)', () => {
  const floors: Partial<Record<keyof typeof PLAN_PRICING, number>> = {
    personal: 0.8,
    family: 0.8,
    team: 0.7,
    community: 0.75,
    enterprise: 0.5
  }

  // Without this, a newly priced plan with no floor compares against
  // `undefined` and fails with an unreadable message instead of naming itself.
  it('declares a margin floor for every priced plan', () => {
    for (const plan of Object.keys(PLAN_PRICING) as (keyof typeof PLAN_PRICING)[]) {
      expect(floors[plan], `no margin floor declared for plan '${plan}'`).toBeTypeOf('number')
    }
  })

  for (const [plan, scenario] of Object.entries(PLAN_PRICING) as [
    keyof typeof PLAN_PRICING,
    PricingScenario
  ][]) {
    it(`${plan} clears its gross-margin floor`, () => {
      const c = estimateCogs(scenario)
      expect(c.grossMarginPct).toBeGreaterThanOrEqual(floors[plan]!)
      expect(c.grossMarginUsd).toBeGreaterThan(0) // every plan is profitable at typical usage
    })
  }

  it('enterprise margin is structurally lower than personal', () => {
    const personal = estimateCogs(PLAN_PRICING.personal!)
    const enterprise = estimateCogs(PLAN_PRICING.enterprise!)
    expect(enterprise.grossMarginPct).toBeLessThan(personal.grossMarginPct)
  })
})
