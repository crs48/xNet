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
import { EFFECTIVE_COGS_MULTIPLIER, PLAN_PRICING, estimateCogs } from './pricing'

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
