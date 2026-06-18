/**
 * @xnetjs/cloud/cost — measured per-tenant margin reconciliation.
 *
 * `estimateCogs` models COGS from *assumed* typical usage; this turns it into
 * *measured* margin by feeding in what a tenant actually used (storage bytes,
 * active hours, AI provider cost, real Stripe fees) and comparing against the
 * revenue it produced (exploration 0200, slice B). The output is the truth the
 * run-in-public dashboard (slice C) aggregates and the signal that flags a
 * negative-margin tenant. Pure + I/O-free — exhaustively unit-testable.
 *
 * Note: AI is metered separately (its retail charge already carries margin via the
 * token markup), so here we count only the AI *provider cost* as COGS — the
 * marked-up AI revenue is reconciled on the revenue side, not double-counted.
 */

import { UNIT_COSTS } from './pricing'

const GiB = 1024 * 1024 * 1024
const round = (n: number): number => Math.round(n * 1e4) / 1e4

/** What a tenant actually consumed over a billing period (measured, not assumed). */
export interface TenantUsageMeasurement {
  tenantId: string
  /** Bulk storage actually used (bytes) — billed at the R2 rate. */
  storageBytes: number
  /** Active compute hours for a scale-to-zero hub (0 when warm). */
  activeHours: number
  /** True for an always-warm hub (pays the flat monthly compute). */
  warm: boolean
  /** Warm units (default 1). */
  warmUnits?: number
  /** Hot DB volume actually provisioned (bytes); 0 = DB-in-R2. */
  hotDbBytes?: number
  volume?: 'fly' | 'hetzner'
  /** Enterprise SSO + SCIM via WorkOS. */
  ssoScim?: boolean
  /** The AI provider's own (un-marked-up) cost for the period — COGS, from the ledger. */
  aiProviderCostUsd: number
  /** Real Stripe fees for the period (from invoices); falls back to a modeled fee. */
  stripeFeesUsd?: number
  /** Revenue the tenant produced this period (subscription + AI overage). */
  revenueUsd: number
}

export interface TenantCostBreakdown {
  computeUsd: number
  storageUsd: number
  identityUsd: number
  aiUsd: number
  stripeUsd: number
  totalCogsUsd: number
}

export interface TenantMargin {
  tenantId: string
  revenueUsd: number
  cogs: TenantCostBreakdown
  marginUsd: number
  marginPct: number
  /** False when COGS exceeds revenue — a tenant we lose money on. */
  healthy: boolean
}

/** Compute measured COGS for one tenant from what it actually used. */
export function measuredCogs(m: TenantUsageMeasurement): TenantCostBreakdown {
  const compute = m.warm
    ? UNIT_COSTS.warmComputePerMonth * (m.warmUnits ?? 1)
    : m.activeHours * UNIT_COSTS.activeComputePerHour

  const volumeRate =
    m.volume === 'hetzner' ? UNIT_COSTS.hetznerVolumePerGbMonth : UNIT_COSTS.flyVolumePerGbMonth
  const storage =
    (m.storageBytes / GiB) * UNIT_COSTS.r2StoragePerGbMonth +
    ((m.hotDbBytes ?? 0) / GiB) * volumeRate

  const identity = m.ssoScim ? UNIT_COSTS.workosSsoScimPerMonth : 0
  const ai = Math.max(0, m.aiProviderCostUsd)
  const stripe =
    m.stripeFeesUsd ?? m.revenueUsd * UNIT_COSTS.stripePercent + UNIT_COSTS.stripeFixedPerCharge

  const total = compute + storage + identity + ai + stripe
  return {
    computeUsd: round(compute),
    storageUsd: round(storage),
    identityUsd: round(identity),
    aiUsd: round(ai),
    stripeUsd: round(stripe),
    totalCogsUsd: round(total)
  }
}

/** Reconcile one tenant's revenue against measured COGS → margin + a health verdict. */
export function reconcileTenantMargin(m: TenantUsageMeasurement): TenantMargin {
  const cogs = measuredCogs(m)
  const margin = m.revenueUsd - cogs.totalCogsUsd
  return {
    tenantId: m.tenantId,
    revenueUsd: round(m.revenueUsd),
    cogs,
    marginUsd: round(margin),
    marginPct: m.revenueUsd > 0 ? round(margin / m.revenueUsd) : 0,
    healthy: margin >= 0
  }
}

export interface FleetMargin {
  revenueUsd: number
  cogsUsd: number
  marginUsd: number
  marginPct: number
  tenantCount: number
  /** Tenants we currently lose money on (margin < 0). */
  negativeTenants: string[]
}

/** Aggregate per-tenant margins into a fleet P&L (the dashboard's headline). */
export function aggregateMargin(margins: TenantMargin[]): FleetMargin {
  const revenue = margins.reduce((s, m) => s + m.revenueUsd, 0)
  const cogs = margins.reduce((s, m) => s + m.cogs.totalCogsUsd, 0)
  const margin = revenue - cogs
  return {
    revenueUsd: round(revenue),
    cogsUsd: round(cogs),
    marginUsd: round(margin),
    marginPct: revenue > 0 ? round(margin / revenue) : 0,
    tenantCount: margins.length,
    negativeTenants: margins.filter((m) => !m.healthy).map((m) => m.tenantId)
  }
}
