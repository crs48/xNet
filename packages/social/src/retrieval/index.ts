/**
 * Agent-facing retrieval boundary for imported social data (exploration 0419).
 */

export {
  createSocialRetrievalScope,
  filterSocialRetrievalCandidates,
  isSocialNodeRetrievable,
  socialRetrievalDecision,
  DEFAULT_SOCIAL_RETRIEVAL_SCHEMA_IDS,
  EXCLUDED_SOCIAL_PRIVACY_CLASSES,
  SENSITIVE_SOCIAL_INTERACTION_KINDS,
  SENSITIVE_SOCIAL_RETRIEVAL_SCHEMA_IDS,
  SOCIAL_RETRIEVAL_SCOPE,
  type SocialRetrievalCandidate,
  type SocialRetrievalDecision,
  type SocialRetrievalScope,
  type SocialRetrievalScopeOptions
} from './scope'

export {
  createDefaultSocialContextPacks,
  createSensitiveSocialContextPack,
  type SocialContextPackDefinition,
  type SocialContextPackId,
  type SocialContextPackOptions,
  type SocialContextPackSeed
} from './context-packs'
