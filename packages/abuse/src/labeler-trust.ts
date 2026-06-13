/**
 * Labeler trust and subscription limit helpers.
 */

import type { AbuseLabel } from './types'

// ─── Types ─────────────────────────────────────────────────

export type LabelerTrustScope = 'workspace' | 'hub'
export type LabelerTrustLevel = 'blocked' | 'observe' | 'review' | 'trusted'
export type LabelerTrustAction = 'accept' | 'observe' | 'review' | 'reject' | 'ignore'

export type LabelerTrustSetting = {
  scope: LabelerTrustScope
  scopeId: string
  labelerDID: string
  level: LabelerTrustLevel
  weight: number
  minConfidence: number
  allowedLabels?: readonly string[]
  deniedLabels?: readonly string[]
  maxLabelsPerSubject?: number
  expiresAt?: number
}

export type LabelerTrustEvaluationInput = {
  scope: LabelerTrustScope
  scopeId: string
  labelerDID: string
  labelValue: string
  confidence: number
  evidenceRefs?: readonly string[]
  labelExpiresAt?: number
  now?: number
}

export type ReportEscalationInput = Omit<
  LabelerTrustEvaluationInput,
  'labelerDID' | 'evidenceRefs'
> & {
  reporterDID: string
  reportId: string
  evidenceRefs?: readonly string[]
}

export type LabelerTrustDecision = {
  accepted: boolean
  action: LabelerTrustAction
  reasons: readonly string[]
  level: LabelerTrustLevel | 'unconfigured'
  effectiveWeight: number
  minConfidence: number
  setting?: LabelerTrustSetting
}

export type LabelerSubscriptionStatus = 'active' | 'paused' | 'disabled'

export type LabelerSubscription = {
  id: string
  labelerDID: string
  workspaceId?: string
  hubId?: string
  status: LabelerSubscriptionStatus
  createdAt: number
  expiresAt?: number
}

export type LabelerSubscriptionLimitPolicy = {
  maxWorkspaceSubscriptions?: number
  maxHubSubscriptions?: number
  maxWorkspaceSubscriptionsPerLabeler?: number
  maxHubSubscriptionsPerLabeler?: number
}

export type LabelerSubscriptionLimitInput = {
  id: string
  labelerDID: string
  workspaceId?: string
  hubId?: string
  now?: number
}

export type LabelerSubscriptionLimitDecision = {
  allowed: boolean
  reasons: readonly string[]
  activeCounts: {
    workspace: number
    hub: number
    workspaceLabeler: number
    hubLabeler: number
  }
  nextSubscription?: LabelerSubscription
}

export type ReportEscalationDecision = {
  canAffectVisibility: boolean
  trustDecision: LabelerTrustDecision
  trustedLabel: AbuseLabel | null
  evidenceRefs: readonly string[]
}

// ─── Public API ────────────────────────────────────────────

const TRUST_LEVEL_PRIORITY: Record<LabelerTrustLevel, number> = {
  blocked: 4,
  trusted: 3,
  review: 2,
  observe: 1
}

export function evaluateLabelerTrust(
  input: LabelerTrustEvaluationInput,
  settings: readonly LabelerTrustSetting[]
): LabelerTrustDecision {
  const now = input.now ?? Date.now()
  const setting = selectLabelerTrustSetting(input, settings, now)

  if (!setting) {
    return {
      accepted: false,
      action: 'ignore',
      reasons: ['labeler:unconfigured'],
      level: 'unconfigured',
      effectiveWeight: 0,
      minConfidence: 1
    }
  }

  if (setting.level === 'blocked' || includesLabel(setting.deniedLabels, input.labelValue)) {
    return createTrustDecision(setting, 'reject', ['labeler:blocked'])
  }

  if (setting.allowedLabels && !includesLabel(setting.allowedLabels, input.labelValue)) {
    return createTrustDecision(setting, 'ignore', ['labeler:label-not-allowed'])
  }

  if (input.confidence < setting.minConfidence) {
    return createTrustDecision(setting, 'review', ['labeler:confidence-too-low'])
  }

  if (setting.level === 'observe') {
    return createTrustDecision(setting, 'observe', ['labeler:observe-only'])
  }

  if (setting.level === 'review') {
    return createTrustDecision(setting, 'review', ['labeler:review-required'])
  }

  return createTrustDecision(setting, 'accept', ['labeler:trusted'])
}

