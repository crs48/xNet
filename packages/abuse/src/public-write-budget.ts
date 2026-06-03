/**
 * Public write budget accounting for local-first and federated surfaces.
 */

import type { AbuseResource, AbuseSurface } from './types'

// ─── Types ─────────────────────────────────────────────────

export type PublicWriteBudgetScope =
  | 'did'
  | 'hub'
  | 'workspace'
  | 'surface'
  | 'did-surface'
  | 'hub-surface'
  | 'workspace-surface'

export type PublicWriteBudgetLimit = {
  scope: PublicWriteBudgetScope
  unitsPerWindow: number
  windowMs: number
}

export type PublicWriteBudgetPolicy = {
  limits: readonly PublicWriteBudgetLimit[]
  defaultCostUnits?: number
}

export type PublicWriteBudgetInput = {
  did?: string
  hubId?: string
  workspaceId?: string
  surface: AbuseSurface
  costUnits?: number
  now?: number
}

export type PublicWriteBudgetUsage = {
  key: string
  scope: PublicWriteBudgetScope
  usedUnits: number
  resetAt: number
}

export type PublicWriteBudgetCharge = {
  key: string
  scope: PublicWriteBudgetScope
  costUnits: number
  usedUnits: number
  limitUnits: number
  resetAt: number
}

export type PublicWriteBudgetDecision = {
  allowed: boolean
  resource: AbuseResource
  reasons: string[]
  charges: PublicWriteBudgetCharge[]
  nextUsage: PublicWriteBudgetUsage[]
}

// ─── Public API ────────────────────────────────────────────

export function evaluatePublicWriteBudget(
  input: PublicWriteBudgetInput,
  policy: PublicWriteBudgetPolicy,
  usage: readonly PublicWriteBudgetUsage[] = []
): PublicWriteBudgetDecision {
  const now = input.now ?? Date.now()
  const costUnits = Math.max(0, input.costUnits ?? policy.defaultCostUnits ?? 1)
  const activeUsage = usage.filter((entry) => entry.resetAt > now)
  const charges = policy.limits.flatMap(
    (limit) => createPublicWriteBudgetCharge(input, limit, activeUsage, costUnits, now) ?? []
  )
  const exceeded = charges.filter((charge) => charge.usedUnits + costUnits > charge.limitUnits)

  if (exceeded.length > 0) {
    return {
      allowed: false,
      resource: 'require-budget',
      reasons: exceeded.map((charge) => `budget:${charge.scope}:exceeded`),
      charges,
      nextUsage: activeUsage
    }
  }

  return {
    allowed: true,
    resource: 'normal',
    reasons: ['budget:accepted'],
    charges,
    nextUsage: mergePublicWriteBudgetCharges(activeUsage, charges, costUnits)
  }
}

export function createPublicWriteBudgetKey(
  input: Pick<PublicWriteBudgetInput, 'did' | 'hubId' | 'workspaceId' | 'surface'>,
  scope: PublicWriteBudgetScope
): string | null {
  if (scope === 'did') return input.did ? `did:${input.did}` : null
  if (scope === 'hub') return input.hubId ? `hub:${input.hubId}` : null
  if (scope === 'workspace') {
    return input.workspaceId ? `workspace:${input.workspaceId}` : null
  }
  if (scope === 'surface') return `surface:${input.surface}`
  if (scope === 'did-surface') {
    return input.did ? `did:${input.did}:surface:${input.surface}` : null
  }
  if (scope === 'hub-surface') {
    return input.hubId ? `hub:${input.hubId}:surface:${input.surface}` : null
  }
  return input.workspaceId ? `workspace:${input.workspaceId}:surface:${input.surface}` : null
}

// ─── Helpers ───────────────────────────────────────────────

function createPublicWriteBudgetCharge(
  input: PublicWriteBudgetInput,
  limit: PublicWriteBudgetLimit,
  usage: readonly PublicWriteBudgetUsage[],
  costUnits: number,
  now: number
): PublicWriteBudgetCharge | null {
  const key = createPublicWriteBudgetKey(input, limit.scope)
  if (!key) return null

  const existing = usage.find((entry) => entry.key === key && entry.scope === limit.scope)
  return {
    key,
    scope: limit.scope,
    costUnits,
    usedUnits: existing?.usedUnits ?? 0,
    limitUnits: limit.unitsPerWindow,
    resetAt: existing?.resetAt ?? now + limit.windowMs
  }
}

function mergePublicWriteBudgetCharges(
  usage: readonly PublicWriteBudgetUsage[],
  charges: readonly PublicWriteBudgetCharge[],
  costUnits: number
): PublicWriteBudgetUsage[] {
  const chargedKeys = new Set(charges.map((charge) => `${charge.scope}:${charge.key}`))
  return [
    ...usage.filter((entry) => !chargedKeys.has(`${entry.scope}:${entry.key}`)),
    ...charges.map((charge) => ({
      key: charge.key,
      scope: charge.scope,
      usedUnits: charge.usedUnits + costUnits,
      resetAt: charge.resetAt
    }))
  ].sort(
    (left, right) => left.key.localeCompare(right.key) || left.scope.localeCompare(right.scope)
  )
}
