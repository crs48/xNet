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
  classifyWithCloudAdapter,
  createCloudClassifierAdapter,
  createCloudClassifierRequestBase,
  estimateCloudClassifierCost,
  getCloudClassificationSkipReason,
  redactCloudClassifierText
} from './cloud-classifier'
export {
  extractCitationReferences,
  extractKnowledgeClaims,
  scoreClaimCitationCoverage
} from './citation-coverage'
export {
  assessDuplicateContent,
  canonicalizeContentText,
  compareContentFingerprints,
  compareSimHash64,
  createContentFingerprint,
  tokenizeContent
} from './content-fingerprint'
export {
  classifyWithLocalAdapters,
  createKeywordLocalClassifier,
  createLocalClassificationResult,
  mergeLocalClassificationResults
} from './local-classifier'
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
export {
  bucketAbusePeerScore,
  createRemoteMutationRejectionTelemetry,
  hashAbusePeerIdentifier,
  reportRemoteMutationRejection
} from './telemetry'
export type {
  ContentFingerprint,
  ContentFingerprintInput,
  ContentFingerprintOptions,
  DuplicateContentAssessment,
  DuplicateContentOptions
} from './content-fingerprint'
export type {
  KeywordClassifierRule,
  KeywordLocalClassifierOptions,
  LocalClassificationResult,
  LocalClassifierAdapter,
  LocalClassifierInput,
  LocalClassifierOptions,
  LocalClassifierProvenance,
  LocalClassifierSignal
} from './local-classifier'
export type {
  CloudClassificationOptions,
  CloudClassificationResult,
  CloudClassificationSkipReason,
  CloudClassificationUsage,
  CloudClassifierAdapter,
  CloudClassifierBudgetPolicy,
  CloudClassifierInput,
  CloudClassifierPrivacyPolicy,
  CloudClassifierProvenance,
  CloudClassifierProviderResult,
  CloudClassifierProviderSignal,
  CloudClassifierRequest,
  CloudClassifierSignal,
  CloudPrivacyMode
} from './cloud-classifier'
export type {
  CitationKind,
  CitationReference,
  ClaimCitationCoverageAssessment,
  ClaimCitationCoverageInput,
  ClaimCitationCoverageOptions,
  ExtractedClaim
} from './citation-coverage'
export type {
  AbuseAdapterResult,
  AbuseDecisionFunction,
  AbuseFactAdapter,
  RemoteAdmissionPipeline,
  RemoteAdmissionPipelineOptions,
  RemoteAdmissionResult
} from './adapters'
export type {
  AbusePeerScoreBucket,
  AbuseTelemetryReporter,
  RemoteMutationRejectionTelemetry,
  RemoteMutationRejectionTelemetryInput
} from './telemetry'
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
