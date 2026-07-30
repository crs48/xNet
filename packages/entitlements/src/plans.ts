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
  /**
   * Billed seats (Stripe `SubscriptionItem.quantity`).
   *
   * **`0` means the plan is not seat-metered** — it is billed flat, and the
   * people it serves are unlimited and uncounted. Use {@link isSeatMetered} to
   * branch rather than testing the number.
   *
   * A seat is a *collaborator we provision capacity for*, never an *audience
   * member the customer brought*. The `community` plan is deliberately flat:
   * billing a host per member would charge them for access to their own
   * audience, which is ground rent under Charter §6 (it fails the improvement
   * test — the margin would ride on a relationship we did not build). Price
   * community hosting on the operations it actually consumes — storage,
   * concurrency, AI — and let membership grow for free (exploration 0359).
   */
  seats: number
  /** Whether the managed AI gateway is enabled for this tenant. */
  aiEnabled: boolean
  /**
   * Marked-up AI spend (USD) included each month before metered overage begins.
   * Surfaced on the dashboard and mirrored by the Stripe metered Price's first
   * (free) tier. `0` = no included AI. See exploration 0200.
   */
  includedAiUsd: number
  /**
   * Hard monthly AI budget (USD), inclusive of `includedAiUsd`. The metered
   * gateway stops issuing provider calls once accrued spend reaches this — the
   * surprise-bill guard promised on the pricing page. `0` = AI off.
   */
  aiMonthlyBudgetUsd: number
  /**
   * Which managed-AI models (OpenRouter `provider/model` ids) this plan may pick.
   * `'all'` = the whole gated catalog; an array gates to those ids; `undefined`
   * defaults to `'all'` for backward compatibility. Cheaper plans get a cheaper
   * subset so a small included allotment can't be spent in one frontier call
   * (exploration 0208). Enforced at the `/ai/chat` route, not just the client.
   */
  aiModels?: 'all' | readonly string[]
  /** The model preselected in the picker for this plan (an OpenRouter id). */
  aiDefaultModel?: string
  /** ISO region the tenant's data is pinned to (enterprise residency); undefined = unpinned. */
  residency?: string
  sla: SlaLevel
}

/**
 * Curated managed-AI model tiers (OpenRouter ids). `cheap` keeps a small plan's
 * included allotment from evaporating in one call; `standard` adds the mid/strong
 * models; bigger plans get the whole catalog (`'all'`). `openrouter/auto` lets a
 * user defer the choice to OpenRouter's best-value router.
 */
export const CHEAP_AI_MODELS: readonly string[] = [
  'openrouter/auto',
  'anthropic/claude-haiku-4.5',
  'openai/gpt-4o-mini',
  'google/gemini-2.5-flash'
]

export const STANDARD_AI_MODELS: readonly string[] = [
  ...CHEAP_AI_MODELS,
  'anthropic/claude-sonnet-4.6',
  'openai/gpt-4o',
  'google/gemini-2.5-pro'
]

/** Is `model` permitted by an `aiModels` policy? `'all'`/`undefined` ⇒ any model. */
export function aiModelAllowed(policy: PlanEntitlements['aiModels'], model: string): boolean {
  if (policy === undefined || policy === 'all') return true
  return policy.includes(model)
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
    includedAiUsd: 0,
    aiMonthlyBudgetUsd: 0,
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
    includedAiUsd: 2,
    aiMonthlyBudgetUsd: 25,
    aiModels: CHEAP_AI_MODELS,
    aiDefaultModel: 'anthropic/claude-haiku-4.5',
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
    includedAiUsd: 5,
    aiMonthlyBudgetUsd: 60,
    aiModels: STANDARD_AI_MODELS,
    aiDefaultModel: 'anthropic/claude-sonnet-4.6',
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
    includedAiUsd: 8,
    aiMonthlyBudgetUsd: 200,
    aiModels: 'all',
    aiDefaultModel: 'anthropic/claude-sonnet-4.6',
    sla: 'best-effort'
  },
  community: {
    plan: 'community',
    isolation: 'dedicated-project',
    quotaBytes: 500 * GiB,
    maxBlobBytes: 250 * MiB,
    maxConnections: 2000,
    // Flat-billed: members are not seats (see `seats` above, exploration 0359).
    seats: 0,
    aiEnabled: true,
    includedAiUsd: 10,
    aiMonthlyBudgetUsd: 300,
    aiModels: 'all',
    aiDefaultModel: 'anthropic/claude-sonnet-4.6',
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
    includedAiUsd: 15,
    aiMonthlyBudgetUsd: 500,
    aiModels: 'all',
    aiDefaultModel: 'anthropic/claude-sonnet-4.6',
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
    includedAiUsd: 25,
    aiMonthlyBudgetUsd: 2000,
    aiModels: 'all',
    aiDefaultModel: 'anthropic/claude-opus-4.8',
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

/**
 * Whether this plan bills by seat at all. Flat plans (`seats === 0`) serve an
 * unlimited, uncounted membership — see the `seats` field docs.
 */
export function isSeatMetered(entitlements: PlanEntitlements): boolean {
  return entitlements.seats > 0
}

/**
 * Change the billed seat count — flows to Stripe `SubscriptionItem.quantity`.
 *
 * Refuses on a flat plan: adding a seat count to `community` would quietly
 * reintroduce the per-member meter Charter §6 refuses. Move the tenant to a
 * seat-metered plan first if that is genuinely what is wanted.
 */
export function withSeats(entitlements: PlanEntitlements, seats: number): PlanEntitlements {
  if (!isSeatMetered(entitlements)) {
    throw new Error(
      `Plan '${entitlements.plan}' is flat-billed (members are not seats); refusing to set seats`
    )
  }
  if (!Number.isInteger(seats) || seats < 1) {
    throw new Error(`Invalid seats: ${seats}`)
  }
  return { ...entitlements, seats }
}

/**
 * Set the included AI spend and hard monthly budget — an in-place entitlement
 * flip, no migration. The cap must be >= the included amount (the included
 * portion is the free first tier of the same budget).
 */
export function withAiBudget(
  entitlements: PlanEntitlements,
  includedAiUsd: number,
  aiMonthlyBudgetUsd: number
): PlanEntitlements {
  if (!Number.isFinite(includedAiUsd) || includedAiUsd < 0) {
    throw new Error(`Invalid includedAiUsd: ${includedAiUsd}`)
  }
  if (!Number.isFinite(aiMonthlyBudgetUsd) || aiMonthlyBudgetUsd < includedAiUsd) {
    throw new Error(`aiMonthlyBudgetUsd must be >= includedAiUsd, got ${aiMonthlyBudgetUsd}`)
  }
  return { ...entitlements, includedAiUsd, aiMonthlyBudgetUsd, aiEnabled: aiMonthlyBudgetUsd > 0 }
}

/**
 * Set the managed-AI model policy and (optional) default model — an in-place
 * entitlement flip, no migration. The default, when given, must be permitted by
 * the policy so the picker never preselects a model the route will reject.
 */
export function withAiModels(
  entitlements: PlanEntitlements,
  aiModels: 'all' | readonly string[],
  aiDefaultModel?: string
): PlanEntitlements {
  if (aiDefaultModel !== undefined && !aiModelAllowed(aiModels, aiDefaultModel)) {
    throw new Error(`aiDefaultModel ${aiDefaultModel} is not permitted by the model policy`)
  }
  return {
    ...entitlements,
    aiModels,
    ...(aiDefaultModel !== undefined ? { aiDefaultModel } : {})
  }
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
