/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Mirrors packages/entitlements/src/durability.ts, the single source of truth
 * for every public durability claim (exploration 0418). `site/` installs with
 * `--ignore-workspace` and cannot import `@xnetjs/*`, so this mirror exists —
 * and `pnpm check:durability-claims` fails the build if it drifts.
 *
 * Regenerate:  pnpm check:durability-claims --write
 */

export type DurabilityScope = 'change-log' | 'blobs' | 'search-index'

export interface SiteDurabilityPosture {
  rpoSeconds: number | null
  rtoMinutes: number | null
  covered: DurabilityScope[]
  publishedAvailability: number | null
  /** Pre-formatted so no page ever does percentage maths. */
  publishedAvailabilityLabel: string | null
  rpoLabel: string | null
  rtoLabel: string | null
  /** What the SLO layer holds us to, for the status surface. */
  objectiveLabel: string
  makeWhole: boolean
}

export type SitePlanId = 'demo' | 'personal' | 'family' | 'team' | 'community' | 'company' | 'enterprise'

export const DURABILITY: Record<SitePlanId, SiteDurabilityPosture> = {
  demo: {
    rpoSeconds: null,
    rtoMinutes: null,
    covered: [],
    publishedAvailability: null,
    publishedAvailabilityLabel: null,
    rpoLabel: null,
    rtoLabel: null,
    objectiveLabel: "no SLA",
    makeWhole: false
  },
  personal: {
    rpoSeconds: 60,
    rtoMinutes: 240,
    covered: ['change-log'],
    publishedAvailability: null,
    publishedAvailabilityLabel: null,
    rpoLabel: "60 seconds",
    rtoLabel: "4 hours",
    objectiveLabel: "best-effort",
    makeWhole: true
  },
  family: {
    rpoSeconds: 60,
    rtoMinutes: 240,
    covered: ['change-log'],
    publishedAvailability: null,
    publishedAvailabilityLabel: null,
    rpoLabel: "60 seconds",
    rtoLabel: "4 hours",
    objectiveLabel: "best-effort",
    makeWhole: true
  },
  team: {
    rpoSeconds: 60,
    rtoMinutes: 120,
    covered: ['change-log'],
    publishedAvailability: 0.995,
    publishedAvailabilityLabel: "99.5%",
    rpoLabel: "60 seconds",
    rtoLabel: "2 hours",
    objectiveLabel: "99.5% uptime",
    makeWhole: true
  },
  community: {
    rpoSeconds: 60,
    rtoMinutes: 120,
    covered: ['change-log'],
    publishedAvailability: 0.999,
    publishedAvailabilityLabel: "99.9%",
    rpoLabel: "60 seconds",
    rtoLabel: "2 hours",
    objectiveLabel: "99.9% uptime",
    makeWhole: true
  },
  company: {
    rpoSeconds: 60,
    rtoMinutes: 60,
    covered: ['change-log'],
    publishedAvailability: 0.999,
    publishedAvailabilityLabel: "99.9%",
    rpoLabel: "60 seconds",
    rtoLabel: "1 hour",
    objectiveLabel: "99.9% uptime",
    makeWhole: true
  },
  enterprise: {
    rpoSeconds: 60,
    rtoMinutes: 60,
    covered: ['change-log'],
    publishedAvailability: 0.9995,
    publishedAvailabilityLabel: "99.95%",
    rpoLabel: "60 seconds",
    rtoLabel: "1 hour",
    objectiveLabel: "99.95% uptime (enterprise)",
    makeWhole: true
  }
}

export const SCOPE_LABELS: Record<DurabilityScope, string> = {
  'change-log': "Your documents, databases and change history",
  'blobs': "File attachments and images",
  'search-index': "The full-text search index"
}

export const ALL_SCOPES: DurabilityScope[] = ['change-log', 'blobs', 'search-index']

/** Scopes a tier does NOT cover — the disclosure list the durability page renders. */
export function uncovered(plan: SitePlanId): DurabilityScope[] {
  return ALL_SCOPES.filter((s) => !DURABILITY[plan].covered.includes(s))
}

/** Every availability figure we publish anywhere. */
export const PUBLISHED_FIGURES: string[] = ["99.5%", "99.9%", "99.95%"]
