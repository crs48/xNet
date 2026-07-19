/**
 * @xnetjs/cloud/cost — plan cost model (storage + compute + payments → margin).
 *
 * The illustrative pricing model from exploration 0178, made executable: compose the
 * unit costs established across 0148 (AI), 0175 (compute/scale-to-zero), and
 * 0177/0178 (storage) into a per-plan COGS + gross-margin estimate, so prices and
 * included quotas can be checked against a modeled margin floor in tests.
 *
 * AI is a separate metered add-on (0148/0176) and is intentionally NOT in base COGS.
 * Pure and I/O-free — exhaustively unit-testable.
 */

import type { PlanId } from '@xnetjs/entitlements'

/** USD unit costs (June 2026 basis; see 0175/0177/0178). */
export const UNIT_COSTS = {
  /** Object storage (R2) for bulk blobs + cold DB snapshots, per GB-month. Zero egress. */
  r2StoragePerGbMonth: 0.015,
  /** Hot DB volume, per GB-month. */
  flyVolumePerGbMonth: 0.15,
  hetznerVolumePerGbMonth: 0.048,
  /** Always-warm hub (never sleeps), per month per unit (~1 vCPU/1 GB). */
  warmComputePerMonth: 6,
  /** Active compute for a scale-to-zero hub, per active hour (Fly shared-cpu-1x ~$1.94/mo ÷ 730 h). */
  activeComputePerHour: 0.00266,
  /** WorkOS SSO + SCIM (2 connections) for enterprise, per month. */
  workosSsoScimPerMonth: 250,
  /** Stripe processing. */
  stripePercent: 0.029,
  stripeFixedPerCharge: 0.3
} as const

/**
 * Multiplier that turns an OpenRouter `usage.cost` dollar into xNet's *true* COGS.
 *
 * OpenRouter passes model tokens through at 0% markup but charges a **5.5% fee on
 * credit top-ups** (its actual business model — exploration 0244). So every $1 of
 * `usage.cost` cost us ~$1.055 in purchased credits. Margin reconciliation and the
 * plan floor-margin check both apply this so AI COGS is never understated.
 * Overridable via `AI_EFFECTIVE_COGS_MULTIPLIER` at the app layer.
 */
export const EFFECTIVE_COGS_MULTIPLIER = 1.055

export interface PlanCostInputs {
  /** Typical bulk storage actually used (GB) — billed at the R2 rate. */
  storageGbTypical: number
  /** Typical active compute hours/month for a scale-to-zero hub (ignored when `warm`). */
  activeHoursPerMonth: number
  /** True for an always-warm hub (team/enterprise) that pays `warmComputePerMonth`. */
  warm: boolean
  /** Number of warm hub units (default 1). */
  warmUnits?: number
  /** Hot DB kept on a volume (GB) for Model A; 0/undefined = Model B (DB in R2). */
  hotDbGb?: number
  /** Volume provider for the hot DB (default `fly`). */
  volume?: 'fly' | 'hetzner'
  /** Enterprise SSO + SCIM via WorkOS. */
  ssoScim?: boolean
}

export interface PlanCostBreakdown {
  computeUsd: number
  storageUsd: number
  identityUsd: number
  stripeUsd: number
  totalCogsUsd: number
  /** Effective monthly revenue (annual price ÷ 12 for annual billing). */
  monthlyRevenueUsd: number
  grossMarginUsd: number
  grossMarginPct: number
}

export interface PricingScenario {
  /** The actual amount charged to the customer. */
  priceUsd: number
  /** Billing period — annual amortizes the $0.30 fixed Stripe fee over 12 months. */
  period: 'month' | 'year'
  inputs: PlanCostInputs
}

const round = (n: number): number => Math.round(n * 1e4) / 1e4

/**
 * Estimate a plan's monthly COGS and gross margin. The percent Stripe fee is the
 * same per month either way; only the fixed $0.30 differs — amortized to $0.025/mo
 * on annual billing (the entry-tier margin lever from 0178).
 */
