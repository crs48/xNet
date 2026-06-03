/**
 * Built-in schemas for xNet.
 *
 * These are the core schema types that come with xNet.
 * Users can create their own schemas using defineSchema().
 */

export { PageSchema, type Page } from './page'
export { DatabaseSchema, type Database } from './database'
export { DatabaseRowSchema, type DatabaseRow } from './database-row'
export { TaskSchema, type Task } from './task'
export { ExternalReferenceSchema, type ExternalReference } from './external-reference'
export { MediaAssetSchema, type MediaAsset } from './media-asset'
export { CanvasSchema, type Canvas } from './canvas'
export { CommentSchema, type Comment } from './comment'
export { ReactionSchema, type Reaction } from './reaction'
export { GrantSchema, type Grant } from './grant'
export { SavedViewSchema, type SavedView } from './saved-view'
export {
  AbuseReportSchema,
  AppealSchema,
  CommunityNoteSchema,
  ContentProvenanceSchema,
  MessageRequestSchema,
  ModerationLabelSchema,
  NoteRatingSchema,
  PolicyListSchema,
  PolicySubscriptionSchema,
  PublicInteractionPolicySchema,
  QualitySignalSchema,
  ReviewTaskSchema,
  type AbuseReport,
  type Appeal,
  type CommunityNote,
  type ContentProvenance,
  type MessageRequest,
  type ModerationLabel,
  type NoteRating,
  type PolicyList,
  type PolicySubscription,
  type PublicInteractionPolicy,
  type QualitySignal,
  type ReviewTask
} from './moderation'

// Comment anchor types
export {
  type AnchorType,
  type TextAnchor,
  type CellAnchor,
  type RowAnchor,
  type ColumnAnchor,
  type CanvasPositionAnchor,
  type CanvasObjectAnchorPlacement,
  type CanvasObjectAnchor,
  type NodeAnchor,
  type AnchorData,
  encodeAnchor,
  decodeAnchor,
  isTextAnchor,
  isCellAnchor,
  isRowAnchor,
  isColumnAnchor,
  isCanvasPositionAnchor,
  isCanvasObjectAnchor,
  isNodeAnchor
} from './commentAnchors'

// Comment reference extraction
export {
  type Mention,
  type CommentRef,
  type NodeRef,
  type Reference,
  extractReferences,
  extractMentions,
  getMentionedUsers,
  isMentioned,
  isUsernameMentioned,
  extractNodeRefs,
  extractCommentRefs,
  replaceAt,
  convertRefsToLinks
} from './commentReferences'

// Comment orphan detection
export {
  type OrphanReason,
  type OrphanStatus,
  type OrphanResolvers,
  checkOrphanStatus,
  filterOrphanedComments
} from './commentOrphans'

/**
 * All built-in schemas, keyed by their IRI.
 *
 * Both unversioned (legacy) and versioned (@1.0.0) IRIs are supported.
 * The unversioned IRIs are aliases for @1.0.0 versions.
 */
