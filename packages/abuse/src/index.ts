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
export {
  createAbuseDecisionAdapter,
  createAbuseFactAdapter,
  createRemoteAdmissionPipeline,
  decideWithAdapter
} from './adapters'
export { explainDecision, getReasonDetail } from './explain'
export { TRUSTED_SPAM_LABEL, WARNING_SLOP_LABEL, abuseFixtures, createBaseFacts } from './fixtures'
export {
  activePolicyBlockEntries,
  canonicalizePolicyBlockList,
  createPolicyBlockList,
  findPolicyBlockEntry,
  isSignedPolicyBlockList,
  policyBlockListSigningBytes,
  signPolicyBlockList,
  unsignedPolicyBlockList,
  verifySignedPolicyBlockList
} from './policy-blocks'
export type {
  AbuseAdapterResult,
  AbuseDecisionFunction,
  AbuseFactAdapter,
  RemoteAdmissionPipeline,
  RemoteAdmissionPipelineOptions,
  RemoteAdmissionResult
} from './adapters'
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
export type {
  PolicyBlockAction,
  PolicyBlockEntry,
  PolicyBlockListSignature,
  PolicyBlockListVerificationResult,
  PolicyBlockScope,
  PolicyBlockSubjectType,
  SignedPolicyBlockList,
  UnsignedPolicyBlockList
} from './policy-blocks'
