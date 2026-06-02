/**
 * Pure abuse decision helpers.
 */

import type {
  AbuseDecision,
  AbuseFacts,
  AbuseLabel,
  AbuseReasonCode,
  AbuseReviewDecision,
  AbuseReviewQueue,
  NormalizedAbuseFacts,
  PendingSecurityEvent
} from './types'

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CRYPTO = {
  hashValid: true,
  signatureValid: true,
  authorized: true,
  freshnessValid: true,
  docBindingValid: true
} as const

const DEFAULT_RESOURCE = {
  overSizeLimit: false,
  overRateLimit: false,
  estimatedCost: 0,
  budgetRemaining: null
} as const

const DEFAULT_ACTOR = {
  firstContact: false,
  peerScore: 100,
  localBlocked: false,
  workspaceBlocked: false,
  hubBlocked: false
} as const

const DEFAULT_QUALITY = {
  duplicateScore: 0,
  slopScore: 0,
  citationCoverage: 1,
  provenanceScore: 1
} as const

const DEFAULT_POLICY = {
  peerScoreBlockThreshold: 10,
  peerScoreThrottleThreshold: 30,
  abuseLabelHideThreshold: 1.5,
  abuseLabelWarnThreshold: 0.5,
  qualityReviewThreshold: 0.65,
  qualityWarnThreshold: 0.35,
  quarantineFirstContact: true
} as const

const ABUSE_LABELS = ['malware', 'scam', 'spam', 'impersonation', 'harassment'] as const
const WARNING_LABELS = ['inaccurate', 'slop', 'unsupported', 'stale', 'synthetic'] as const

// ─── Public API ──────────────────────────────────────────────────────────────

export function normalizeAbuseFacts(facts: AbuseFacts): NormalizedAbuseFacts {
  return {
    surface: facts.surface,
    crypto: { ...DEFAULT_CRYPTO, ...facts.crypto },
    resource: { ...DEFAULT_RESOURCE, ...facts.resource },
    actor: { ...DEFAULT_ACTOR, ...facts.actor },
    labels: facts.labels ?? [],
    quality: { ...DEFAULT_QUALITY, ...facts.quality },
    policy: { ...DEFAULT_POLICY, ...facts.policy },
    override: facts.override,
    now: facts.now ?? Date.now()
  }
}

export function decideTransport(facts: Omit<AbuseFacts, 'surface'> = {}): AbuseDecision {
  return decideAbuse({ ...facts, surface: 'transport' })
}

export function decideRemoteMutation(facts: Omit<AbuseFacts, 'surface'> = {}): AbuseDecision {
  return decideAbuse({ ...facts, surface: 'remoteMutation' })
}

export function decidePublicInteraction(
  facts: Omit<AbuseFacts, 'surface'> & { surface?: 'commentThread' | 'messageInbox' } = {}
): AbuseDecision {
  return decideAbuse({ ...facts, surface: facts.surface ?? 'commentThread' })
}

export function decideReach(
  facts: Omit<AbuseFacts, 'surface'> & { surface?: 'searchIndex' | 'feed' } = {}
): AbuseDecision {
  return decideAbuse({ ...facts, surface: facts.surface ?? 'searchIndex' })
}

export function decideAbuse(input: AbuseFacts): AbuseDecision {
  const facts = normalizeAbuseFacts(input)

  const hardDecision = decideHardAdmission(facts)
  if (hardDecision) {
    return hardDecision
  }

  const labelDecision = decideByLabels(facts)
  if (labelDecision) {
    return applySafeOverride(labelDecision, facts)
  }

  const resourceDecision = decideByResource(facts)
  if (resourceDecision) {
    return applySafeOverride(resourceDecision, facts)
  }

  const firstContactDecision = decideByFirstContact(facts)
  if (firstContactDecision) {
    return applySafeOverride(firstContactDecision, facts)
  }

  const qualityDecision = decideByQuality(facts)
  if (qualityDecision) {
    return applySafeOverride(qualityDecision, facts)
  }

  return applySafeOverride(
    createDecision({
      reasons: ['accepted']
    }),
    facts
  )
}

// ─── Decision Branches ───────────────────────────────────────────────────────

