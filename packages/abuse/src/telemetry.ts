/**
 * Privacy-preserving telemetry helpers for abuse decisions.
 */

import type {
  AbuseDecision,
  AbuseFacts,
  AbuseReasonCode,
  AbuseSeverity,
  AbuseSurface
} from './types'
import { hashBase64 } from '@xnetjs/crypto'
import { normalizeAbuseFacts, shouldThrottle } from './decision'

// ─── Types ──────────────────────────────────────────────────────────────────

export type AbusePeerScoreBucket =
  | 'unknown'
  | '<=10'
  | '11-30'
  | '31-50'
  | '51-80'
  | '81-100'
  | '>100'

export type AbuseTelemetryReporter = {
  reportSecurityEvent(
    eventName: string,
    severity: AbuseSeverity,
    details?: Record<string, unknown>
  ): unknown
  reportUsage?(metricName: string, value: number): unknown
}

export type RemoteMutationRejectionTelemetry = {
  eventName: string
  severity: AbuseSeverity
  details: {
    actionTaken: 'remote_mutation_rejected'
    surface: AbuseSurface
    primaryReason: AbuseReasonCode
    reasons: readonly AbuseReasonCode[]
    peerHash: string
    peerScoreBucket: AbusePeerScoreBucket
    resourceAction: AbuseDecision['resource']
    shouldThrottle: boolean
  }
}

export type RemoteMutationRejectionTelemetryInput = {
  facts: AbuseFacts
  decision: AbuseDecision
  eventName?: string
  peerHashSalt?: string
}

// ─── Public API ─────────────────────────────────────────────────────────────

const DEFAULT_REMOTE_MUTATION_REJECTION_EVENT = 'xnet.security.remote_mutation_rejected'
const DEFAULT_PEER_HASH_SALT = 'xnet.abuse.telemetry.peer.v1'

const SEVERITY_RANK: Record<AbuseSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3
}

export function bucketAbusePeerScore(score: number | null | undefined): AbusePeerScoreBucket {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'unknown'
  if (score <= 10) return '<=10'
  if (score <= 30) return '11-30'
  if (score <= 50) return '31-50'
  if (score <= 80) return '51-80'
  if (score <= 100) return '81-100'
  return '>100'
}

export function hashAbusePeerIdentifier(
  peerId: string | null | undefined,
  salt = DEFAULT_PEER_HASH_SALT
): string {
  const normalized = peerId?.trim()
  if (!normalized) return 'unknown'

  const input = new TextEncoder().encode(`${salt}:${normalized}`)
  return `p_${hashBase64(input, 'blake3').slice(0, 16)}`
}

export function createRemoteMutationRejectionTelemetry(
  input: RemoteMutationRejectionTelemetryInput
): RemoteMutationRejectionTelemetry | null {
  if (input.decision.admission !== 'reject') return null

  const facts = normalizeAbuseFacts(input.facts)
  const reasons = input.decision.reasons.filter(
    (reason) => reason !== 'accepted'
  ) as readonly AbuseReasonCode[]
  const primaryReason = reasons[0] ?? 'failed-admission'
  const peerIdentity = facts.actor.peerId ?? facts.actor.did

  return {
    eventName: input.eventName ?? DEFAULT_REMOTE_MUTATION_REJECTION_EVENT,
    severity: rejectionSeverity(input.decision),
    details: {
      actionTaken: 'remote_mutation_rejected',
      surface: facts.surface,
      primaryReason,
      reasons,
      peerHash: hashAbusePeerIdentifier(peerIdentity, input.peerHashSalt),
      peerScoreBucket: bucketAbusePeerScore(facts.actor.peerScore),
      resourceAction: input.decision.resource,
      shouldThrottle: shouldThrottle(input.decision)
    }
  }
}

export function reportRemoteMutationRejection(
  telemetry: AbuseTelemetryReporter | undefined,
  input: RemoteMutationRejectionTelemetryInput
): boolean {
  if (!telemetry) return false

  const event = createRemoteMutationRejectionTelemetry(input)
  if (!event) return false

  telemetry.reportSecurityEvent(event.eventName, event.severity, event.details)
  telemetry.reportUsage?.('xnet.security.remote_mutation_rejections', 1)
  return true
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rejectionSeverity(decision: AbuseDecision): AbuseSeverity {
  const explicit = decision.telemetry.map((event) => event.severity)
  if (explicit.length > 0) {
    return explicit.reduce((highest, severity) =>
      SEVERITY_RANK[severity] > SEVERITY_RANK[highest] ? severity : highest
    )
  }

  if (
    decision.reasons.some((reason) =>
      [
        'blocked-by-policy',
        'invalid-doc-binding',
        'invalid-signature',
        'peer-score-block',
        'unsigned-update',
        'unauthorized'
      ].includes(reason)
    )
  ) {
    return 'high'
  }

  if (
    decision.reasons.some((reason) =>
      ['over-rate-limit', 'over-size-limit', 'peer-score-throttle'].includes(reason)
    )
  ) {
    return 'medium'
  }

  return 'low'
}
