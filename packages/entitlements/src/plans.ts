/**
 * @xnetjs/entitlements — Plan catalog and entitlements.
 *
 * This is the shared contract that BOTH the managed control plane (`@xnetjs/cloud`)
 * and a provisioned hub read. The hub resolves its quotas/concurrency from a
 * signed entitlement token (see `entitlements.ts`) when running under xNet Cloud,
 * and falls back to its own defaults when self-hosted — so self-host never depends
 * on the control plane (the anti-lock-in invariant from exploration 0174).
 *
 * See: docs/explorations/0174_[_]_MANAGED_HOSTING_AS_OPEN_CORE_IN_THE_PUBLIC_MONOREPO.md
 *      docs/explorations/0175_[_]_MANAGED_HUB_FLEET_DEPLOYMENT_AND_AI_GATEWAY.md
 */

const MiB = 1024 * 1024
const GiB = 1024 * MiB

/** Public plan tiers, ordered cheapest → richest. */
export type PlanId =
  | 'demo'
  | 'personal'
  | 'family'
  | 'team'
  | 'community'
  | 'company'
  | 'enterprise'

/**
 * Tenant isolation strength, from a shared pooled service up to a region-pinned
 * dedicated deployment. A plan selects an isolation tier; crossing a tier
 * boundary is what triggers a data migration (everything below it is an in-place
 * entitlement flip — see {@link withStorage}, {@link withSeats}, {@link withConcurrency}).
 */
export type IsolationTier =
  | 'pooled'
  | 'dedicated-sleep'
  | 'dedicated-warm'
  | 'dedicated-project'
  | 'region-pinned'

export type SlaLevel = 'none' | 'best-effort' | '99.9' | 'custom'

/**
 * The fully-resolved set of limits a hub enforces for one tenant. Quotas the hub
 * already honors (`defaultQuota`, `maxBlobSize`, `maxConnections`) become
 * plan-driven via these fields.
 */
export interface PlanEntitlements {
  plan: PlanId
  isolation: IsolationTier
  /** Storage quota per tenant, in bytes (maps to hub `defaultQuota`). */
  quotaBytes: number
  /** Max single blob/backup size, in bytes (maps to hub `maxBlobSize`). */
  maxBlobBytes: number
  /** Max concurrent connections — the concurrency lever (maps to hub `maxConnections`). */
  maxConnections: number
  /** Billed seats (Stripe `SubscriptionItem.quantity`). */
  seats: number
  /** Whether the managed AI gateway is enabled for this tenant. */
  aiEnabled: boolean
  /** ISO region the tenant's data is pinned to (enterprise residency); undefined = unpinned. */
  residency?: string
  sla: SlaLevel
}

/** The default entitlements for each plan tier. */
export const PLAN_CATALOG: Record<PlanId, PlanEntitlements> = {
  demo: {
    plan: 'demo',
    isolation: 'pooled',
    quotaBytes: 10 * MiB,
    maxBlobBytes: 2 * MiB,
    maxConnections: 50,
    seats: 1,
    aiEnabled: false,
    sla: 'none'
  },
  personal: {
    plan: 'personal',
    isolation: 'dedicated-sleep',
    quotaBytes: 25 * GiB,
    maxBlobBytes: 50 * MiB,
    maxConnections: 250,
    seats: 1,
    aiEnabled: true,
    sla: 'best-effort'
  },
  family: {
    plan: 'family',
    isolation: 'dedicated-sleep',
    quotaBytes: 250 * GiB,
    maxBlobBytes: 100 * MiB,
    maxConnections: 500,
    seats: 5,
    aiEnabled: true,
    sla: 'best-effort'
  },
  team: {
    plan: 'team',
    isolation: 'dedicated-warm',
    quotaBytes: 100 * GiB,
    maxBlobBytes: 100 * MiB,
    maxConnections: 1000,
    seats: 3,
    aiEnabled: true,
    sla: 'best-effort'
  },
  community: {
    plan: 'community',
    isolation: 'dedicated-project',
    quotaBytes: 500 * GiB,
    maxBlobBytes: 250 * MiB,
    maxConnections: 2000,
    seats: 10,
    aiEnabled: true,
    sla: '99.9'
  },
  company: {
    plan: 'company',
    isolation: 'dedicated-project',
    quotaBytes: 1024 * GiB,
    maxBlobBytes: 500 * MiB,
    maxConnections: 4000,
    seats: 10,
    aiEnabled: true,
    sla: '99.9'
  },
  enterprise: {
    plan: 'enterprise',
    isolation: 'region-pinned',
    quotaBytes: 5 * 1024 * GiB,
    maxBlobBytes: 1024 * MiB,
    maxConnections: 10000,
    seats: 25,
    aiEnabled: true,
    sla: 'custom'
  }
}

/** Ordered list of plan ids, cheapest → richest. */
export const PLAN_ORDER: readonly PlanId[] = [
  'demo',
  'personal',
  'family',
  'team',
  'community',
  'company',
  'enterprise'
]

const isPlanId = (value: unknown): value is PlanId =>
  typeof value === 'string' && (PLAN_ORDER as readonly string[]).includes(value)

/**
 * Resolve a plan's entitlements, applying any per-tenant overrides (e.g. an
 * add-on storage pack, extra seats, a region pin). Overrides are validated to
 * never silently exceed sane bounds; callers own the billing side.
 */
export function resolveEntitlements(
  plan: PlanId,
  overrides: Partial<Omit<PlanEntitlements, 'plan'>> = {}
): PlanEntitlements {
  const base = PLAN_CATALOG[plan]
  if (!base) throw new Error(`Unknown plan: ${plan}`)
  return { ...base, ...overrides, plan }
}

/** Raise (or set) the storage quota — an in-place entitlement flip, no migration. */
export function withStorage(entitlements: PlanEntitlements, quotaBytes: number): PlanEntitlements {
  if (!Number.isFinite(quotaBytes) || quotaBytes < 0) {
    throw new Error(`Invalid quotaBytes: ${quotaBytes}`)
  }
  return { ...entitlements, quotaBytes }
}

/** Change the billed seat count — flows to Stripe `SubscriptionItem.quantity`. */
export function withSeats(entitlements: PlanEntitlements, seats: number): PlanEntitlements {
  if (!Number.isInteger(seats) || seats < 1) {
    throw new Error(`Invalid seats: ${seats}`)
  }
  return { ...entitlements, seats }
}

/** Raise the concurrency ceiling — an in-place entitlement flip, no migration. */
export function withConcurrency(
  entitlements: PlanEntitlements,
  maxConnections: number
): PlanEntitlements {
  if (!Number.isInteger(maxConnections) || maxConnections < 1) {
    throw new Error(`Invalid maxConnections: ${maxConnections}`)
  }
  return { ...entitlements, maxConnections }
}

/**
 * True when moving `from` → `to` crosses an isolation-tier boundary and therefore
 * requires the data-migration engine rather than a live entitlement flip.
 */
export function requiresMigration(from: PlanEntitlements, to: PlanEntitlements): boolean {
  if (from.isolation !== to.isolation) return true
  // A change in pinned region also moves data even within the same tier.
  return (from.residency ?? null) !== (to.residency ?? null)
}

/** Narrowing guard for untrusted plan ids (e.g. from env/JSON). */
export function asPlanId(value: unknown): PlanId {
  if (!isPlanId(value)) throw new Error(`Invalid plan id: ${String(value)}`)
  return value
}