function decideHardAdmission(facts: NormalizedAbuseFacts): AbuseDecision | null {
  if (facts.resource.overSizeLimit) {
    return createDecision({
      admission: 'reject',
      visibility: 'hide',
      reach: 'exclude',
      notify: false,
      includeInCounters: false,
      includeInSearch: false,
      reasons: ['over-size-limit'],
      telemetry: [securityEvent('xnet.security.invalid_data', 'high', 'over-size-limit')]
    })
  }

  const invalidCryptoReasons = getInvalidCryptoReasons(facts)
  if (invalidCryptoReasons.length > 0) {
    return createDecision({
      admission: 'reject',
      visibility: 'hide',
      reach: 'exclude',
      resource:
        facts.actor.peerScore <= facts.policy.peerScoreBlockThreshold ? 'block-peer' : 'normal',
      reasons: ['failed-admission', ...invalidCryptoReasons],
      telemetry: invalidCryptoReasons.map((reason) =>
        securityEvent(
          reason === 'invalid-signature'
            ? 'xnet.security.invalid_signature'
            : 'xnet.security.invalid_data',
          'high',
          reason
        )
      )
    })
  }

  if (isBlockedByPolicy(facts)) {
    return createDecision({
      admission: isMutationSurface(facts) ? 'reject' : 'accept',
      visibility: 'hide',
      reach: 'exclude',
      notify: false,
      includeInCounters: false,
      includeInSearch: false,
      reasons: ['blocked-by-policy']
    })
  }

  if (facts.actor.peerScore <= facts.policy.peerScoreBlockThreshold) {
    return createDecision({
      admission: isMutationSurface(facts) ? 'reject' : 'quarantine',
      visibility: 'hide',
      reach: 'exclude',
      resource: 'block-peer',
      notify: false,
      includeInCounters: false,
      includeInSearch: false,
      reasons: ['peer-score-block'],
      telemetry: [securityEvent('xnet.security.peer_blocked', 'high', 'peer-score-block')]
    })
  }

  return null
}

function decideByLabels(facts: NormalizedAbuseFacts): AbuseDecision | null {
  const abuseScore = weightedLabelScore(facts, ABUSE_LABELS)
  if (abuseScore >= facts.policy.abuseLabelHideThreshold) {
    return createDecision({
      admission: isMutationSurface(facts) ? 'reject' : 'accept',
      visibility: 'hide',
      reach: 'exclude',
      notify: false,
      includeInCounters: false,
      includeInSearch: false,
      review: review('safety', 80),
      reasons: ['trusted-abuse-label']
    })
  }

  const warningScore = weightedLabelScore(facts, WARNING_LABELS)
  if (
    abuseScore >= facts.policy.abuseLabelWarnThreshold ||
    warningScore >= facts.policy.abuseLabelWarnThreshold
  ) {
    return createDecision({
      visibility: 'warn',
      reach: 'demote',
      includeInCounters: abuseScore === 0,
      includeInSearch: false,
      reasons: ['trusted-warning-label']
    })
  }

  return null
}

function decideByResource(facts: NormalizedAbuseFacts): AbuseDecision | null {
  if (facts.resource.overRateLimit) {
    return createDecision({
      admission: isMutationSurface(facts) ? 'reject' : 'quarantine',
      visibility: 'warn',
      reach: 'demote',
      resource: 'throttle',
      notify: false,
      includeInCounters: false,
      includeInSearch: false,
      reasons: ['over-rate-limit'],
      telemetry: [securityEvent('xnet.security.rate_limit_exceeded', 'medium', 'over-rate-limit')]
    })
  }

  if (
    facts.resource.budgetRemaining !== null &&
    facts.resource.estimatedCost > facts.resource.budgetRemaining
  ) {
    return createDecision({
      admission: 'quarantine',
      visibility: 'warn',
      reach: 'exclude',
      resource: 'require-budget',
      notify: false,
      includeInCounters: false,
      includeInSearch: false,
      review: review('operator', 60),
      reasons: ['budget-required']
    })
  }

  if (facts.actor.peerScore <= facts.policy.peerScoreThrottleThreshold) {
    return createDecision({
      admission: isMutationSurface(facts) ? 'reject' : 'quarantine',
      visibility: 'warn',
      reach: 'demote',
      resource: 'throttle',
      notify: false,
      includeInCounters: false,
      includeInSearch: false,
      reasons: ['peer-score-throttle']
    })
  }

  return null
}

function decideByFirstContact(facts: NormalizedAbuseFacts): AbuseDecision | null {
  if (!facts.policy.quarantineFirstContact || !facts.actor.firstContact) {
    return null
  }

  if (facts.surface !== 'commentThread' && facts.surface !== 'messageInbox') {
    return null
  }

  return createDecision({
    admission: 'quarantine',
    visibility: 'warn',
    reach: 'demote',
    notify: false,
    includeInCounters: false,
    includeInSearch: false,
    review: review('safety', 50),
    reasons: ['first-contact']
  })
}

