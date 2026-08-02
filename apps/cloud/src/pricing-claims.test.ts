/**
 * Every claim on the public pricing grid maps to an enforcing code path
 * (exploration 0436, the last validation item).
 *
 * The pricing page ran ahead of the control plane in three separate places at
 * once: it advertised per-seat billing against a checkout that hard-coded
 * `quantity: 1`, "5 seats, one bill" against a record that could hold one
 * person, and "99.9%" for a plan the catalog gives no availability objective.
 * None of those was caught, because nothing compared the copy to the code.
 *
 * This is that comparison. It reads the marketing data file directly — `site/`
 * cannot import `@xnetjs/*`, but nothing stops us reading it the other way.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  PLAN_CATALOG,
  availabilityObjective,
  isSeatMetered,
  type PlanId
} from '@xnetjs/entitlements'
import { describe, expect, it } from 'vitest'
import { PRICE_BY_PLAN } from './billing-gateway'

const PRICING_SRC = readFileSync(join(process.cwd(), 'site/src/data/pricing.ts'), 'utf8')

/** Ids appearing in the public `PRICING` array, in order. */
const publicTierIds = (): PlanId[] =>
  [...PRICING_SRC.matchAll(/^\s{4}id: '([a-z]+)',$/gm)].map((m) => m[1] as PlanId)

describe('public pricing claims', () => {
  it('every advertised tier is a real plan in the catalog', () => {
    for (const id of publicTierIds()) expect(PLAN_CATALOG[id]).toBeDefined()
  })

  // A tier on the grid must be buyable: either it has a self-serve price, or it
  // is free, or it is explicitly contact-sales. "Advertised and unreachable" is
  // the state exploration 0436 found `community` and the free tier in.
  it('every advertised tier is buyable, free, or explicitly contact-sales', () => {
    const contactSales: PlanId[] = ['enterprise', 'company']
    const free: PlanId[] = ['demo']
    for (const id of publicTierIds()) {
      const buyable = Boolean(PRICE_BY_PLAN[id]) || free.includes(id) || contactSales.includes(id)
      expect(buyable, `plan '${id}' is advertised but has no purchase path`).toBe(true)
    }
  })

  // The Team card said "99.9% best-effort availability". `best-effort` has no
  // objective at all, so `errorBudgetRemaining` reported a full budget forever.
  it('no tier advertises an availability figure its plan has no objective for', () => {
    for (const id of publicTierIds()) {
      const objective = availabilityObjective(PLAN_CATALOG[id].sla)
      if (objective !== null) continue
      // Find this tier's block and check it claims no numeric availability.
      const block = PRICING_SRC.split(`id: '${id}'`)[1]?.split('cta:')[0] ?? ''
      // Tolerant on purpose: the defect this replaced read "99.9% best-effort
      // availability", so anything between the figure and the word still counts.
      expect(
        /\d{1,2}(\.\d+)?%[^'"`]{0,40}(availability|uptime|sla)/i.test(block),
        `plan '${id}' advertises a numeric availability but its SLA is '${PLAN_CATALOG[id].sla}'`
      ).toBe(false)
    }
  })

  // "Unlimited members" may only appear on a plan that is genuinely flat-billed.
  // On a seat-metered plan it would be a promise the seat guard breaks.
  it('only flat-billed plans advertise unlimited members', () => {
    for (const id of publicTierIds()) {
      const block = PRICING_SRC.split(`id: '${id}'`)[1]?.split('cta:')[0] ?? ''
      if (!/unlimited members/i.test(block)) continue
      expect(
        isSeatMetered(PLAN_CATALOG[id]),
        `plan '${id}' advertises unlimited members but is seat-metered`
      ).toBe(false)
    }
  })

  // `community` is the Charter's receipt for "no per-member pricing"; it has to
  // be on the grid and it has to be flat.
  it('community is advertised and flat-billed', () => {
    expect(publicTierIds()).toContain('community')
    expect(isSeatMetered(PLAN_CATALOG.community)).toBe(false)
  })
})