export function createTrustedLabelFromSetting(
  input: LabelerTrustEvaluationInput,
  settings: readonly LabelerTrustSetting[]
): AbuseLabel | null {
  const decision = evaluateLabelerTrust(input, settings)
  if (!decision.accepted) return null

  return {
    value: input.labelValue,
    sourceDID: input.labelerDID,
    sourceWeight: decision.effectiveWeight,
    confidence: clamp01(input.confidence),
    expiresAt: input.labelExpiresAt,
    evidenceRefs: input.evidenceRefs
  }
}

export function evaluateReportEscalation(
  input: ReportEscalationInput,
  settings: readonly LabelerTrustSetting[]
): ReportEscalationDecision {
  const evidenceRefs = createReportEvidenceRefs(input)
  const trustInput: LabelerTrustEvaluationInput = {
    scope: input.scope,
    scopeId: input.scopeId,
    labelerDID: input.reporterDID,
    labelValue: input.labelValue,
    confidence: input.confidence,
    evidenceRefs,
    labelExpiresAt: input.labelExpiresAt,
    now: input.now
  }
  const trustDecision = evaluateLabelerTrust(trustInput, settings)

  if (!trustDecision.accepted) {
    return {
      canAffectVisibility: false,
      trustDecision,
      trustedLabel: null,
      evidenceRefs
    }
  }

  return {
    canAffectVisibility: true,
    trustDecision,
    trustedLabel: {
      value: input.labelValue,
      sourceDID: input.reporterDID,
      sourceWeight: trustDecision.effectiveWeight,
      confidence: clamp01(input.confidence),
      expiresAt: input.labelExpiresAt,
      evidenceRefs
    },
    evidenceRefs
  }
}

export function createLabelerSubscription(
  input: Omit<LabelerSubscription, 'status' | 'createdAt'> & {
    status?: LabelerSubscriptionStatus
    createdAt?: number
  }
): LabelerSubscription {
  return {
    id: input.id,
    labelerDID: input.labelerDID,
    workspaceId: input.workspaceId,
    hubId: input.hubId,
    status: input.status ?? 'active',
    createdAt: input.createdAt ?? Date.now(),
    expiresAt: input.expiresAt
  }
}

export function evaluateLabelerSubscriptionLimit(
  input: LabelerSubscriptionLimitInput,
  policy: LabelerSubscriptionLimitPolicy,
  subscriptions: readonly LabelerSubscription[] = []
): LabelerSubscriptionLimitDecision {
  const now = input.now ?? Date.now()
  const active = subscriptions.filter(
    (subscription) =>
      subscription.status === 'active' &&
      subscription.id !== input.id &&
      (subscription.expiresAt === undefined || subscription.expiresAt > now)
  )
  const activeCounts = {
    workspace: countSubscriptions(active, { workspaceId: input.workspaceId }),
    hub: countSubscriptions(active, { hubId: input.hubId }),
    workspaceLabeler: countSubscriptions(active, {
      workspaceId: input.workspaceId,
      labelerDID: input.labelerDID
    }),
    hubLabeler: countSubscriptions(active, {
      hubId: input.hubId,
      labelerDID: input.labelerDID
    })
  }
  const reasons = [
    exceeds(policy.maxWorkspaceSubscriptions, activeCounts.workspace)
      ? 'labeler-subscription:workspace-limit-exceeded'
      : null,
    exceeds(policy.maxHubSubscriptions, activeCounts.hub)
      ? 'labeler-subscription:hub-limit-exceeded'
      : null,
    exceeds(policy.maxWorkspaceSubscriptionsPerLabeler, activeCounts.workspaceLabeler)
      ? 'labeler-subscription:workspace-labeler-limit-exceeded'
      : null,
    exceeds(policy.maxHubSubscriptionsPerLabeler, activeCounts.hubLabeler)
      ? 'labeler-subscription:hub-labeler-limit-exceeded'
      : null
  ].filter((reason): reason is string => reason !== null)

  return {
    allowed: reasons.length === 0,
    reasons: reasons.length > 0 ? reasons : ['labeler-subscription:accepted'],
    activeCounts,
    nextSubscription:
      reasons.length === 0
        ? createLabelerSubscription({
            id: input.id,
            labelerDID: input.labelerDID,
            workspaceId: input.workspaceId,
            hubId: input.hubId,
            createdAt: now
          })
        : undefined
  }
}

/**
 * A persisted policy subscription, normalized to the fields the runtime trust
 * setting needs. The app maps a `PolicySubscription` node onto this shape so
 * this adapter stays decoupled from the data schema.
 */
