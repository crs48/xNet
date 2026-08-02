/**
 * Floor-margin guard (exploration 0244).
 *
 * The per-token AI markup is provably positive on overage, but the *included*
 * free AI allotment is given away near cost and must be covered by the
 * subscription. This asserts that, for every priced plan, the worst case — a
 * tenant who burns its **entire** `includedAiUsd` allotment in a month, valued at
 * the true credit COGS (× {@link EFFECTIVE_COGS_MULTIPLIER}) — still leaves a
 * positive monthly margin after base COGS. If a future plan's price or included
 * allotment drifts into the red, this test fails loudly.
 */

import { PLAN_CATALOG, type PlanId } from '@xnetjs/entitlements'
import { describe, expect, it } from 'vitest'
import {
  EFFECTIVE_COGS_MULTIPLIER,
  PLAN_PRICING,
  STORAGE_PACK_PRICE_PER_GB_MONTH,
  STORAGE_PACK_SIZES_GB,
  estimateCogs,
  storagePackMargin
} from './pricing'

describe('plan floor margin (included AI allotment given away)', () => {
  const pricedPlans = Object.keys(PLAN_PRICING) as PlanId[]

  it.each(pricedPlans)('%s stays margin-positive in the worst case', (plan) => {
    const scenario = PLAN_PRICING[plan]!
    const ent = PLAN_CATALOG[plan]
    const base = estimateCogs(scenario)

    // Worst case: the whole included allotment spent, valued at true credit COGS.
    // Conservative — `includedAiUsd` is a *retail* budget, so the real provider
    // cost is lower; if this passes, the realistic margin is strictly better.
    const worstCaseAiCogs = ent.includedAiUsd * EFFECTIVE_COGS_MULTIPLIER
    const worstCaseMargin = base.monthlyRevenueUsd - base.totalCogsUsd - worstCaseAiCogs

    expect(worstCaseMargin).toBeGreaterThan(0)
  })

  it('the AI COGS multiplier covers OpenRouter’s ~5.5% credit fee', () => {
    expect(EFFECTIVE_COGS_MULTIPLIER).toBeGreaterThanOrEqual(1.055)
  })
})

/**
 * Storage add-on floor margin (exploration 0435).
 *
 * Storage is a pass-through of a cost we literally pay per byte, so the margin
 * is thinner than the subscription's and needs its own floor. 35% is the line:
 * below it a pack stops covering the support and restore-drill burden that real
 * volume brings with it.
 */
describe('storage pack margin (0435)', () => {
  const FLOOR = 0.35

  it.each([...STORAGE_PACK_SIZES_GB])('the +%i GiB pack clears the margin floor', (packGb) => {
    const m = storagePackMargin(packGb)
    expect(m.grossMarginUsd).toBeGreaterThan(0)
    expect(m.grossMarginPct).toBeGreaterThan(FLOOR)
  })

  // A flat $/GB rate over a linear cost is the whole reason this pricing is one
  // number: if a future edit tiers the price, the margins diverge and this fails.
  it('holds the SAME margin at every pack size', () => {
    const pcts = STORAGE_PACK_SIZES_GB.map((gb) => storagePackMargin(gb).grossMarginPct)
    for (const pct of pcts) expect(pct).toBeCloseTo(pcts[0]!, 6)
  })

  it('prices the published packs at $3 / $15 / $30', () => {
    expect(storagePackMargin(100).monthlyRevenueUsd).toBeCloseTo(3, 6)
    expect(storagePackMargin(500).monthlyRevenueUsd).toBeCloseTo(15, 6)
    expect(storagePackMargin(1000).monthlyRevenueUsd).toBeCloseTo(30, 6)
  })

  // The add-on rides an invoice the base subscription already pays for, so only
  // the percentage applies. Charging the $0.30 again would understate margin.
  it('charges the Stripe percentage only, never the fixed per-charge fee', () => {
    const m = storagePackMargin(100)
    expect(m.stripeUsd).toBeCloseTo(3 * 0.029, 6)
    expect(m.stripeUsd).toBeLessThan(0.3)
  })

  it('stays above the raw R2 input cost by a real multiple', () => {
    // Selling storage at or near cost is a subsidy, not a business.
    expect(STORAGE_PACK_PRICE_PER_GB_MONTH).toBeGreaterThan(0.015 * 1.5)
  })

  it('is zero-revenue and zero-margin for an empty pack', () => {
    const m = storagePackMargin(0)
    expect(m.monthlyRevenueUsd).toBe(0)
    expect(m.grossMarginPct).toBe(0)
  })

  it('rejects a negative pack rather than returning a plausible number', () => {
    expect(() => storagePackMargin(-100)).toThrow(/Invalid storage pack/)
  })
})
