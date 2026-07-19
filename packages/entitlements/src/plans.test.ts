import { describe, expect, it } from 'vitest'
import {
  CHEAP_AI_MODELS,
  PLAN_CATALOG,
  PLAN_ORDER,
  aiModelAllowed,
  asPlanId,
  requiresMigration,
  resolveEntitlements,
  withAiBudget,
  withAiModels,
  withConcurrency,
  isSeatMetered,
  withSeats,
  withStorage
} from './plans'

describe('PLAN_CATALOG', () => {
  it('has an entry for every ordered plan id', () => {
    for (const plan of PLAN_ORDER) {
      expect(PLAN_CATALOG[plan]?.plan).toBe(plan)
    }
  })

  // Charter §6 (No ground rent), exploration 0359. Billing a community host per
  // member charges them for access to an audience they brought — the margin
  // would ride on a relationship we did not build, failing the improvement
  // test. Community hosting is priced on operations, and membership is free to
  // grow. This test is the receipt; it fails the build if the meter comes back.
  it('never seat-meters the community plan — members are not seats', () => {
    expect(PLAN_CATALOG.community.seats).toBe(0)
    expect(isSeatMetered(PLAN_CATALOG.community)).toBe(false)
  })

  it('refuses to attach a seat count to a flat-billed plan', () => {
    expect(() => withSeats(PLAN_CATALOG.community, 50)).toThrow(/flat-billed/)
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

  it('every AI-enabled plan has a default model permitted by its own policy', () => {
    for (const plan of PLAN_ORDER) {
      const ent = PLAN_CATALOG[plan]
      if (!ent.aiEnabled) continue
      expect(ent.aiDefaultModel).toBeDefined()
      expect(aiModelAllowed(ent.aiModels, ent.aiDefaultModel as string)).toBe(true)
    }
  })

  it('gates cheaper plans to the cheap subset and gives bigger plans the whole catalog', () => {
    expect(PLAN_CATALOG.personal.aiModels).toBe(CHEAP_AI_MODELS)
    expect(PLAN_CATALOG.company.aiModels).toBe('all')
    // A frontier model is rejected on a small plan but allowed on a big one.
    expect(aiModelAllowed(PLAN_CATALOG.personal.aiModels, 'anthropic/claude-opus-4-8')).toBe(false)
    expect(aiModelAllowed(PLAN_CATALOG.company.aiModels, 'anthropic/claude-opus-4-8')).toBe(true)
  })
})

describe('aiModelAllowed / withAiModels', () => {
  it("treats 'all' and undefined as permitting any model", () => {
    expect(aiModelAllowed('all', 'anything/at-all')).toBe(true)
    expect(aiModelAllowed(undefined, 'anything/at-all')).toBe(true)
  })

  it('gates to an explicit allowlist', () => {
    expect(aiModelAllowed(['a/b'], 'a/b')).toBe(true)
    expect(aiModelAllowed(['a/b'], 'c/d')).toBe(false)
  })

  it('sets the policy + default, rejecting a default outside the policy', () => {
    const base = PLAN_CATALOG.personal
    const updated = withAiModels(base, ['a/b', 'c/d'], 'c/d')
    expect(updated.aiModels).toEqual(['a/b', 'c/d'])
    expect(updated.aiDefaultModel).toBe('c/d')
    expect(() => withAiModels(base, ['a/b'], 'z/z')).toThrow(/not permitted/)
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