export const builtInSchemas = {
  // Versioned IRIs (canonical)
  'xnet://xnet.fyi/Page@1.0.0': () => import('./page').then((m) => m.PageSchema),
  'xnet://xnet.fyi/Database@1.0.0': () => import('./database').then((m) => m.DatabaseSchema),
  'xnet://xnet.fyi/DatabaseRow@1.0.0': () =>
    import('./database-row').then((m) => m.DatabaseRowSchema),
  'xnet://xnet.fyi/Task@1.0.0': () => import('./task').then((m) => m.TaskSchema),
  'xnet://xnet.fyi/ExternalReference@1.0.0': () =>
    import('./external-reference').then((m) => m.ExternalReferenceSchema),
  'xnet://xnet.fyi/MediaAsset@1.0.0': () => import('./media-asset').then((m) => m.MediaAssetSchema),
  'xnet://xnet.fyi/Canvas@1.0.0': () => import('./canvas').then((m) => m.CanvasSchema),
  'xnet://xnet.fyi/Comment@1.0.0': () => import('./comment').then((m) => m.CommentSchema),
  'xnet://xnet.fyi/Reaction@1.0.0': () => import('./reaction').then((m) => m.ReactionSchema),
  'xnet://xnet.fyi/Grant@1.0.0': () => import('./grant').then((m) => m.GrantSchema),
  'xnet://xnet.fyi/SavedView@1.0.0': () => import('./saved-view').then((m) => m.SavedViewSchema),
  'xnet://xnet.fyi/AbuseReport@1.0.0': () =>
    import('./moderation').then((m) => m.AbuseReportSchema),
  'xnet://xnet.fyi/ModerationLabel@1.0.0': () =>
    import('./moderation').then((m) => m.ModerationLabelSchema),
  'xnet://xnet.fyi/PolicyList@1.0.0': () => import('./moderation').then((m) => m.PolicyListSchema),
  'xnet://xnet.fyi/PolicySubscription@1.0.0': () =>
    import('./moderation').then((m) => m.PolicySubscriptionSchema),
  'xnet://xnet.fyi/PublicInteractionPolicy@1.0.0': () =>
    import('./moderation').then((m) => m.PublicInteractionPolicySchema),
  'xnet://xnet.fyi/MessageRequest@1.0.0': () =>
    import('./moderation').then((m) => m.MessageRequestSchema),
  'xnet://xnet.fyi/CommunityNote@1.0.0': () =>
    import('./moderation').then((m) => m.CommunityNoteSchema),
  'xnet://xnet.fyi/NoteRating@1.0.0': () => import('./moderation').then((m) => m.NoteRatingSchema),
  'xnet://xnet.fyi/QualitySignal@1.0.0': () =>
    import('./moderation').then((m) => m.QualitySignalSchema),
  'xnet://xnet.fyi/ContentProvenance@1.0.0': () =>
    import('./moderation').then((m) => m.ContentProvenanceSchema),
  'xnet://xnet.fyi/Appeal@1.0.0': () => import('./moderation').then((m) => m.AppealSchema),
  'xnet://xnet.fyi/ReviewTask@1.0.0': () => import('./moderation').then((m) => m.ReviewTaskSchema),

  // Legacy unversioned IRIs (aliases for @1.0.0)
  'xnet://xnet.fyi/Page': () => import('./page').then((m) => m.PageSchema),
  'xnet://xnet.fyi/Database': () => import('./database').then((m) => m.DatabaseSchema),
  'xnet://xnet.fyi/DatabaseRow': () => import('./database-row').then((m) => m.DatabaseRowSchema),
  'xnet://xnet.fyi/Task': () => import('./task').then((m) => m.TaskSchema),
  'xnet://xnet.fyi/ExternalReference': () =>
    import('./external-reference').then((m) => m.ExternalReferenceSchema),
  'xnet://xnet.fyi/MediaAsset': () => import('./media-asset').then((m) => m.MediaAssetSchema),
  'xnet://xnet.fyi/Canvas': () => import('./canvas').then((m) => m.CanvasSchema),
  'xnet://xnet.fyi/Comment': () => import('./comment').then((m) => m.CommentSchema),
  'xnet://xnet.fyi/Reaction': () => import('./reaction').then((m) => m.ReactionSchema),
  'xnet://xnet.fyi/Grant': () => import('./grant').then((m) => m.GrantSchema),
  'xnet://xnet.fyi/SavedView': () => import('./saved-view').then((m) => m.SavedViewSchema),
  'xnet://xnet.fyi/AbuseReport': () => import('./moderation').then((m) => m.AbuseReportSchema),
  'xnet://xnet.fyi/ModerationLabel': () =>
    import('./moderation').then((m) => m.ModerationLabelSchema),
  'xnet://xnet.fyi/PolicyList': () => import('./moderation').then((m) => m.PolicyListSchema),
  'xnet://xnet.fyi/PolicySubscription': () =>
    import('./moderation').then((m) => m.PolicySubscriptionSchema),
  'xnet://xnet.fyi/PublicInteractionPolicy': () =>
    import('./moderation').then((m) => m.PublicInteractionPolicySchema),
  'xnet://xnet.fyi/MessageRequest': () =>
    import('./moderation').then((m) => m.MessageRequestSchema),
  'xnet://xnet.fyi/CommunityNote': () => import('./moderation').then((m) => m.CommunityNoteSchema),
  'xnet://xnet.fyi/NoteRating': () => import('./moderation').then((m) => m.NoteRatingSchema),
  'xnet://xnet.fyi/QualitySignal': () => import('./moderation').then((m) => m.QualitySignalSchema),
  'xnet://xnet.fyi/ContentProvenance': () =>
    import('./moderation').then((m) => m.ContentProvenanceSchema),
  'xnet://xnet.fyi/Appeal': () => import('./moderation').then((m) => m.AppealSchema),
  'xnet://xnet.fyi/ReviewTask': () => import('./moderation').then((m) => m.ReviewTaskSchema)
} as const

/**
 * Built-in schema IRIs.
 */
export type BuiltInSchemaIRI = keyof typeof builtInSchemas
