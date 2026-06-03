/**
 * Crawl and federation query cost budget accounting.
 */

import type { AbuseResource } from './types'

// ─── Types ─────────────────────────────────────────────────

export type QueryCostBudgetWorkType = 'crawl' | 'federation-query'

export type QueryCostBudgetScope =
  | 'actor'
  | 'hub'
  | 'workspace'
  | 'remote-peer'
  | 'domain'
  | 'route'
  | 'work-type'
  | 'hub-work-type'
  | 'domain-work-type'
  | 'remote-peer-route'

export type QueryCostBudgetLimit = {
  scope: QueryCostBudgetScope
  unitsPerWindow: number
  windowMs: number
}

export type QueryCostBudgetPolicy = {
  limits: readonly QueryCostBudgetLimit[]
  defaultCostUnits?: number
}

export type QueryCostBudgetInput = {
  workType: QueryCostBudgetWorkType
  actorDID?: string
  hubId?: string
  workspaceId?: string
  remotePeerId?: string
  domain?: string
  route?: string
  costUnits?: number
  now?: number
}

export type QueryCostBudgetUsage = {
  key: string
  scope: QueryCostBudgetScope
  usedUnits: number
  resetAt: number
}

export type QueryCostBudgetCharge = {
  key: string
  scope: QueryCostBudgetScope
  costUnits: number
  usedUnits: number
  limitUnits: number
  resetAt: number
}

export type QueryCostBudgetDecision = {
  allowed: boolean
  resource: AbuseResource
  reasons: string[]
  charges: QueryCostBudgetCharge[]
  nextUsage: QueryCostBudgetUsage[]
}

// ─── Public API ────────────────────────────────────────────

export function evaluateQueryCostBudget(
  input: QueryCostBudgetInput,
  policy: QueryCostBudgetPolicy,
  usage: readonly QueryCostBudgetUsage[] = []
): QueryCostBudgetDecision {
  const now = input.now ?? Date.now()
  const costUnits = Math.max(0, input.costUnits ?? policy.defaultCostUnits ?? 1)
  const activeUsage = usage.filter((entry) => entry.resetAt > now)
  const charges = policy.limits.flatMap(
    (limit) => createQueryCostBudgetCharge(input, limit, activeUsage, costUnits, now) ?? []
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
    nextUsage: mergeQueryCostBudgetCharges(activeUsage, charges, costUnits)
  }
}

export function createQueryCostBudgetKey(
  input: Pick<
    QueryCostBudgetInput,
    'actorDID' | 'hubId' | 'workspaceId' | 'remotePeerId' | 'domain' | 'route' | 'workType'
  >,
  scope: QueryCostBudgetScope
): string | null {
  const domain = normalizeDomain(input.domain)
  const route = normalizeRoute(input.route)

  if (scope === 'actor') return input.actorDID ? `actor:${input.actorDID}` : null
  if (scope === 'hub') return input.hubId ? `hub:${input.hubId}` : null
  if (scope === 'workspace') return input.workspaceId ? `workspace:${input.workspaceId}` : null
  if (scope === 'remote-peer') {
    return input.remotePeerId ? `remote-peer:${input.remotePeerId}` : null
  }
  if (scope === 'domain') return domain ? `domain:${domain}` : null
  if (scope === 'route') return route ? `route:${route}` : null
  if (scope === 'work-type') return `work-type:${input.workType}`
  if (scope === 'hub-work-type') {
    return input.hubId ? `hub:${input.hubId}:work-type:${input.workType}` : null
  }
  if (scope === 'domain-work-type') {
    return domain ? `domain:${domain}:work-type:${input.workType}` : null
  }
  return input.remotePeerId && route ? `remote-peer:${input.remotePeerId}:route:${route}` : null
}

// ─── Helpers ───────────────────────────────────────────────

function createQueryCostBudgetCharge(
  input: QueryCostBudgetInput,
  limit: QueryCostBudgetLimit,
  usage: readonly QueryCostBudgetUsage[],
  costUnits: number,
  now: number
): QueryCostBudgetCharge | null {
  const key = createQueryCostBudgetKey(input, limit.scope)
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

function mergeQueryCostBudgetCharges(
  usage: readonly QueryCostBudgetUsage[],
  charges: readonly QueryCostBudgetCharge[],
  costUnits: number
): QueryCostBudgetUsage[] {
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

function normalizeDomain(domain: string | undefined): string | null {
  const normalized = domain
    ?.trim()
    .toLowerCase()
    .replace(/^www\./, '')
  return normalized && normalized.length > 0 ? normalized : null
}

function normalizeRoute(route: string | undefined): string | null {
  const normalized = route?.trim().replace(/\s+/g, '-').toLowerCase()
  return normalized && normalized.length > 0 ? normalized : null
}