function decideByQuality(facts: NormalizedAbuseFacts): AbuseDecision | null {
  const score = qualityRiskScore(facts)

  if (score >= facts.policy.qualityReviewThreshold) {
    return createDecision({
      admission: facts.surface === 'remoteMutation' ? 'accept' : 'quarantine',
      visibility: 'warn',
      reach: 'demote',
      includeInCounters: false,
      includeInSearch: false,
      review: review('quality', Math.round(score * 100)),
      reasons: ['quality-risk']
    })
  }

  if (score >= facts.policy.qualityWarnThreshold) {
    return createDecision({
      visibility: 'warn',
      reach: 'demote',
      includeInSearch: false,
      reasons: ['low-confidence-quality-signal']
    })
  }

  return null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function activeLabels(facts: NormalizedAbuseFacts): readonly AbuseLabel[] {
  return facts.labels.filter(
    (label) => label.expiresAt === undefined || label.expiresAt > facts.now
  )
}

export function weightedLabelScore(facts: NormalizedAbuseFacts, values: readonly string[]): number {
  return activeLabels(facts)
    .filter((label) => values.includes(label.value))
    .reduce((score, label) => score + label.confidence * label.sourceWeight, 0)
}

export function qualityRiskScore(facts: NormalizedAbuseFacts): number {
  return clamp01(
    facts.quality.slopScore * 0.4 +
      facts.quality.duplicateScore * 0.25 +
      (1 - facts.quality.citationCoverage) * 0.2 +
      (1 - facts.quality.provenanceScore) * 0.15
  )
}

function getInvalidCryptoReasons(facts: NormalizedAbuseFacts): AbuseReasonCode[] {
  return [
    facts.crypto.hashValid ? null : 'invalid-hash',
    facts.crypto.signatureValid ? null : 'invalid-signature',
    facts.crypto.freshnessValid ? null : 'invalid-freshness',
    facts.crypto.docBindingValid ? null : 'invalid-doc-binding',
    facts.crypto.authorized ? null : 'unauthorized'
  ].filter((reason): reason is AbuseReasonCode => reason !== null)
}

function isBlockedByPolicy(facts: NormalizedAbuseFacts): boolean {
  return facts.actor.localBlocked || facts.actor.workspaceBlocked || facts.actor.hubBlocked
}

function isMutationSurface(facts: NormalizedAbuseFacts): boolean {
  return facts.surface === 'remoteMutation' || facts.surface === 'localApi'
}

function applySafeOverride(decision: AbuseDecision, facts: NormalizedAbuseFacts): AbuseDecision {
  if (!facts.override || decision.admission === 'reject') {
    return decision
  }

  return {
    ...decision,
    visibility: facts.override.visibility ?? decision.visibility,
    reach: facts.override.reach ?? decision.reach,
    notify: facts.override.notify ?? decision.notify,
    includeInCounters: facts.override.includeInCounters ?? decision.includeInCounters,
    includeInSearch: facts.override.includeInSearch ?? decision.includeInSearch,
    reasons: appendReason(decision.reasons, 'user-override'),
    evidenceRefs: facts.override.reason
      ? [...decision.evidenceRefs, facts.override.reason]
      : decision.evidenceRefs
  }
}

function createDecision(
  input: Partial<AbuseDecision> & { reasons: readonly AbuseReasonCode[] }
): AbuseDecision {
  return {
    admission: input.admission ?? 'accept',
    visibility: input.visibility ?? 'show',
    reach: input.reach ?? 'normal',
    resource: input.resource ?? 'normal',
    notify: input.notify ?? true,
    includeInCounters: input.includeInCounters ?? true,
    includeInSearch: input.includeInSearch ?? true,
    review: input.review ?? { required: false },
    reasons: dedupeReasons(input.reasons),
    evidenceRefs: input.evidenceRefs ?? [],
    labelsToEmit: input.labelsToEmit ?? [],
    telemetry: input.telemetry ?? []
  }
}

function review(queue: AbuseReviewQueue, priority: number): AbuseReviewDecision {
  return { required: true, queue, priority }
}

function securityEvent(
  eventName: string,
  severity: PendingSecurityEvent['severity'],
  reason: AbuseReasonCode
): PendingSecurityEvent {
  return { eventName, severity, reason }
}

function appendReason(
  reasons: readonly AbuseReasonCode[],
  reason: AbuseReasonCode
): readonly AbuseReasonCode[] {
  return dedupeReasons([...reasons, reason])
}

function dedupeReasons(reasons: readonly AbuseReasonCode[]): readonly AbuseReasonCode[] {
  return [...new Set(reasons)]
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function shouldThrottle(decision: AbuseDecision): boolean {
  return decision.resource === 'throttle' || decision.resource === 'block-peer'
}

export function isVisible(decision: AbuseDecision): boolean {
  return (
    decision.visibility === 'show' ||
    decision.visibility === 'warn' ||
    decision.visibility === 'blur'
  )
}

export function isRejected(decision: AbuseDecision): boolean {
  return decision.admission === 'reject'
}
