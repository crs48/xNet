import { describe, expect, it } from 'vitest'
import {
  PLAN_CATALOG,
  PLAN_ORDER,
  asPlanId,
  requiresMigration,
  resolveEntitlements,
  withAiBudget,
  withConcurrency,
  withSeats,
  withStorage
} from './plans'

describe('PLAN_CATALOG', () => {
  it('has an entry for every ordered plan id', () => {
    for (const plan of PLAN_ORDER) {
      expect(PLAN_CATALOG[plan]?.plan).toBe(plan)
    }
  })

  it('keeps the free tier pooled and the enterprise tier region-pinned', () => {
    expect(PLAN_CATALOG.demo.isolation).toBe('pooled')
    expect(PLAN_CATALOG.demo.aiEnabled).toBe(false)
    expect(PLAN_CATALOG.enterprise.isolation).toBe('region-pinned')
    expect(PLAN_CATALOG.enterprise.sla).toBe('custom')
  })

  it('keeps demo the smallest and enterprise the largest quota', () => {
    const quotas = PLAN_ORDER.map((p) => PLAN_CATALOG[p].quotaBytes)
    expect(Math.min(...quotas)).toBe(PLAN_CATALOG.demo.quotaBytes)
    expect(Math.max(...quotas)).toBe(PLAN_CATALOG.enterprise.quotaBytes)
  })

  it('gives the free tier no AI budget and every paid tier a positive included + cap', () => {
    expect(PLAN_CATALOG.demo.includedAiUsd).toBe(0)
    expect(PLAN_CATALOG.demo.aiMonthlyBudgetUsd).toBe(0)
    for (const plan of PLAN_ORDER) {
      const ent = PLAN_CATALOG[plan]
      if (!ent.aiEnabled) continue
      expect(ent.includedAiUsd).toBeGreaterThan(0)
      // The hard cap is always at least the included (free first tier) amount.
      expect(ent.aiMonthlyBudgetUsd).toBeGreaterThanOrEqual(ent.includedAiUsd)
    }
  })
})

describe('resolveEntitlements', () => {
  it('returns catalog defaults with no overrides', () => {
    expect(resolveEntitlements('personal')).toEqual(PLAN_CATALOG.personal)
  })

  it('applies overrides but never lets them change the plan id', () => {
    // Cast simulates an untrusted caller sneaking `plan` into the overrides:
    // the resolver must still force the requested plan id.
    const sneaky = { quotaBytes: 999, plan: 'enterprise' } as unknown as Partial<
      Omit<(typeof PLAN_CATALOG)['team'], 'plan'>
    >
    const ent = resolveEntitlements('team', sneaky)
    expect(ent.plan).toBe('team')
    expect(ent.quotaBytes).toBe(999)
  })

  it('throws on an unknown plan', () => {
    expect(() => resolveEntitlements('nope' as never)).toThrow(/Unknown plan/)
  })
})

describe('capacity flips', () => {
  const base = resolveEntitlements('personal')

  it('raises storage immutably', () => {
    const bigger = withStorage(base, 100 * 1024 * 1024 * 1024)
    expect(bigger.quotaBytes).toBe(100 * 1024 * 1024 * 1024)
    expect(base.quotaBytes).toBe(PLAN_CATALOG.personal.quotaBytes)
  })

  it('changes seats and concurrency', () => {
    expect(withSeats(base, 12).seats).toBe(12)
    expect(withConcurrency(base, 4000).maxConnections).toBe(4000)
  })

  it('sets the AI budget and toggles aiEnabled off when the cap is zero', () => {
    const richer = withAiBudget(base, 10, 100)
    expect(richer.includedAiUsd).toBe(10)
    expect(richer.aiMonthlyBudgetUsd).toBe(100)
    expect(richer.aiEnabled).toBe(true)
    expect(base.includedAiUsd).toBe(PLAN_CATALOG.personal.includedAiUsd) // immutable
    expect(withAiBudget(base, 0, 0).aiEnabled).toBe(false)
  })

  it('rejects invalid values', () => {
    expect(() => withStorage(base, -1)).toThrow()
    expect(() => withSeats(base, 0)).toThrow()
    expect(() => withSeats(base, 1.5)).toThrow()
    expect(() => withConcurrency(base, 0)).toThrow()
    expect(() => withAiBudget(base, -1, 10)).toThrow()
    expect(() => withAiBudget(base, 20, 10)).toThrow(/must be >= includedAiUsd/) // cap < included
  })
})

describe('requiresMigration', () => {
  it('is false for an in-place capacity flip within a tier', () => {
    const a = resolveEntitlements('personal')
    const b = withStorage(a, a.quotaBytes * 2)
    expect(requiresMigration(a, b)).toBe(false)
  })

  it('is true when the isolation tier changes (pooled → dedicated)', () => {
    expect(requiresMigration(resolveEntitlements('demo'), resolveEntitlements('personal'))).toBe(
      true
    )
  })

  it('is true when the pinned region changes within the same tier', () => {
    const a = resolveEntitlements('enterprise', { residency: 'us' })
    const b = resolveEntitlements('enterprise', { residency: 'eu' })
    expect(requiresMigration(a, b)).toBe(true)
  })
})

describe('asPlanId', () => {
  it('accepts known plan ids and rejects unknown ones', () => {
    expect(asPlanId('team')).toBe('team')
    expect(() => asPlanId('frobnicate')).toThrow(/Invalid plan id/)
    expect(() => asPlanId(42)).toThrow(/Invalid plan id/)
  })
})
