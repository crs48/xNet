import { describe, expect, it } from 'vitest'
import {
  ALL_DURABILITY_SCOPES,
  DURABILITY_POSTURE,
  DURABILITY_SCOPE_LABELS,
  MAKE_WHOLE_MONTHS,
  durabilityForPlan,
  makeWholeLabel,
  isScopeCovered,
  objectiveForPlan,
  publishedAvailabilityFigures,
  publishedAvailabilityLabel,
  publishedExceedsObjective,
  rpoLabel,
  rtoLabel,
  uncoveredScopes
} from './durability'
import { PLAN_ORDER } from './plans'
import { sloForSla } from './slo'

describe('DURABILITY_POSTURE', () => {
  it('has an entry for every plan', () => {
    for (const plan of PLAN_ORDER) {
      expect(DURABILITY_POSTURE[plan]).toBeDefined()
    }
  })

  // Exploration 0425. The pricing page advertised "99.9% best-effort
  // availability" on `team`, whose SlaLevel is 'best-effort' → objective null:
  // a number the SLO layer explicitly declines to hold. This is the receipt
  // that the copy can never again outrun the code.
  it('publishes no availability figure its SlaLevel does not back', () => {
    for (const plan of PLAN_ORDER) {
      const { objective } = objectiveForPlan(plan)
      expect(
        publishedExceedsObjective(DURABILITY_POSTURE[plan], objective),
        `${plan} publishes a figure its SlaLevel does not back`
      ).toBe(false)
    }
  })

  // Exploration 0288's blob/file sync sidecar is unshipped: Litestream covers
  // the SQLite DB, `dataDir/{blobs,files}` is on the container volume only, and
  // a cold demotion loses every attachment. Flip THIS test, not the constant,
  // when blob replication actually lands.
  it('never claims blob coverage until the 0288 sidecar ships', () => {
    for (const plan of PLAN_ORDER) {
      expect(
        DURABILITY_POSTURE[plan].covered,
        `${plan} claims blob durability the code does not provide`
      ).not.toContain('blobs')
    }
  })

  it('keeps the demo tier free of every commitment', () => {
    const demo = durabilityForPlan('demo')
    expect(demo.rpoSeconds).toBeNull()
    expect(demo.rtoMinutes).toBeNull()
    expect(demo.publishedAvailability).toBeNull()
    expect(demo.makeWhole).toBe(false)
    expect(demo.covered).toEqual([])
  })

  it('offers Make-Whole on every paid tier, with a window attached', () => {
    for (const plan of PLAN_ORDER) {
      if (plan === 'demo') continue
      const posture = durabilityForPlan(plan)
      expect(posture.makeWhole, `${plan} should offer Make-Whole`).toBe(true)
      expect(posture.makeWholeMonths, `${plan} promises Make-Whole with no window`).toBe(
        MAKE_WHOLE_MONTHS
      )
    }
  })

  // The refund window must never exceed the liability cap stated in the terms:
  // the cap is a ceiling on what can be claimed, the refund is what we pay out
  // unprompted. A payout larger than the ceiling would be incoherent (0425).
  it('keeps the Make-Whole window inside the 24-month liability cap', () => {
    expect(MAKE_WHOLE_MONTHS).toBeLessThanOrEqual(24)
  })

  it('never attaches a Make-Whole window where Make-Whole does not apply', () => {
    for (const plan of PLAN_ORDER) {
      const posture = durabilityForPlan(plan)
      if (!posture.makeWhole) {
        expect(posture.makeWholeMonths, `${plan} has a window but no Make-Whole`).toBeNull()
      }
    }
  })

  it('commits to an RPO and RTO wherever it commits to Make-Whole', () => {
    for (const plan of PLAN_ORDER) {
      const posture = durabilityForPlan(plan)
      if (!posture.makeWhole) continue
      expect(posture.rpoSeconds, `${plan} promises Make-Whole with no RPO`).not.toBeNull()
      expect(posture.rtoMinutes, `${plan} promises Make-Whole with no RTO`).not.toBeNull()
      expect(posture.covered.length, `${plan} promises Make-Whole over no scope`).toBeGreaterThan(0)
    }
  })

  it('never commits to a scope on a tier that makes no commitment at all', () => {
    for (const plan of PLAN_ORDER) {
      const posture = durabilityForPlan(plan)
      if (posture.rpoSeconds === null) {
        expect(posture.covered, `${plan} covers a scope with no RPO`).toEqual([])
      }
    }
  })
})

describe('publishedExceedsObjective', () => {
  it('is false when nothing is published', () => {
    expect(publishedExceedsObjective(DURABILITY_POSTURE.personal, null)).toBe(false)
  })

  it('is true for any figure published against no objective', () => {
    const posture = { ...DURABILITY_POSTURE.team, publishedAvailability: 0.9 }
    expect(publishedExceedsObjective(posture, null)).toBe(true)
  })

  it('is true when the published figure is stronger than the objective', () => {
    const posture = { ...DURABILITY_POSTURE.community, publishedAvailability: 0.9999 }
    expect(publishedExceedsObjective(posture, sloForSla('99.9').objective)).toBe(true)
  })

  it('allows publishing at or below the objective', () => {
    const posture = { ...DURABILITY_POSTURE.community, publishedAvailability: 0.99 }
    expect(publishedExceedsObjective(posture, sloForSla('99.9').objective)).toBe(false)
  })
})

describe('labels', () => {
  it('formats availability without trailing zeros', () => {
    expect(publishedAvailabilityLabel('team')).toBe('99.5%')
    expect(publishedAvailabilityLabel('community')).toBe('99.9%')
    expect(publishedAvailabilityLabel('enterprise')).toBe('99.95%')
    expect(publishedAvailabilityLabel('personal')).toBeNull()
  })

  it('formats RTO in hours when whole, minutes otherwise', () => {
    expect(rtoLabel('personal')).toBe('4 hours')
    expect(rtoLabel('company')).toBe('1 hour')
    expect(rtoLabel('demo')).toBeNull()
  })

  it('formats the Make-Whole window in months', () => {
    expect(makeWholeLabel('personal')).toBe('12 months')
    expect(makeWholeLabel('demo')).toBeNull()
  })

  it('formats RPO in seconds', () => {
    expect(rpoLabel('personal')).toBe('60 seconds')
    expect(rpoLabel('demo')).toBeNull()
  })

  it('has a label for every scope', () => {
    for (const scope of ALL_DURABILITY_SCOPES) {
      expect(DURABILITY_SCOPE_LABELS[scope]).toBeTruthy()
    }
  })
})

describe('scope helpers', () => {
  it('reports the change log as covered on paid tiers', () => {
    expect(isScopeCovered('personal', 'change-log')).toBe(true)
    expect(isScopeCovered('demo', 'change-log')).toBe(false)
  })

  it('lists blobs among the uncovered scopes to disclose', () => {
    expect(uncoveredScopes('personal')).toContain('blobs')
    expect(uncoveredScopes('personal')).not.toContain('change-log')
  })

  it('exposes exactly the published figures as the claim allow-list', () => {
    const figures = publishedAvailabilityFigures()
    expect(figures).toContain('99.5%')
    expect(figures).toContain('99.9%')
    expect(figures).toContain('99.95%')
    // The retired claim must not be reachable through the allow-list.
    expect(figures).not.toContain('99.99%')
  })
})