export function estimateCogs(scenario: PricingScenario): PlanCostBreakdown {
  const { priceUsd, period, inputs } = scenario
  const monthlyRevenue = period === 'year' ? priceUsd / 12 : priceUsd

  const compute = inputs.warm
    ? UNIT_COSTS.warmComputePerMonth * (inputs.warmUnits ?? 1)
    : inputs.activeHoursPerMonth * UNIT_COSTS.activeComputePerHour

  const volumeRate =
    inputs.volume === 'hetzner'
      ? UNIT_COSTS.hetznerVolumePerGbMonth
      : UNIT_COSTS.flyVolumePerGbMonth
  const storage =
    inputs.storageGbTypical * UNIT_COSTS.r2StoragePerGbMonth + (inputs.hotDbGb ?? 0) * volumeRate

  const identity = inputs.ssoScim ? UNIT_COSTS.workosSsoScimPerMonth : 0

  // One charge per period; amortize to a monthly figure.
  const chargesPerMonth = period === 'year' ? 1 / 12 : 1
  const stripePerCharge = priceUsd * UNIT_COSTS.stripePercent + UNIT_COSTS.stripeFixedPerCharge
  const stripe = stripePerCharge * chargesPerMonth

  const totalCogs = compute + storage + identity + stripe
  const margin = monthlyRevenue - totalCogs

  return {
    computeUsd: round(compute),
    storageUsd: round(storage),
    identityUsd: round(identity),
    stripeUsd: round(stripe),
    totalCogsUsd: round(totalCogs),
    monthlyRevenueUsd: round(monthlyRevenue),
    grossMarginUsd: round(margin),
    grossMarginPct: monthlyRevenue > 0 ? round(margin / monthlyRevenue) : 0
  }
}

/** Recommended default billing period per plan (entry tier → annual amortizes the Stripe fee). */
export const DEFAULT_BILLING_PERIOD: Partial<Record<PlanId, 'month' | 'year'>> = {
  personal: 'year'
}

/**
 * Illustrative pricing scenarios for the catalog plans (typical usage, well below the
 * included ceiling — see 0178). Used to assert margin floors in tests, not as a price list.
 */
export const PLAN_PRICING: Partial<Record<PlanId, PricingScenario>> = {
  personal: {
    priceUsd: 50,
    period: 'year', // $50/yr (recommended); see also the monthly scenario in tests
    // Model B (cold-capable): DB in R2, no volume. 3 GB blobs + ~1 GB DB ≈ 4 GB R2.
    inputs: { storageGbTypical: 4, activeHoursPerMonth: 60, warm: false }
  },
  family: {
    priceUsd: 15,
    period: 'month',
    inputs: {
      storageGbTypical: 30,
      activeHoursPerMonth: 120,
      warm: false,
      hotDbGb: 1,
      volume: 'fly'
    }
  },
  team: {
    priceUsd: 96, // 8 seats × $12
    period: 'month',
    inputs: { storageGbTypical: 95, activeHoursPerMonth: 0, warm: true, hotDbGb: 5, volume: 'fly' }
  },
  community: {
    // Flat, NOT per-member (exploration 0359). A community host pays for the
    // operations we run — dedicated-project isolation, two warm units for the
    // 2000-connection ceiling, 99.9 SLA — and grows their membership for free.
    // Per-member pricing would rent them their own audience (Charter §6).
    priceUsd: 99,
    period: 'month',
    inputs: {
      storageGbTypical: 150,
      activeHoursPerMonth: 0,
      warm: true,
      warmUnits: 2,
      hotDbGb: 10,
      volume: 'fly'
    }
  },
  enterprise: {
    priceUsd: 2000,
    period: 'month',
    inputs: {
      storageGbTypical: 200,
      activeHoursPerMonth: 0,
      warm: true,
      warmUnits: 4,
      hotDbGb: 50,
      volume: 'fly',
      ssoScim: true
    }
  }
}
