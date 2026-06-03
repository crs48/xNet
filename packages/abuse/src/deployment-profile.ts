/**
 * Deployment profiles for deterministic abuse mitigation defaults.
 */

import type { CloudReviewCallPolicy } from './classifier-cascade'
import type { HubPolicyBudgetHint, HubPolicyModerationSettings } from './hub-policy-offer'
import type { PublicWriteBudgetPolicy } from './public-write-budget'
import type { QueryCostBudgetPolicy } from './query-cost-budget'

// ─── Types ─────────────────────────────────────────────────

export type AbuseDeploymentProfileKind = 'small-self-hosted-hub'

export type AbuseDeploymentProfileInput = {
  hubId?: string
  windowMs?: number
}

export type AbuseDeploymentProfile = {
  id: string
  kind: AbuseDeploymentProfileKind
  title: string
  moderation: Pick<
    HubPolicyModerationSettings,
    | 'mode'
    | 'requireSignedWrites'
    | 'rejectUnsignedFederation'
    | 'quarantineFirstContact'
    | 'allowLocalOverride'
    | 'publishLabelExplanations'
    | 'aiReview'
  >
  cloudReview: CloudReviewCallPolicy
  publicWriteBudget: PublicWriteBudgetPolicy
  queryCostBudget: QueryCostBudgetPolicy
  budgetHints: readonly HubPolicyBudgetHint[]
}

// ─── Public API ────────────────────────────────────────────

const DEFAULT_WINDOW_MS = 60_000

export function createSmallSelfHostedAbuseProfile(
  input: AbuseDeploymentProfileInput = {}
): AbuseDeploymentProfile {
  const windowMs = input.windowMs ?? DEFAULT_WINDOW_MS
  const publicWriteBudget: PublicWriteBudgetPolicy = {
    defaultCostUnits: 1,
    limits: [
      { scope: 'did', unitsPerWindow: 12, windowMs },
      { scope: 'did-surface', unitsPerWindow: 4, windowMs },
      { scope: 'workspace', unitsPerWindow: 120, windowMs },
      { scope: 'hub', unitsPerWindow: 360, windowMs },
      { scope: 'surface', unitsPerWindow: 180, windowMs }
    ]
  }
  const queryCostBudget: QueryCostBudgetPolicy = {
    defaultCostUnits: 1,
    limits: [
      { scope: 'domain-work-type', unitsPerWindow: 18, windowMs },
      { scope: 'remote-peer-route', unitsPerWindow: 24, windowMs },
      { scope: 'hub-work-type', unitsPerWindow: 240, windowMs },
      { scope: 'work-type', unitsPerWindow: 480, windowMs }
    ]
  }

  return {
    id: input.hubId
      ? `xnet.abuse.profile.small-self-hosted.v1:${input.hubId}`
      : 'xnet.abuse.profile.small-self-hosted.v1',
    kind: 'small-self-hosted-hub',
    title: 'Small self-hosted hub abuse profile',
    moderation: {
      mode: 'local-deterministic',
      requireSignedWrites: true,
      rejectUnsignedFederation: true,
      quarantineFirstContact: true,
      allowLocalOverride: true,
      publishLabelExplanations: true,
      aiReview: {
        localModelsEnabled: true,
        cloudModelsEnabled: false,
        rawContentToCloudAllowed: false,
        defaultReviewQueue: 'safety'
      }
    },
    cloudReview: { enabled: false },
    publicWriteBudget,
    queryCostBudget,
    budgetHints: [
      ...publicWriteBudget.limits.map((limit) => ({
        name: `small-self-hosted:${limit.scope}`,
        workType: 'public-write' as const,
        scope: limit.scope,
        unitsPerWindow: limit.unitsPerWindow,
        windowMs: limit.windowMs
      })),
      ...queryCostBudget.limits.flatMap((limit) =>
        budgetHintWorkTypes(limit.scope).map((workType) => ({
          name: `small-self-hosted:${limit.scope}:${workType}`,
          workType,
          scope: limit.scope,
          unitsPerWindow: limit.unitsPerWindow,
          windowMs: limit.windowMs
        }))
      )
    ]
  }
}

// ─── Helpers ───────────────────────────────────────────────

function budgetHintWorkTypes(
  scope: QueryCostBudgetPolicy['limits'][number]['scope']
): readonly HubPolicyBudgetHint['workType'][] {
  if (scope.includes('domain')) return ['crawl']
  if (scope.includes('remote-peer') || scope.includes('route')) return ['federation-query']
  return ['crawl', 'federation-query']
}
