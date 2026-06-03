/**
 * Deployment profiles for deterministic abuse mitigation defaults.
 */

import type { CloudReviewCallPolicy } from './classifier-cascade'
import type { HubPolicyBudgetHint, HubPolicyModerationSettings } from './hub-policy-offer'
import type { PublicWriteBudgetPolicy } from './public-write-budget'
import type { QueryCostBudgetPolicy } from './query-cost-budget'

// ─── Types ─────────────────────────────────────────────────

export type AbuseDeploymentProfileKind = 'small-self-hosted-hub' | 'public-search-hub'

export type AbuseDeploymentProfileInput = {
  hubId?: string
  windowMs?: number
  cloudReviewDailyMicroUsd?: number
  moderationReviewUnitsPerWindow?: number
  searchIndexUnitsPerWindow?: number
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
const DEFAULT_DAY_MS = 86_400_000

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
    budgetHints: createDeploymentBudgetHints(
      'small-self-hosted',
      publicWriteBudget,
      queryCostBudget
    )
  }
}

export function createPublicSearchHubAbuseProfile(
  input: AbuseDeploymentProfileInput = {}
): AbuseDeploymentProfile {
  const windowMs = input.windowMs ?? 3_600_000
  const cloudReviewDailyMicroUsd = input.cloudReviewDailyMicroUsd ?? 250_000
  const moderationReviewUnitsPerWindow = input.moderationReviewUnitsPerWindow ?? 600
  const searchIndexUnitsPerWindow = input.searchIndexUnitsPerWindow ?? 10_000
  const publicWriteBudget: PublicWriteBudgetPolicy = {
    defaultCostUnits: 1,
    limits: [
      { scope: 'did', unitsPerWindow: 60, windowMs },
      { scope: 'did-surface', unitsPerWindow: 20, windowMs },
      { scope: 'workspace', unitsPerWindow: 1_000, windowMs },
      { scope: 'hub', unitsPerWindow: 20_000, windowMs },
      { scope: 'surface', unitsPerWindow: 5_000, windowMs }
    ]
  }
  const queryCostBudget: QueryCostBudgetPolicy = {
    defaultCostUnits: 1,
    limits: [
      { scope: 'domain-work-type', unitsPerWindow: 120, windowMs },
      { scope: 'remote-peer-route', unitsPerWindow: 300, windowMs },
      { scope: 'hub-work-type', unitsPerWindow: 5_000, windowMs },
      { scope: 'work-type', unitsPerWindow: 10_000, windowMs }
    ]
  }

  return {
    id: input.hubId
      ? `xnet.abuse.profile.public-search.v1:${input.hubId}`
      : 'xnet.abuse.profile.public-search.v1',
    kind: 'public-search-hub',
    title: 'Public search hub abuse profile',
    moderation: {
      mode: 'hybrid',
      requireSignedWrites: true,
      rejectUnsignedFederation: true,
      quarantineFirstContact: true,
      allowLocalOverride: true,
      publishLabelExplanations: true,
      aiReview: {
        localModelsEnabled: true,
        cloudModelsEnabled: true,
        rawContentToCloudAllowed: false,
        maxCloudReviewMicroUsdPerDay: cloudReviewDailyMicroUsd,
        defaultReviewQueue: 'quality'
      }
    },
    cloudReview: {
      enabled: true,
      allowedSurfaces: ['crawl', 'searchIndex'],
      minLocalLabelConfidence: 0.7,
      minLocalQualityRisk: 0.55
    },
    publicWriteBudget,
    queryCostBudget,
    budgetHints: [
      ...createDeploymentBudgetHints('public-search', publicWriteBudget, queryCostBudget),
      {
        name: 'public-search:search-index:domain',
        workType: 'search-index',
        scope: 'domain',
        unitsPerWindow: searchIndexUnitsPerWindow,
        windowMs
      },
      {
        name: 'public-search:search-index:hub',
        workType: 'search-index',
        scope: 'hub',
        unitsPerWindow: searchIndexUnitsPerWindow * 10,
        windowMs
      },
      {
        name: 'public-search:moderation-review:safety',
        workType: 'moderation-review',
        scope: 'review-queue:safety',
        unitsPerWindow: moderationReviewUnitsPerWindow,
        windowMs
      },
      {
        name: 'public-search:cloud-review:daily',
        workType: 'cloud-review',
        scope: 'hub',
        unitsPerWindow: cloudReviewDailyMicroUsd,
        windowMs: DEFAULT_DAY_MS
      }
    ]
  }
}

// ─── Helpers ───────────────────────────────────────────────

function createDeploymentBudgetHints(
  prefix: string,
  publicWriteBudget: PublicWriteBudgetPolicy,
  queryCostBudget: QueryCostBudgetPolicy
): readonly HubPolicyBudgetHint[] {
  return [
    ...publicWriteBudget.limits.map((limit) => ({
      name: `${prefix}:${limit.scope}`,
      workType: 'public-write' as const,
      scope: limit.scope,
      unitsPerWindow: limit.unitsPerWindow,
      windowMs: limit.windowMs
    })),
    ...queryCostBudget.limits.flatMap((limit) =>
      budgetHintWorkTypes(limit.scope).map((workType) => ({
        name: `${prefix}:${limit.scope}:${workType}`,
        workType,
        scope: limit.scope,
        unitsPerWindow: limit.unitsPerWindow,
        windowMs: limit.windowMs
      }))
    )
  ]
}

function budgetHintWorkTypes(
  scope: QueryCostBudgetPolicy['limits'][number]['scope']
): readonly HubPolicyBudgetHint['workType'][] {
  if (scope.includes('domain')) return ['crawl']
  if (scope.includes('remote-peer') || scope.includes('route')) return ['federation-query']
  return ['crawl', 'federation-query']
}
