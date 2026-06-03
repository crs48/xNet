/**
 * Human-readable explanations for deterministic abuse decisions.
 */

import type {
  AbuseDecision,
  AbuseReasonCode,
  AbuseSeverity,
  DecisionExplanation,
  DecisionExplanationReason
} from './types'

type ReasonDetail = {
  severity: AbuseSeverity
  message: string
}

const REASON_DETAILS: Record<AbuseReasonCode, ReasonDetail> = {
  accepted: {
    severity: 'low',
    message: 'No abuse or quality policy required a restriction.'
  },
  'blocked-by-policy': {
    severity: 'high',
    message: 'A user, workspace, hub, or app-view policy block matched this actor or subject.'
  },
  'budget-required': {
    severity: 'medium',
    message: 'The request exceeded the configured resource budget for this surface.'
  },
  'failed-admission': {
    severity: 'critical',
    message: 'The input failed one or more hard admission checks.'
  },
  'first-contact': {
    severity: 'medium',
    message: 'First-contact interactions are quarantined by policy.'
  },
  'invalid-doc-binding': {
    severity: 'high',
    message: 'The envelope was not bound to the expected document or resource.'
  },
  'invalid-freshness': {
    severity: 'high',
    message: 'The envelope freshness or replay window check failed.'
  },
  'invalid-hash': {
    severity: 'critical',
    message: 'The content hash did not match the signed payload.'
  },
  'invalid-signature': {
    severity: 'critical',
    message: 'The signature did not verify against the claimed author.'
  },
  'low-confidence-quality-signal': {
    severity: 'low',
    message: 'Quality signals suggest caution but not review.'
  },
  'over-rate-limit': {
    severity: 'medium',
    message: 'The actor or peer exceeded the configured rate limit.'
  },
  'over-size-limit': {
    severity: 'high',
    message: 'The payload exceeded the configured size limit.'
  },
  'peer-score-block': {
    severity: 'high',
    message: 'The peer score crossed the block threshold.'
  },
  'peer-score-throttle': {
    severity: 'medium',
    message: 'The peer score crossed the throttle threshold.'
  },
  'quality-risk': {
    severity: 'medium',
    message: 'Quality signals crossed the review threshold.'
  },
  'trusted-abuse-label': {
    severity: 'high',
    message: 'Trusted labels indicate abuse such as spam, scam, malware, or impersonation.'
  },
  'trusted-warning-label': {
    severity: 'medium',
    message: 'Trusted labels indicate a warning or demotion is appropriate.'
  },
  unauthorized: {
    severity: 'critical',
    message: 'The claimed actor is not authorized to perform this action.'
  },
  'unsigned-update': {
    severity: 'high',
    message: 'The remote mutation was unsigned on a surface that requires signed replication.'
  },
  'policy-override': {
    severity: 'low',
    message: 'A workspace or reviewer policy override changed the display or reach decision.'
  },
  'user-override': {
    severity: 'low',
    message: 'A local override changed the display or reach decision.'
  }
}

export function explainDecision(decision: AbuseDecision): DecisionExplanation {
  const reasons = decision.reasons.map(toExplanationReason)
  return {
    summary: summarizeDecision(decision),
    reasons
  }
}

export function getReasonDetail(code: AbuseReasonCode): DecisionExplanationReason {
  return toExplanationReason(code)
}

function summarizeDecision(decision: AbuseDecision): string {
  if (decision.admission === 'reject') {
    return 'Rejected before acceptance or mutation.'
  }
  if (decision.admission === 'quarantine') {
    return 'Accepted into quarantine pending review or budget.'
  }
  if (decision.visibility === 'hide') {
    return 'Accepted but hidden by policy.'
  }
  if (decision.visibility === 'warn' || decision.reach === 'demote') {
    return 'Accepted with warning or reduced reach.'
  }
  return 'Accepted normally.'
}

function toExplanationReason(code: AbuseReasonCode): DecisionExplanationReason {
  const detail = REASON_DETAILS[code]
  return {
    code,
    severity: detail.severity,
    message: detail.message
  }
}
