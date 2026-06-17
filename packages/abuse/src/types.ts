/**
 * @xnetjs/abuse - Shared abuse decision types.
 */

// ─── Core Surfaces ───────────────────────────────────────────────────────────

export type AbuseSurface =
  | 'transport'
  | 'remoteMutation'
  | 'commentThread'
  | 'messageInbox'
  | 'searchIndex'
  | 'feed'
  | 'crawl'
  | 'localApi'
  // Connector sync writes (exploration 0196): a connector materializing an
  // external service into nodes runs on its own budget, separate from the
  // agent-initiated `localApi` writes, so a bulk backfill never starves the
  // interactive agent's budget (and vice versa).
  | 'connector'

export type PolicyScope = 'user' | 'workspace' | 'community' | 'hub' | 'appView' | 'protocol'

export type AbuseAdmission = 'accept' | 'reject' | 'quarantine'
export type AbuseVisibility = 'show' | 'warn' | 'blur' | 'hide'
export type AbuseReach = 'normal' | 'demote' | 'exclude'
export type AbuseResource = 'normal' | 'throttle' | 'block-peer' | 'require-budget'
export type AbuseSeverity = 'low' | 'medium' | 'high' | 'critical'
export type AbuseReviewQueue = 'safety' | 'quality' | 'appeal' | 'operator'

export type AbuseReasonCode =
  | 'accepted'
  | 'blocked-by-policy'
  | 'budget-required'
  | 'failed-admission'
  | 'first-contact'
  | 'invalid-doc-binding'
  | 'invalid-freshness'
  | 'invalid-hash'
  | 'invalid-signature'
  | 'low-confidence-quality-signal'
  | 'over-rate-limit'
  | 'over-size-limit'
  | 'peer-score-block'
  | 'peer-score-throttle'
  | 'quality-risk'
  | 'trusted-abuse-label'
  | 'trusted-warning-label'
  | 'unauthorized'
  | 'unsigned-update'
  | 'policy-override'
  | 'user-override'

// ─── Fact Model ──────────────────────────────────────────────────────────────

export type AbuseLabel = {
  id?: string
  value: string
  sourceDID?: string
  sourceWeight: number
  confidence: number
  expiresAt?: number
  evidenceRefs?: readonly string[]
  negates?: string
}

export type AbuseCryptoFacts = {
  hashValid: boolean
  signatureValid: boolean
  authorized: boolean
  freshnessValid: boolean
  docBindingValid: boolean
}

export type AbuseResourceFacts = {
  overSizeLimit: boolean
  overRateLimit: boolean
  estimatedCost: number
  budgetRemaining: number | null
}

export type AbuseActorFacts = {
  did?: string
  peerId?: string
  firstContact: boolean
  peerScore: number
  localBlocked: boolean
  workspaceBlocked: boolean
  hubBlocked: boolean
  appViewBlocked: boolean
}

export type AbuseQualitySignals = {
  duplicateScore: number
  slopScore: number
  citationCoverage: number
  provenanceScore: number
}

export type AbusePolicyFacts = {
  peerScoreBlockThreshold: number
  peerScoreThrottleThreshold: number
  abuseLabelHideThreshold: number
  abuseLabelWarnThreshold: number
  qualityReviewThreshold: number
  qualityWarnThreshold: number
  quarantineFirstContact: boolean
}

export type AbuseDecisionOverrideScope = 'user' | 'workspace' | 'reviewer'

export type AbuseDecisionOverride = Partial<
  Pick<AbuseDecision, 'visibility' | 'reach' | 'notify' | 'includeInCounters' | 'includeInSearch'>
> & {
  scope?: AbuseDecisionOverrideScope
  sourceDID?: string
  reason?: string
}

export type AbuseFacts = {
  surface: AbuseSurface
  crypto?: Partial<AbuseCryptoFacts>
  resource?: Partial<AbuseResourceFacts>
  actor?: Partial<AbuseActorFacts>
  labels?: readonly AbuseLabel[]
  quality?: Partial<AbuseQualitySignals>
  policy?: Partial<AbusePolicyFacts>
  override?: AbuseDecisionOverride
  now?: number
}

export type NormalizedAbuseFacts = {
  surface: AbuseSurface
  crypto: AbuseCryptoFacts
  resource: AbuseResourceFacts
  actor: AbuseActorFacts
  labels: readonly AbuseLabel[]
  quality: AbuseQualitySignals
  policy: AbusePolicyFacts
  override?: AbuseDecisionOverride
  now: number
}

// ─── Decision Model ──────────────────────────────────────────────────────────

export type PendingLabel = {
  value: string
  confidence: number
  reason: AbuseReasonCode
  evidenceRefs: readonly string[]
}

export type PendingSecurityEvent = {
  eventName: string
  severity: AbuseSeverity
  reason: AbuseReasonCode
}

export type AbuseReviewDecision =
  | { required: false }
  | { required: true; queue: AbuseReviewQueue; priority: number }

export type AbuseDecision = {
  admission: AbuseAdmission
  visibility: AbuseVisibility
  reach: AbuseReach
  resource: AbuseResource
  notify: boolean
  includeInCounters: boolean
  includeInSearch: boolean
  review: AbuseReviewDecision
  reasons: readonly AbuseReasonCode[]
  evidenceRefs: readonly string[]
  labelsToEmit: readonly PendingLabel[]
  telemetry: readonly PendingSecurityEvent[]
}

export type DecisionExplanationReason = {
  code: AbuseReasonCode
  severity: AbuseSeverity
  message: string
}

export type DecisionExplanation = {
  summary: string
  reasons: readonly DecisionExplanationReason[]
}