export type PolicySubscriptionTrustInput = {
  labelerDID: string
  /** Persisted policy scope (user/workspace/community/hub/…). */
  scope?: string
  /** Trust weight in [0, 1] (the schema's `trust`). */
  trust: number
  enabled?: boolean
  minConfidence?: number
  allowedLabels?: readonly string[]
  deniedLabels?: readonly string[]
  maxLabelsPerSubject?: number
  expiresAt?: number
}

/** Map a persisted subscription's trust weight to a coarse trust level. */
function trustLevelFromWeight(weight: number, enabled: boolean): LabelerTrustLevel {
  if (!enabled || weight <= 0) return 'blocked'
  if (weight >= 0.75) return 'trusted'
  if (weight >= 0.4) return 'review'
  return 'observe'
}

/** Only `hub` maps to the hub runtime scope; everything else is workspace-local. */
function runtimeScope(scope: string | undefined): LabelerTrustScope {
  return scope === 'hub' ? 'hub' : 'workspace'
}

/**
 * Project a persisted policy subscription onto a runtime `LabelerTrustSetting`
 * — the seam between stored subscriptions and `evaluateLabelerTrust`. Disabled
 * or zero-trust subscriptions become `blocked` so they reject rather than
 * silently accept.
 */
export function subscriptionToTrustSetting(
  sub: PolicySubscriptionTrustInput,
  scopeId: string
): LabelerTrustSetting {
  const enabled = sub.enabled !== false
  const weight = clamp01(sub.trust)
  return {
    scope: runtimeScope(sub.scope),
    scopeId,
    labelerDID: sub.labelerDID,
    level: trustLevelFromWeight(weight, enabled),
    weight,
    minConfidence: sub.minConfidence ?? 0.5,
    allowedLabels: sub.allowedLabels,
    deniedLabels: sub.deniedLabels,
    maxLabelsPerSubject: sub.maxLabelsPerSubject,
    expiresAt: sub.expiresAt
  }
}

/**
 * Project many subscriptions, dropping ones that are expired at `now`. Disabled
 * subscriptions are kept (mapped to `blocked`) so they explicitly suppress a
 * labeler rather than falling through to `unconfigured`.
 */
export function subscriptionsToTrustSettings(
  subs: readonly PolicySubscriptionTrustInput[],
  scopeId: string,
  now = Date.now()
): LabelerTrustSetting[] {
  return subs
    .filter((sub) => sub.expiresAt === undefined || sub.expiresAt > now)
    .map((sub) => subscriptionToTrustSetting(sub, scopeId))
}

// ─── Helpers ───────────────────────────────────────────────

function selectLabelerTrustSetting(
  input: Pick<LabelerTrustEvaluationInput, 'scope' | 'scopeId' | 'labelerDID'>,
  settings: readonly LabelerTrustSetting[],
  now: number
): LabelerTrustSetting | null {
  return (
    settings
      .filter(
        (setting) =>
          setting.scope === input.scope &&
          setting.scopeId === input.scopeId &&
          setting.labelerDID === input.labelerDID &&
          (setting.expiresAt === undefined || setting.expiresAt > now)
      )
      .sort(
        (left, right) =>
          TRUST_LEVEL_PRIORITY[right.level] - TRUST_LEVEL_PRIORITY[left.level] ||
          right.weight - left.weight
      )[0] ?? null
  )
}

function createTrustDecision(
  setting: LabelerTrustSetting,
  action: LabelerTrustAction,
  reasons: readonly string[]
): LabelerTrustDecision {
  return {
    accepted: action === 'accept',
    action,
    reasons,
    level: setting.level,
    effectiveWeight: action === 'accept' ? clamp01(setting.weight) : 0,
    minConfidence: setting.minConfidence,
    setting
  }
}

function includesLabel(labels: readonly string[] | undefined, label: string): boolean {
  return Boolean(labels?.includes(label))
}

function createReportEvidenceRefs(input: ReportEscalationInput): readonly string[] {
  return [`abuse-report:${input.reportId}`, ...(input.evidenceRefs ?? [])]
}

function countSubscriptions(
  subscriptions: readonly LabelerSubscription[],
  filter: {
    workspaceId?: string
    hubId?: string
    labelerDID?: string
  }
): number {
  if (!filter.workspaceId && !filter.hubId) return 0

  return subscriptions.filter(
    (subscription) =>
      (filter.workspaceId === undefined || subscription.workspaceId === filter.workspaceId) &&
      (filter.hubId === undefined || subscription.hubId === filter.hubId) &&
      (filter.labelerDID === undefined || subscription.labelerDID === filter.labelerDID)
  ).length
}

function exceeds(limit: number | undefined, currentCount: number): boolean {
  return typeof limit === 'number' && currentCount >= limit
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}
