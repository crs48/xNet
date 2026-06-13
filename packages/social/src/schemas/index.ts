/**
 * @xnetjs/social - Canonical social graph schemas.
 */

import { SocialActorSchema, SocialIdentityClaimSchema } from './actor'
import { SocialCollectionItemSchema, SocialCollectionSchema } from './collection'
import { SocialContentSchema } from './content'
import { SocialConversationSchema, SocialMessageSchema } from './conversation'
import { SocialEnrichmentSchema } from './enrichment'
import {
  SocialImportArchiveSchema,
  SocialImportJobSchema,
  SocialImportRunSchema,
  SocialSourceRecordSchema
} from './import'
import { SocialInteractionSchema } from './interaction'
import {
  ConnectableProfileSchema,
  ConnectionIntentSchema,
  ConnectionWaveSchema
} from '../connect/schemas'

export {
  SOCIAL_NAMESPACE,
  actorKinds,
  collectionKinds,
  contentKinds,
  conversationKinds,
  identityClaimKinds,
  importJobPhases,
  importJobStatuses,
  importRunStatuses,
  interactionKinds,
  messageKinds,
  privacyClasses,
  socialPlatforms,
  sourceRecordKinds,
  visibilityOptions,
  enrichmentSources,
  enrichmentStatuses,
  type SocialActorKind,
  type SocialCollectionKind,
  type SocialContentKind,
  type SocialConversationKind,
  type SocialEnrichmentSource,
  type SocialEnrichmentStatus,
  type SocialIdentityClaimKind,
  type SocialImportJobPhase,
  type SocialImportJobStatus,
  type SocialImportRunStatus,
  type SocialInteractionKind,
  type SocialMessageKind,
  type SocialPlatform,
  type SocialPrivacyClass,
  type SocialSourceRecordKind,
  type SocialVisibility
} from './constants'

export {
  SocialImportArchiveSchema,
  SocialImportJobSchema,
  SocialImportRunSchema,
  SocialSourceRecordSchema,
  type SocialImportArchive,
  type SocialImportJob,
  type SocialImportRun,
  type SocialSourceRecord
} from './import'
export {
  SocialActorSchema,
  SocialIdentityClaimSchema,
  type SocialActor,
  type SocialIdentityClaim
} from './actor'
export { SocialContentSchema, type SocialContent } from './content'
export {
  SocialEnrichmentSchema,
  createSocialEnrichmentId,
  type SocialEnrichment
} from './enrichment'
export { SocialInteractionSchema, type SocialInteraction } from './interaction'
export {
  SocialConversationSchema,
  SocialMessageSchema,
  type SocialConversation,
  type SocialMessage
} from './conversation'
export {
  SocialCollectionItemSchema,
  SocialCollectionSchema,
  type SocialCollection,
  type SocialCollectionItem
} from './collection'

export const socialSchemas = [
  SocialImportArchiveSchema,
  SocialImportRunSchema,
  SocialImportJobSchema,
  SocialSourceRecordSchema,
  SocialActorSchema,
  SocialIdentityClaimSchema,
  SocialContentSchema,
  SocialEnrichmentSchema,
  SocialInteractionSchema,
  SocialConversationSchema,
  SocialMessageSchema,
  SocialCollectionSchema,
  SocialCollectionItemSchema,
  ConnectableProfileSchema,
  ConnectionIntentSchema,
  ConnectionWaveSchema
] as const
