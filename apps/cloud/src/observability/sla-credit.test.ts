import { describe, expect, it } from 'vitest'
import { CREDIT_LADDER, creditAmountUsd, creditFor, describeCredit } from './sla-credit'
import { sloForPlan, sloForSla } from './slo'

describe('SLA service credits (0436 G12)', () => {
  const slo = sloForSla('99.9')

  it('owes nothing when the objective is met', () => {
    expect(creditFor(slo, 0.9995)?.percent).toBe(0)
    expect(creditFor(slo, 0.999)?.percent).toBe(0)
  })

  it('climbs the ladder as availability falls', () => {
    expect(creditFor(slo, 0.9985)?.percent).toBe(10)
    expect(creditFor(slo, 0.98)?.percent).toBe(25)
    expect(creditFor(slo, 0.9)?.percent).toBe(50)
  })

  // The worst matching rung wins. A ladder that returned the FIRST match would
  // credit 10% for a month that was down half the time.
  it('takes the deepest matching rung, never the shallowest', () => {
    const worst = Math.max(...CREDIT_LADDER.map((t) => t.percent))
    expect(creditFor(slo, 0)?.percent).toBe(worst)
  })

  // "No SLA" and "an SLA that was met" must not render the same. A caller that
  // cannot tell them apart shows "0% owed" to somebody never promised anything.
  it('returns null — not a zero credit — for a plan with no objective', () => {
    expect(creditFor(sloForPlan('personal'), 0.5)).toBeNull()
    expect(creditFor(sloForPlan('community'), 0.5)?.percent).toBe(50)
  })

  it('converts to whole cents', () => {
    const credit = creditFor(slo, 0.998)!
    expect(credit.percent).toBe(10)
    expect(creditAmountUsd(credit, 49)).toBeCloseTo(4.9, 5)
    expect(creditAmountUsd(creditFor(slo, 0.9995)!, 49)).toBe(0)
  })

  it('describes the outcome in one readable line', () => {
    expect(describeCredit(creditFor(slo, 0.9995))).toMatch(/met/)
    expect(describeCredit(creditFor(slo, 0.98))).toMatch(/25% of the period fee/)
    expect(describeCredit(null)).toMatch(/No published availability objective/)
  })
})
