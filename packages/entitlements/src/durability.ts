/**
 * @xnetjs/entitlements — the durability posture: one source of truth for every
 * public durability claim (exploration 0418).
 *
 * Marketing copy, the terms page, the durability note and `/status` all derive
 * their numbers from here. Nothing restates a figure by hand — that is exactly
 * how the pricing page came to advertise "99.9% best-effort availability" on a
 * tier whose `SlaLevel` backs no objective at all.
 *
 * Two rules this file exists to enforce, both checked in `durability.test.ts`
 * and by `scripts/check-durability-claims.mjs`:
 *
 *   1. A published availability figure never outruns what {@link sloForSla}
 *      will hold us to.
 *   2. A scope is listed in `covered` only once the code actually replicates
 *      it. Widening a promise to make a sentence true is the failure mode.
 */

import { sloForSla, type SloTarget } from './slo'
import { PLAN_CATALOG, PLAN_ORDER, type PlanId } from './plans'

/**
 * What replication actually covers. Adding a member here is a *promise*, not a
 * label — the Restore Commitment applies to exactly these scopes and nothing
 * else. Anything absent is explicitly not promised, and must be disclosed.
 */
export type DurabilityScope = 'change-log' | 'blobs' | 'search-index'

export interface DurabilityPosture {
  /** Recovery Point Objective: max data-time at risk, in seconds. `null` = no commitment. */
  rpoSeconds: number | null
  /** Recovery Time Objective: max time to a serving hub, in minutes. `null` = no commitment. */
  rtoMinutes: number | null
  /** Scopes the Restore Commitment covers. Anything absent is NOT promised. */
  covered: readonly DurabilityScope[]
  /**
   * Availability figure we publish, or `null` to publish none. `null` does not
   * mean unmeasured — availability is measured for every tier and shown live on
   * `/status`; it means we make no *promise*. Full disclosure, no promise.
   */
  publishedAvailability: number | null
  /**
   * Make-Whole: if we lose the hub database and cannot restore it, we refund
   * the fees paid over the trailing {@link makeWholeMonths} months — without
   * being asked — and publish a postmortem. We do not offer downtime credits:
   * a local-first client keeps working through a hub outage, so crediting
   * downtime would compensate the wrong event.
   */
  makeWhole: boolean
  /**
   * How many months of fees Make-Whole refunds. `null` where Make-Whole does
   * not apply. Deliberately shorter than the liability cap in the terms: the
   * cap is a legal ceiling, this is what we pay out automatically.
   */
  makeWholeMonths: number | null
}

/**
 * Months of fees Make-Whole refunds. Twelve, not twenty-four: it matches the
 * annual billing cycle, and it still reads as extraordinary against an industry
 * standard of ~10% of a single month's fee. The liability cap in the terms is a
 * separate, longer number — a ceiling on what can be claimed, not a payout.
 */
export const MAKE_WHOLE_MONTHS = 12

/** No commitment of any kind — the free/demo posture. */
const NO_COMMITMENT: DurabilityPosture = {
  rpoSeconds: null,
  rtoMinutes: null,
  covered: [],
  publishedAvailability: null,
  makeWhole: false,
  makeWholeMonths: null
}

/**
 * `'blobs'` is deliberately absent from every tier until exploration 0288's
 * sync sidecar ships: Litestream replicates the SQLite DB, but
 * `dataDir/{blobs,files}` lives on the container volume only, so a cold
 * demotion loses every attachment. Do not add `'blobs'` here to make a
 * marketing sentence true — `durability.test.ts` fails the build if you do.
 */
export const DURABILITY_POSTURE: Record<PlanId, DurabilityPosture> = {
  demo: NO_COMMITMENT,
  personal: {
    rpoSeconds: 60,
    rtoMinutes: 240,
    covered: ['change-log'],
    publishedAvailability: null,
    makeWhole: true,
    makeWholeMonths: MAKE_WHOLE_MONTHS
  },
  family: {
    rpoSeconds: 60,
    rtoMinutes: 240,
    covered: ['change-log'],
    publishedAvailability: null,
    makeWhole: true,
    makeWholeMonths: MAKE_WHOLE_MONTHS
  },
  team: {
    rpoSeconds: 60,
    rtoMinutes: 120,
    covered: ['change-log'],
    // 99.5%, not the 99.9% the pricing page used to claim: `team` is
    // `best-effort`, so 99.9% was a number the SLO layer refused to back. A
    // real 99.5% outranks a fictional 99.9%.
    publishedAvailability: 0.995,
    makeWhole: true,
    makeWholeMonths: MAKE_WHOLE_MONTHS
  },
  community: {
    rpoSeconds: 60,
    rtoMinutes: 120,
    covered: ['change-log'],
    publishedAvailability: 0.999,
    makeWhole: true,
    makeWholeMonths: MAKE_WHOLE_MONTHS
  },
  company: {
    rpoSeconds: 60,
    rtoMinutes: 60,
    covered: ['change-log'],
    publishedAvailability: 0.999,
    makeWhole: true,
    makeWholeMonths: MAKE_WHOLE_MONTHS
  },
  enterprise: {
    rpoSeconds: 60,
    rtoMinutes: 60,
    covered: ['change-log'],
    publishedAvailability: 0.9995,
    makeWhole: true,
    makeWholeMonths: MAKE_WHOLE_MONTHS
  }
}

