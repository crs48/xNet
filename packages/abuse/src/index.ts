/**
 * @xnetjs/abuse - Composable abuse and moderation decisions for xNet.
 */

export {
  activeLabels,
  decideAbuse,
  decidePublicInteraction,
  decideReach,
  decideRemoteMutation,
  decideTransport,
  isRejected,
  isVisible,
  normalizeAbuseFacts,
  qualityRiskScore,
  shouldThrottle,
  weightedLabelScore
} from './decision'
export { explainDecision, getReasonDetail } from './explain'
export { TRUSTED_SPAM_LABEL, WARNING_SLOP_LABEL, abuseFixtures, createBaseFacts } from './fixtures'
export type {
  AbuseActorFacts,
  AbuseAdmission,
  AbuseCryptoFacts,
  AbuseDecision,
  AbuseDecisionOverride,
  AbuseFacts,
  AbuseLabel,
  AbuseQualitySignals,
  AbuseReasonCode,
  AbuseResource,
  AbuseResourceFacts,
  AbuseReviewDecision,
  AbuseReviewQueue,
  AbuseSeverity,
  AbuseSurface,
  AbuseVisibility,
  DecisionExplanation,
  DecisionExplanationReason,
  NormalizedAbuseFacts,
  PendingLabel,
  PendingSecurityEvent,
  PolicyScope
} from './types'
