/**
 * @xnetjs/social/publish — projecting affinity edges into the ATmosphere
 * (exploration 0420).
 *
 * Publishing an imported social graph is a **publication act**, not a sync act.
 * Nothing here runs ambiently: a caller assembles resolved edges, the picker
 * decides what may be offered, the preview shows the real records, and only
 * then does the queue write anything.
 *
 * The records land in the **user's own PDS**. xNet is the projector and (via
 * the hub's index role) the appview; it is never the repo. That is what keeps
 * the Charter §6 vanish test passing: if xNet disappears, the published graph
 * is untouched and any appview can rebuild it from the relay.
 */

export {
  AFFINITY_NSID,
  AFFINITY_RKEY_KIND,
  BOOKMARK_NSID,
  BOOKMARK_RKEY_KIND,
  NEVER_PUBLISHABLE_INTERACTION_KINDS,
  NEVER_PUBLISHABLE_PRIVACY_CLASSES,
  PLATFORM_DOMAINS,
  PLATFORM_ID_REFS,
  PREFERENCE_AI_NSID,
  PUBLISHABLE_INTERACTION_KINDS
} from './constants'
export {
  toAtmosphereState,
  type ExcludedEdge,
  type ExclusionReason,
  type PublishState,
  type PublishableEdge,
  type PublishedEdge
} from './types'
export {
  exclusionFor,
  selectBucket,
  selectableInteractionKinds,
  selectablePlatforms,
  type BucketResult,
  type BucketSelection
} from './buckets'
export {
  SOCIAL_INTERACTION_IRI,
  edgeCreatedAt,
  edgeTags,
  interactionToAffinity,
  interactionToBookmark
} from './lenses'
export {
  affinityRkey,
  affinityUri,
  indexByNodeId,
  reconcile,
  type ReconcileResult,
  type RemoteBookmark
} from './rkey'
export {
  backoffMs,
  runPublish,
  runWithdraw,
  toNodeProperties,
  type PublishProgress,
  type PublishRunOptions,
  type PublishRunResult,
  type RepoWriter
} from './queue'
export { buildPublishPreview, pickSamples, type PublishPreview } from './preview'
export {
  DEFAULT_AI_PREFERENCES,
  PUBLISHED_COLLECTIONS,
  buildAiPreferenceRecords,
  type AiPreferenceRecord,
  type AiUsePreferences
} from './preference'
