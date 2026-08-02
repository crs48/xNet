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
  /**
   * Storage quota **per user**, in bytes (maps to hub `defaultQuota`).
   *
   * Despite the plan-level name this is enforced per DID by the hub's node
   * relay, so one member of a shared hub cannot eat the whole thing. It is NOT
   * the number we bill against — see {@link tenantQuotaBytes}.
   */
  quotaBytes: number
  /**
   * Aggregate storage ceiling for the WHOLE tenant, in bytes — the number a
   * storage add-on is billed against (exploration 0435).
   *
   * Distinct from {@link quotaBytes}, which is per user. On a 5-seat plan the
   * per-user quota multiplies by seat count, so billing a per-tenant pack
   * against it would provision five times what was sold. The hub enforces both:
   * per-user keeps one member from starving the others, and this keeps the
   * tenant inside what they bought.
   *
   * **Absent means unlimited**, not zero — the same fail-open rule as
   * {@link writesEnabled}, and for the same reason: a token signed before this
   * field existed must keep working, and the failure mode of the alternative is
   * freezing every hub in the fleet the moment it ships.
   */
  tenantQuotaBytes?: number
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
  /**
   * Whether the hub accepts writes. **Always `true` in the plan catalog** — this
   * is not a plan feature, it is the lever the non-payment lifecycle pulls
   * (exploration 0418): a tenant whose grace window lapses is flipped to
   * `false`, its hub rejects mutations with `507 billing_read_only`, and every
   * byte stays readable and exportable until payment recovers.
   *
   * Two invariants make this safe to add to a signed wire contract:
   *
   *  - **Absent means enabled.** `verifyEntitlements` normalizes a missing field
   *    to `true`, so a token signed before this field existed keeps working. Only
   *    an explicit `false` blocks writes — the field fails open, deliberately,
   *    because the failure mode of the alternative is bricking every hub on a
   *    rollout.
   *  - **Self-host never sees `false`.** With no `HUB_PLAN` the hub keeps its own
   *    `DEFAULT_CONFIG` and this field is never consulted, so the control plane
   *    cannot reach into a hub it does not host (the anti-lock-in invariant from
   *    exploration 0174).
   */
  writesEnabled: boolean
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
    // Aggregate = per-user quota x seats: the capacity this plan was always
    // modeled to allow, now stated instead of implied (exploration 0435).
    tenantQuotaBytes: 10 * MiB,
    maxBlobBytes: 2 * MiB,
    maxConnections: 50,
    seats: 1,
    aiEnabled: false,
    includedAiUsd: 0,
    aiMonthlyBudgetUsd: 0,
    writesEnabled: true,
    sla: 'none'
  },
  personal: {
    plan: 'personal',
    isolation: 'dedicated-sleep',
    quotaBytes: 25 * GiB,
    tenantQuotaBytes: 25 * GiB,
    maxBlobBytes: 50 * MiB,
    maxConnections: 250,
    seats: 1,
    aiEnabled: true,
    includedAiUsd: 2,
    aiMonthlyBudgetUsd: 25,
    aiModels: CHEAP_AI_MODELS,
    aiDefaultModel: 'anthropic/claude-haiku-4.5',
    writesEnabled: true,
    sla: 'best-effort'
  },
  family: {
    plan: 'family',
    isolation: 'dedicated-sleep',
    quotaBytes: 250 * GiB,
    tenantQuotaBytes: 5 * 250 * GiB,
    maxBlobBytes: 100 * MiB,
    maxConnections: 500,
    seats: 5,
    aiEnabled: true,
    includedAiUsd: 5,
    aiMonthlyBudgetUsd: 60,
    aiModels: STANDARD_AI_MODELS,
    aiDefaultModel: 'anthropic/claude-sonnet-4.6',
    writesEnabled: true,
    sla: 'best-effort'
  },
  team: {
    plan: 'team',
    isolation: 'dedicated-warm',
    quotaBytes: 100 * GiB,
    tenantQuotaBytes: 3 * 100 * GiB,
    maxBlobBytes: 100 * MiB,
    maxConnections: 1000,
    seats: 3,
    aiEnabled: true,
    includedAiUsd: 8,
    aiMonthlyBudgetUsd: 200,
    aiModels: 'all',
    aiDefaultModel: 'anthropic/claude-sonnet-4.6',
    writesEnabled: true,
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
    writesEnabled: true,
    sla: '99.9'
  },
  company: {
    plan: 'company',
    isolation: 'dedicated-project',
    quotaBytes: 1024 * GiB,
    tenantQuotaBytes: 10 * 1024 * GiB,
    maxBlobBytes: 500 * MiB,
    maxConnections: 4000,
    seats: 10,
    aiEnabled: true,
    includedAiUsd: 15,
    aiMonthlyBudgetUsd: 500,
    aiModels: 'all',
    aiDefaultModel: 'anthropic/claude-sonnet-4.6',
    writesEnabled: true,
    sla: '99.9'
  },
  enterprise: {
    plan: 'enterprise',
    isolation: 'region-pinned',
    quotaBytes: 5 * 1024 * GiB,
    tenantQuotaBytes: 25 * 5 * 1024 * GiB,
    maxBlobBytes: 1024 * MiB,
    maxConnections: 10000,
    seats: 25,
    aiEnabled: true,
    includedAiUsd: 25,
    aiMonthlyBudgetUsd: 2000,
    aiModels: 'all',
    aiDefaultModel: 'anthropic/claude-opus-4.8',
    writesEnabled: true,
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

/** Bytes in one GiB — the unit a storage pack is sold in (exploration 0435). */
export const STORAGE_PACK_UNIT_BYTES = GiB

/**
 * Apply a purchased storage add-on of `packGb` GiB — an in-place entitlement
 * flip, no migration (exploration 0435).
 *
 * **Additive over the plan's own base, never an absolute.** The caller passes
 * the pack; this derives the quota. That ordering is what makes a plan change
 * safe: a `personal` tenant with a +500 GiB pack who upgrades to `family` gets
 * `250 + 500 = 750` GiB, not a stale absolute that would silently shrink them.
 * Persisting a resolved `quotaBytes` override instead is a bug generator — see
 * `TenantRecord.storagePackGb`.
 *
 * Both ceilings move together: `quotaBytes` (per user) so a single member can
 * actually use the space on a one-seat plan, and `tenantQuotaBytes` (aggregate)
 * because that is what was billed. A flat-billed plan has no aggregate ceiling
 * to begin with (members are not seats — 0359), so the pack leaves it unset
 * rather than inventing a member-scaled cap the Charter refuses.
 *
 * `packGb: 0` is the identity: it restores the plan's catalog defaults, which
 * is exactly what removing a pack must do.
 */
export function withStoragePack(entitlements: PlanEntitlements, packGb: number): PlanEntitlements {
  if (!Number.isInteger(packGb) || packGb < 0) {
    throw new Error(`Invalid storage pack: ${packGb}`)
  }
  const base = PLAN_CATALOG[entitlements.plan]
  if (!base) throw new Error(`Unknown plan: ${entitlements.plan}`)
  const packBytes = packGb * STORAGE_PACK_UNIT_BYTES
  const next: PlanEntitlements = {
    ...entitlements,
    quotaBytes: base.quotaBytes + packBytes
  }
  // Absent aggregate ceiling means unlimited; adding one here would newly cap a
  // flat plan that has deliberately never had one.
  if (base.tenantQuotaBytes === undefined) {
    delete next.tenantQuotaBytes
    return next
  }
  next.tenantQuotaBytes = base.tenantQuotaBytes + packBytes
  return next
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

/**
 * The availability objective an SLA level commits to, as a fraction, or `null`
 * when the plan publishes no measurable objective.
 *
 * This lives beside {@link PLAN_CATALOG} rather than in the control plane
 * because BOTH planes need it and they must not disagree: the control plane
 * measures error budgets against it, and the provisioner decides always-warm
 * placement from it (exploration 0433 D1). A second copy of this mapping is how
 * a tenant ends up sold an objective its own infrastructure cannot serve.
 */
export function availabilityObjective(sla: SlaLevel): number | null {
  switch (sla) {
    case '99.9':
      return 0.999
    case 'custom':
      return 0.9995
    case 'best-effort':
    case 'none':
    default:
      return null
  }
}

/**
 * Whether a plan must be provisioned always-warm (no scale-to-zero).
 *
 * Two independent reasons to stay warm, and the bug was treating the second as
 * the only one (exploration 0433 D1):
 *
 *  1. **It publishes an availability objective.** You cannot serve 99.9% from a
 *     service that has to cold-start — one cold start can spend a large fraction
 *     of a 43-minute monthly budget. This is the clause that was missing, which
 *     left `community`, `company` and `enterprise` scaling to zero.
 *  2. **Its isolation tier is explicitly `dedicated-warm`.** `team` is
 *     `best-effort`, so it can never burn an error budget — but it is sold as a
 *     warm tier and `PLAN_PRICING` models it with `warm: true`. Dropping it to
 *     scale-to-zero would quietly degrade a paying tier to save COGS the price
 *     already covers.
 *
 * So warmth is a floor built from both, never one replacing the other.
 */
export function requiresWarmInstance(entitlements: PlanEntitlements): boolean {
  if (availabilityObjective(entitlements.sla) !== null) return true
  return entitlements.isolation === 'dedicated-warm'
}