/** The durability posture for a plan tier. */
export function durabilityForPlan(plan: PlanId): DurabilityPosture {
  return DURABILITY_POSTURE[plan]
}

/**
 * Does this posture publish an availability figure the SLO layer will not hold
 * us to? `true` for any figure stronger than the objective, and for *any*
 * figure at all when the tier declares no objective — publishing a number with
 * nothing behind it is the drift this function exists to catch.
 */
export function publishedExceedsObjective(
  posture: DurabilityPosture,
  objective: number | null
): boolean {
  if (posture.publishedAvailability === null) return false
  if (objective === null) return true
  return posture.publishedAvailability > objective
}

/** Is `scope` inside the Restore Commitment for this plan? */
export function isScopeCovered(plan: PlanId, scope: DurabilityScope): boolean {
  return DURABILITY_POSTURE[plan].covered.includes(scope)
}

/**
 * Scopes a plan does NOT cover — the disclosure list the durability page
 * renders. Derived so a newly-covered scope disappears from the page the
 * moment it is added to `covered`, with no copy edit.
 */
export function uncoveredScopes(plan: PlanId): DurabilityScope[] {
  const covered = DURABILITY_POSTURE[plan].covered
  return ALL_DURABILITY_SCOPES.filter((s) => !covered.includes(s))
}

export const ALL_DURABILITY_SCOPES: readonly DurabilityScope[] = [
  'change-log',
  'blobs',
  'search-index'
]

/** Human labels for scopes, for the durability page and status surfaces. */
export const DURABILITY_SCOPE_LABELS: Record<DurabilityScope, string> = {
  'change-log': 'Your documents, databases and change history',
  blobs: 'File attachments and images',
  'search-index': 'The full-text search index'
}

/**
 * The published availability figure as a percentage string (e.g. `'99.5%'`), or
 * `null` when the tier publishes none. Every surface that shows an availability
 * number calls this — never a hand-typed literal.
 */
export function publishedAvailabilityLabel(plan: PlanId): string | null {
  const value = DURABILITY_POSTURE[plan].publishedAvailability
  if (value === null) return null
  // Trim trailing zeros so 0.999 → '99.9%' and 0.9995 → '99.95%'.
  return `${Number((value * 100).toFixed(3))}%`
}

/** RTO as a human label ('2 hours', '90 minutes'), or `null` when uncommitted. */
export function rtoLabel(plan: PlanId): string | null {
  const minutes = DURABILITY_POSTURE[plan].rtoMinutes
  if (minutes === null) return null
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }
  return `${minutes} minutes`
}

/**
 * Make-Whole window as a human label ('12 months'), or `null` where it does not
 * apply. Deliberately months rather than years — "12 months of fees" is both
 * plainer and more precise than "1 year of fees" on a policy page.
 */
export function makeWholeLabel(plan: PlanId): string | null {
  const months = DURABILITY_POSTURE[plan].makeWholeMonths
  if (months === null) return null
  return `${months} month${months === 1 ? '' : 's'}`
}

/** RPO as a human label ('60 seconds'), or `null` when uncommitted. */
export function rpoLabel(plan: PlanId): string | null {
  const seconds = DURABILITY_POSTURE[plan].rpoSeconds
  if (seconds === null) return null
  return `${seconds} second${seconds === 1 ? '' : 's'}`
}

/**
 * Every availability figure we publish anywhere, as percentage strings. The
 * `check:durability-claims` gate uses this as the allow-list: a percentage in
 * site copy that is not in here is an unbacked claim.
 */
export function publishedAvailabilityFigures(): string[] {
  const figures = new Set<string>()
  for (const plan of PLAN_ORDER) {
    const label = publishedAvailabilityLabel(plan)
    if (label !== null) figures.add(label)
  }
  return [...figures]
}

/** The SLO a tier is actually measured against — re-exported for convenience. */
export function objectiveForPlan(plan: PlanId): SloTarget {
  return sloForSla(PLAN_CATALOG[plan].sla)
}
