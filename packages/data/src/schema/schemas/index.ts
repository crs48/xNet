/**
 * Built-in schemas for xNet.
 *
 * These are the core schema types that come with xNet.
 * Users can create their own schemas using defineSchema().
 */

export { PageSchema, type Page } from './page'
export {
  FOLDER_SCHEMA_IRI,
  FolderSchema,
  buildFolderTree,
  flattenFolderTree,
  folderAncestorIds,
  folderPathIds,
  wouldCreateFolderCycle,
  type Folder,
  type FolderLike,
  type FolderTreeNode
} from './folder'
export {
  MAX_TAG_NAME_LENGTH,
  TAG_SCHEMA_IRI,
  TagSchema,
  isValidTagName,
  normalizeTagName,
  type Tag
} from './tag'
export { DatabaseSchema, type Database } from './database'
export { DatabaseRowSchema, type DatabaseRow } from './database-row'
export { DatabaseFieldSchema, type DatabaseField } from './database-field'
export { DatabaseSelectOptionSchema, type DatabaseSelectOption } from './database-select-option'
export { DatabaseViewSchema, type DatabaseView } from './database-view'
export {
  SchemaExtensionSchema,
  ExtensionFieldSchema,
  SCHEMA_EXTENSION_SCHEMA_IRI,
  EXTENSION_FIELD_SCHEMA_IRI,
  schemaExtensionId,
  type SchemaExtension,
  type ExtensionField
} from './schema-extension'
export {
  TaskSchema,
  TASK_STATUS_CATEGORIES,
  getTaskStatusCategory,
  isCompletedTaskStatus,
  type Task,
  type TaskStatusCategory,
  type TaskStatusId
} from './task'
export { TaskViewSchema, type TaskView } from './task-view'
export {
  TASK_SHORT_ID_PATTERN,
  formatTaskShortId,
  parseTaskShortId,
  taskBranchName,
  shortIdsFromBlock,
  type ParsedTaskShortId,
  type TaskShortIdBlock
} from './task-identifiers'
export { ProjectSchema, type Project } from './project'
export {
  MetricSchema,
  type Metric,
  type MetricKind,
  type MetricScheduleId,
  type MetricPolarity
} from './metric'
export { ObservationSchema, type Observation, type ObservationPhase } from './observation'
export {
  ExperimentSchema,
  type Experiment,
  type ExperimentStatus,
  type ExperimentDesign,
  type ExperimentPhase
} from './experiment'
export { MilestoneSchema, MILESTONE_SCHEMA_IRI, type Milestone } from './milestone'
export {
  CRM_NAMESPACE,
  ORGANIZATION_SCHEMA_IRI,
  CONTACT_SCHEMA_IRI,
  RELATIONSHIP_SCHEMA_IRI,
  PIPELINE_SCHEMA_IRI,
  STAGE_SCHEMA_IRI,
  DEAL_SCHEMA_IRI,
  DEAL_CONTACT_ROLE_SCHEMA_IRI,
  ACTIVITY_SCHEMA_IRI,
  PRODUCT_SCHEMA_IRI,
  LINE_ITEM_SCHEMA_IRI,
  OrganizationSchema,
  ORGANIZATION_SIZES,
  ContactSchema,
  CONTACT_LIFECYCLE,
  RelationshipSchema,
  RELATIONSHIP_KINDS,
  PipelineSchema,
  StageSchema,
  DealSchema,
  FORECAST_CATEGORIES,
  DEAL_SOURCES,
  DealContactRoleSchema,
  DEAL_CONTACT_ROLES,
  ActivitySchema,
  ACTIVITY_KINDS,
  ProductSchema,
  PRODUCT_KINDS,
  LineItemSchema,
  crmSchemas,
  type CrmVisibility,
  type Organization,
  type OrganizationSize,
  type Contact,
  type ContactLifecycle,
  type Relationship,
  type RelationshipKind,
  type Pipeline,
  type Stage,
  type Deal,
  type ForecastCategory,
  type DealSource,
  type DealContactRole,
  type DealContactRoleKind,
  type Activity,
  type ActivityKind,
  type Product,
  type ProductKind,
  type LineItem
} from './crm'
export { AccountSchema, ACCOUNT_SCHEMA_IRI, type Account, type AccountClassId } from './account'
export {
  TransactionSchema,
  TRANSACTION_SCHEMA_IRI,
  type Transaction,
  type TransactionStatus
} from './transaction'
export { PostingSchema, POSTING_SCHEMA_IRI, type Posting } from './posting'
export { BudgetSchema, BUDGET_SCHEMA_IRI, type Budget, type BudgetPeriod } from './budget'
export {
  ImportBatchSchema,
  IMPORT_BATCH_SCHEMA_IRI,
  type ImportBatch,
  type ImportSource
} from './import-batch'
export {
  spaceOwnAuthorization,
  spaceCascadeAuthorization,
  spaceContributorAuthorization
} from './space-authorization'
export {
  SPACE_SCHEMA_IRI,
  SPACE_KINDS,
  SPACE_ROLES,
  SPACE_VISIBILITY,
  NODE_VISIBILITY,
  SpaceSchema,
  buildSpaceTree,
  flattenSpaceTree,
  spaceAncestorIds,
  spacePathIds,
  wouldCreateSpaceCycle,
  compareSpaceRoles,
  effectiveSpaceRole,
  canManageSpace,
  spaceRoleGrantActions,
  spaceRoleToShareRole,
  type Space,
  type SpaceKind,
  type SpaceRole,
  type SpaceVisibility,
  type NodeVisibility,
  type SpaceLike,
  type SpaceTreeNode
} from './space'
export {
  SPACE_MEMBERSHIP_SCHEMA_IRI,
  SpaceMembershipSchema,
  spaceMembershipId,
  isSpaceRole,
  type SpaceMembership
} from './space-membership'
export { ExternalReferenceSchema, type ExternalReference } from './external-reference'
export { MediaAssetSchema, type MediaAsset } from './media-asset'
export {
  TranscriptionSchema,
  TRANSCRIPTION_SCHEMA_IRI,
  type Transcription,
  type TranscriptionSourceId
} from './transcription'
// Meeting schema pack (exploration 0279)
export {
  MeetingSchema,
  MeetingTranscriptSchema,
  MEETING_SCHEMA_IRI,
  MEETING_TRANSCRIPT_SCHEMA_IRI,
  MEETING_CHANNELS,
  MEETING_TEMPLATE_IDS,
  type Meeting,
  type MeetingTranscript,
  type MeetingChannel,
  type MeetingSegment,
  type MeetingTemplateId
} from './meeting'
export { CanvasSchema, type Canvas } from './canvas'
export {
  MapSchema,
  type Map,
  type MapBasemapId,
  type MapViewport,
  type MapLayerGeometry,
  type MapLayerStyle,
  type MapLayerSource,
  type MapLayerSpec,
  type GeoPosition,
  type GeoGeometry,
  type GeoFeature,
  type GeoFeatureCollection
} from './map'
export { CommentSchema, type Comment } from './comment'
export { ReactionSchema, type Reaction } from './reaction'
export { ProfileSchema, profileNodeId, didFromProfileNodeId, type Profile } from './profile'
export { ChannelSchema, CHANNEL_KINDS, type Channel, type ChannelKind } from './channel'
export { ChatMessageSchema, type ChatMessage } from './chat-message'
// Integration schema pack (exploration 0213)
export { FeedSchema, FEED_SCHEMA_IRI, type Feed } from './feed'
export { FeedItemSchema, FEED_ITEM_SCHEMA_IRI, type FeedItem } from './feed-item'
export {
  ExternalItemSchema,
  EXTERNAL_ITEM_SCHEMA_IRI,
  EXTERNAL_ITEM_SOURCES,
  type ExternalItem
} from './external-item'
export {
  InboxStateSchema,
  inboxStateNodeId,
  DEFAULT_CHANNEL_TIER,
  type InboxState,
  type InboxWatermark,
  type InboxItemTriage,
  type ChannelNotifyTier,
  type NotificationPrefs
} from './inbox-state'
export {
  MAX_MENTION_DIDS,
  normalizeMentions,
  mentionsInclude,
  isValidMentions,
  type MessageMentions
} from './mentions'
export {
  MAX_LINK_PREVIEWS_PER_MESSAGE,
  isMessageLinkPreview,
  sanitizeLinkPreviews,
  type MessageLinkPreview
} from './link-preview'
export { GrantSchema, type Grant } from './grant'
// Account/device ledger (explorations 0149 + 0243)
export {
  AccountRecordSchema,
  DeviceRecordSchema,
  RecoveryRecordSchema,
  RevocationRecordSchema,
  ACCOUNT_RECORD_SCHEMA_IRI,
  DEVICE_RECORD_SCHEMA_IRI,
  RECOVERY_RECORD_SCHEMA_IRI,
  REVOCATION_RECORD_SCHEMA_IRI,
  accountRecordId,
  deviceRecordId,
  recoveryRecordId,
  revocationRecordId,
  revokedSubjects,
  resolveActiveDevices,
  isDeviceAuthorized,
  deviceRecipientExpander,
  type AccountRecord,
  type DeviceRecord,
  type RecoveryRecord,
  type RevocationRecord,
  type DeviceLike,
  type RevocationLike
} from './account-ledger'
export {
  createAccountRecord,
  admitDeviceRecord,
  revokeSubjectRecord,
  revokeDeviceRecord,
  accountState,
  nextEpoch,
  type LedgerNodeIntent
} from './account-ledger-ops'
export { SavedViewSchema, type SavedView } from './saved-view'
export { WorkspaceSchema, type Workspace, type WorkspaceTreeJson } from './workspace'
export {
  UserWidgetSchema,
  type UserWidget,
  type UserWidgetConfigField,
  type UserWidgetSize
} from './user-widget'
export {
  DashboardSchema,
  type Dashboard,
  type DashboardBreakpointId,
  type DashboardLayoutItem,
  type DashboardLayouts,
  type DashboardTimeRange,
  type DashboardVariablesState,
  type DashboardWidgetInstance,
  type DashboardWidgetRefresh
} from './dashboard'
export {
  PresenceSummarySchema,
  SchemaCompatibilitySchema,
  SchemaDefinitionSchema,
  SyncPolicySchema,
  SYSTEM_NAMESPACE_KINDS,
  SYSTEM_SCHEMA_BASE_IRIS,
  SYSTEM_SCHEMA_IRIS,
  buildSystemNamespace,
  buildSystemNodeId,
  computeSchemaDefinitionContentHash,
  createSchemaDefinitionSigningPayload,
  isSystemNamespaceResource,
  isSystemSchemaIri,
  parseSystemNamespaceResource,
  resolveSchemaAuthority,
  validateSchemaDefinitionNode,
  type ParsedSystemNamespaceResource,
  type PresenceCountBucket,
  type PresenceSummary,
  type PresenceVisibility,
  type SchemaAuthorityResolution,
  type SchemaAuthorityResolutionKind,
  type SchemaAuthorityResolutionOptions,
  type SchemaCompatibility,
  type SchemaCompatibilityMode,
  type SchemaDefinition,
  type SchemaDefinitionSigningInput,
  type SchemaDefinitionStatus,
  type SyncPolicy,
  type SyncPolicyStatus,
  type SystemFederationErrorCode,
  type SystemNamespaceKind,
  type ValidateSchemaDefinitionNodeOptions
} from './system'
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

// Game-interop schema pack (exploration 0200)
export {
  GAME_NAMESPACE,
  GAME_ASSET_MIME_TYPES,
  GAME_ASSET_FORMATS,
  GAME_SCHEMA_IRIS,
  PLAYER_IDENTITY_SCHEMA_IRI,
  INVENTORY_SCHEMA_IRI,
  GAME_ITEM_SCHEMA_IRI,
  ACHIEVEMENT_SCHEMA_IRI,
  MATCH_SESSION_SCHEMA_IRI,
  GAME_ECONOMY_ENTRY_SCHEMA_IRI,
  GAME_ASSET_SCHEMA_IRI,
  ITEM_RARITIES,
  MATCH_RESULTS,
  PlayerIdentitySchema,
  GameItemSchema,
  InventorySchema,
  AchievementSchema,
  MatchSessionSchema,
  GameEconomyEntrySchema,
  GameAssetSchema,
  gameSchemas,
  type GameVisibility,
  type ItemRarity,
  type MatchResult,
  type GameAssetFormat,
  type PlayerIdentity,
  type GameItem,
  type Inventory,
  type Achievement,
  type MatchSession,
  type GameEconomyEntry,
  type GameAsset
} from './game'

// Memory schema pack (exploration 0211)
export {
  MEMORY_ITEM_SCHEMA_IRI,
  MEMORY_KINDS,
  MemoryItemSchema,
  type MemoryItem,
  type MemoryKind
} from './memory'

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
  'xnet://xnet.fyi/Folder@1.0.0': () => import('./folder').then((m) => m.FolderSchema),
  'xnet://xnet.fyi/Tag@1.0.0': () => import('./tag').then((m) => m.TagSchema),
  'xnet://xnet.fyi/Database@2.0.0': () => import('./database').then((m) => m.DatabaseSchema),
  'xnet://xnet.fyi/DatabaseRow@2.0.0': () =>
    import('./database-row').then((m) => m.DatabaseRowSchema),
  'xnet://xnet.fyi/DatabaseField@1.0.0': () =>
    import('./database-field').then((m) => m.DatabaseFieldSchema),
  'xnet://xnet.fyi/DatabaseSelectOption@1.0.0': () =>
    import('./database-select-option').then((m) => m.DatabaseSelectOptionSchema),
  'xnet://xnet.fyi/DatabaseView@1.0.0': () =>
    import('./database-view').then((m) => m.DatabaseViewSchema),
  'xnet://xnet.fyi/SchemaExtension@1.0.0': () =>
    import('./schema-extension').then((m) => m.SchemaExtensionSchema),
  'xnet://xnet.fyi/ExtensionField@1.0.0': () =>
    import('./schema-extension').then((m) => m.ExtensionFieldSchema),
  'xnet://xnet.fyi/Task@1.0.0': () => import('./task').then((m) => m.TaskSchema),
  'xnet://xnet.fyi/TaskView@1.0.0': () => import('./task-view').then((m) => m.TaskViewSchema),
  'xnet://xnet.fyi/Project@1.0.0': () => import('./project').then((m) => m.ProjectSchema),
  'xnet://xnet.fyi/Metric@1.0.0': () => import('./metric').then((m) => m.MetricSchema),
  'xnet://xnet.fyi/Observation@1.0.0': () =>
    import('./observation').then((m) => m.ObservationSchema),
  'xnet://xnet.fyi/Experiment@1.0.0': () => import('./experiment').then((m) => m.ExperimentSchema),
  'xnet://xnet.fyi/Milestone@1.0.0': () => import('./milestone').then((m) => m.MilestoneSchema),
  // CRM schema pack (exploration 0188)
  'xnet://xnet.fyi/Organization@1.0.0': () => import('./crm').then((m) => m.OrganizationSchema),
  'xnet://xnet.fyi/Contact@1.0.0': () => import('./crm').then((m) => m.ContactSchema),
  'xnet://xnet.fyi/Relationship@1.0.0': () => import('./crm').then((m) => m.RelationshipSchema),
  'xnet://xnet.fyi/Pipeline@1.0.0': () => import('./crm').then((m) => m.PipelineSchema),
  'xnet://xnet.fyi/Stage@1.0.0': () => import('./crm').then((m) => m.StageSchema),
  'xnet://xnet.fyi/Deal@1.0.0': () => import('./crm').then((m) => m.DealSchema),
  'xnet://xnet.fyi/DealContactRole@1.0.0': () =>
    import('./crm').then((m) => m.DealContactRoleSchema),
  'xnet://xnet.fyi/Activity@1.0.0': () => import('./crm').then((m) => m.ActivitySchema),
  'xnet://xnet.fyi/Product@1.0.0': () => import('./crm').then((m) => m.ProductSchema),
  'xnet://xnet.fyi/LineItem@1.0.0': () => import('./crm').then((m) => m.LineItemSchema),
  // Double-entry accounting + personal finance (exploration 0187)
  'xnet://xnet.fyi/Account@1.0.0': () => import('./account').then((m) => m.AccountSchema),
  'xnet://xnet.fyi/Transaction@1.0.0': () =>
    import('./transaction').then((m) => m.TransactionSchema),
  'xnet://xnet.fyi/Posting@1.0.0': () => import('./posting').then((m) => m.PostingSchema),
  'xnet://xnet.fyi/Budget@1.0.0': () => import('./budget').then((m) => m.BudgetSchema),
  'xnet://xnet.fyi/ImportBatch@1.0.0': () =>
    import('./import-batch').then((m) => m.ImportBatchSchema),
  'xnet://xnet.fyi/Space@1.0.0': () => import('./space').then((m) => m.SpaceSchema),
  'xnet://xnet.fyi/SpaceMembership@1.0.0': () =>
    import('./space-membership').then((m) => m.SpaceMembershipSchema),
  'xnet://xnet.fyi/ExternalReference@1.0.0': () =>
    import('./external-reference').then((m) => m.ExternalReferenceSchema),
  'xnet://xnet.fyi/MediaAsset@1.0.0': () => import('./media-asset').then((m) => m.MediaAssetSchema),
  'xnet://xnet.fyi/Transcription@1.0.0': () =>
    import('./transcription').then((m) => m.TranscriptionSchema),
  // Meeting schema pack (exploration 0279)
  'xnet://xnet.fyi/Meeting@1.0.0': () => import('./meeting').then((m) => m.MeetingSchema),
  'xnet://xnet.fyi/MeetingTranscript@1.0.0': () =>
    import('./meeting').then((m) => m.MeetingTranscriptSchema),
  'xnet://xnet.fyi/Canvas@1.0.0': () => import('./canvas').then((m) => m.CanvasSchema),
  'xnet://xnet.fyi/Map@1.0.0': () => import('./map').then((m) => m.MapSchema),
  'xnet://xnet.fyi/Comment@1.0.0': () => import('./comment').then((m) => m.CommentSchema),
  'xnet://xnet.fyi/Reaction@1.0.0': () => import('./reaction').then((m) => m.ReactionSchema),
  'xnet://xnet.fyi/Profile@1.0.0': () => import('./profile').then((m) => m.ProfileSchema),
  'xnet://xnet.fyi/Channel@1.0.0': () => import('./channel').then((m) => m.ChannelSchema),
  'xnet://xnet.fyi/ChatMessage@1.0.0': () =>
    import('./chat-message').then((m) => m.ChatMessageSchema),
  // Integration schema pack (exploration 0213)
  'xnet://xnet.fyi/Feed@1.0.0': () => import('./feed').then((m) => m.FeedSchema),
  'xnet://xnet.fyi/FeedItem@1.0.0': () => import('./feed-item').then((m) => m.FeedItemSchema),
  'xnet://xnet.fyi/ExternalItem@1.0.0': () =>
    import('./external-item').then((m) => m.ExternalItemSchema),
  'xnet://xnet.fyi/InboxState@1.0.0': () => import('./inbox-state').then((m) => m.InboxStateSchema),
  'xnet://xnet.fyi/Grant@1.0.0': () => import('./grant').then((m) => m.GrantSchema),
  'xnet://xnet.fyi/AccountRecord@1.0.0': () =>
    import('./account-ledger').then((m) => m.AccountRecordSchema),
  'xnet://xnet.fyi/DeviceRecord@1.0.0': () =>
    import('./account-ledger').then((m) => m.DeviceRecordSchema),
  'xnet://xnet.fyi/RecoveryRecord@1.0.0': () =>
    import('./account-ledger').then((m) => m.RecoveryRecordSchema),
  'xnet://xnet.fyi/RevocationRecord@1.0.0': () =>
    import('./account-ledger').then((m) => m.RevocationRecordSchema),
  'xnet://xnet.fyi/SavedView@1.0.0': () => import('./saved-view').then((m) => m.SavedViewSchema),
  'xnet://xnet.fyi/Workspace@1.0.0': () => import('./workspace').then((m) => m.WorkspaceSchema),
  'xnet://xnet.fyi/Dashboard@1.0.0': () => import('./dashboard').then((m) => m.DashboardSchema),
  'xnet://xnet.fyi/UserWidget@1.0.0': () => import('./user-widget').then((m) => m.UserWidgetSchema),
  'xnet://xnet.fyi/SchemaDefinition@1.0.0': () =>
    import('./system').then((m) => m.SchemaDefinitionSchema),
  'xnet://xnet.fyi/SchemaCompatibility@1.0.0': () =>
    import('./system').then((m) => m.SchemaCompatibilitySchema),
  'xnet://xnet.fyi/SyncPolicy@1.0.0': () => import('./system').then((m) => m.SyncPolicySchema),
  'xnet://xnet.fyi/PresenceSummary@1.0.0': () =>
    import('./system').then((m) => m.PresenceSummarySchema),
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
  // Game-interop schema pack (exploration 0200)
  'xnet://xnet.fyi/PlayerIdentity@1.0.0': () =>
    import('./game').then((m) => m.PlayerIdentitySchema),
  'xnet://xnet.fyi/Inventory@1.0.0': () => import('./game').then((m) => m.InventorySchema),
  'xnet://xnet.fyi/GameItem@1.0.0': () => import('./game').then((m) => m.GameItemSchema),
  'xnet://xnet.fyi/Achievement@1.0.0': () => import('./game').then((m) => m.AchievementSchema),
  'xnet://xnet.fyi/MatchSession@1.0.0': () => import('./game').then((m) => m.MatchSessionSchema),
  'xnet://xnet.fyi/GameEconomyEntry@1.0.0': () =>
    import('./game').then((m) => m.GameEconomyEntrySchema),
  'xnet://xnet.fyi/GameAsset@1.0.0': () => import('./game').then((m) => m.GameAssetSchema),
  // Memory schema pack (exploration 0211)
  'xnet://xnet.fyi/MemoryItem@1.0.0': () => import('./memory').then((m) => m.MemoryItemSchema),

  // Legacy unversioned IRIs (aliases for the current version)
  'xnet://xnet.fyi/Page': () => import('./page').then((m) => m.PageSchema),
  'xnet://xnet.fyi/Folder': () => import('./folder').then((m) => m.FolderSchema),
  'xnet://xnet.fyi/Tag': () => import('./tag').then((m) => m.TagSchema),
  'xnet://xnet.fyi/Database': () => import('./database').then((m) => m.DatabaseSchema),
  'xnet://xnet.fyi/DatabaseRow': () => import('./database-row').then((m) => m.DatabaseRowSchema),
  'xnet://xnet.fyi/DatabaseField': () =>
    import('./database-field').then((m) => m.DatabaseFieldSchema),
  'xnet://xnet.fyi/DatabaseSelectOption': () =>
    import('./database-select-option').then((m) => m.DatabaseSelectOptionSchema),
  'xnet://xnet.fyi/DatabaseView': () => import('./database-view').then((m) => m.DatabaseViewSchema),
  'xnet://xnet.fyi/SchemaExtension': () =>
    import('./schema-extension').then((m) => m.SchemaExtensionSchema),
  'xnet://xnet.fyi/ExtensionField': () =>
    import('./schema-extension').then((m) => m.ExtensionFieldSchema),
  'xnet://xnet.fyi/Task': () => import('./task').then((m) => m.TaskSchema),
  'xnet://xnet.fyi/TaskView': () => import('./task-view').then((m) => m.TaskViewSchema),
  'xnet://xnet.fyi/Project': () => import('./project').then((m) => m.ProjectSchema),
  'xnet://xnet.fyi/Metric': () => import('./metric').then((m) => m.MetricSchema),
  'xnet://xnet.fyi/Observation': () => import('./observation').then((m) => m.ObservationSchema),
  'xnet://xnet.fyi/Experiment': () => import('./experiment').then((m) => m.ExperimentSchema),
  'xnet://xnet.fyi/Milestone': () => import('./milestone').then((m) => m.MilestoneSchema),
  'xnet://xnet.fyi/Organization': () => import('./crm').then((m) => m.OrganizationSchema),
  'xnet://xnet.fyi/Contact': () => import('./crm').then((m) => m.ContactSchema),
  'xnet://xnet.fyi/Relationship': () => import('./crm').then((m) => m.RelationshipSchema),
  'xnet://xnet.fyi/Pipeline': () => import('./crm').then((m) => m.PipelineSchema),
  'xnet://xnet.fyi/Stage': () => import('./crm').then((m) => m.StageSchema),
  'xnet://xnet.fyi/Deal': () => import('./crm').then((m) => m.DealSchema),
  'xnet://xnet.fyi/DealContactRole': () => import('./crm').then((m) => m.DealContactRoleSchema),
  'xnet://xnet.fyi/Activity': () => import('./crm').then((m) => m.ActivitySchema),
  'xnet://xnet.fyi/Product': () => import('./crm').then((m) => m.ProductSchema),
  'xnet://xnet.fyi/LineItem': () => import('./crm').then((m) => m.LineItemSchema),
  'xnet://xnet.fyi/Account': () => import('./account').then((m) => m.AccountSchema),
  'xnet://xnet.fyi/Transaction': () => import('./transaction').then((m) => m.TransactionSchema),
  'xnet://xnet.fyi/Posting': () => import('./posting').then((m) => m.PostingSchema),
  'xnet://xnet.fyi/Budget': () => import('./budget').then((m) => m.BudgetSchema),
  'xnet://xnet.fyi/ImportBatch': () => import('./import-batch').then((m) => m.ImportBatchSchema),
  'xnet://xnet.fyi/Space': () => import('./space').then((m) => m.SpaceSchema),
  'xnet://xnet.fyi/SpaceMembership': () =>
    import('./space-membership').then((m) => m.SpaceMembershipSchema),
  'xnet://xnet.fyi/ExternalReference': () =>
    import('./external-reference').then((m) => m.ExternalReferenceSchema),
  'xnet://xnet.fyi/MediaAsset': () => import('./media-asset').then((m) => m.MediaAssetSchema),
  'xnet://xnet.fyi/Transcription': () =>
    import('./transcription').then((m) => m.TranscriptionSchema),
  'xnet://xnet.fyi/Meeting': () => import('./meeting').then((m) => m.MeetingSchema),
  'xnet://xnet.fyi/MeetingTranscript': () =>
    import('./meeting').then((m) => m.MeetingTranscriptSchema),
  'xnet://xnet.fyi/Canvas': () => import('./canvas').then((m) => m.CanvasSchema),
  'xnet://xnet.fyi/Map': () => import('./map').then((m) => m.MapSchema),
  'xnet://xnet.fyi/Comment': () => import('./comment').then((m) => m.CommentSchema),
  'xnet://xnet.fyi/Reaction': () => import('./reaction').then((m) => m.ReactionSchema),
  'xnet://xnet.fyi/Profile': () => import('./profile').then((m) => m.ProfileSchema),
  'xnet://xnet.fyi/Channel': () => import('./channel').then((m) => m.ChannelSchema),
  'xnet://xnet.fyi/ChatMessage': () => import('./chat-message').then((m) => m.ChatMessageSchema),
  'xnet://xnet.fyi/Feed': () => import('./feed').then((m) => m.FeedSchema),
  'xnet://xnet.fyi/FeedItem': () => import('./feed-item').then((m) => m.FeedItemSchema),
  'xnet://xnet.fyi/ExternalItem': () => import('./external-item').then((m) => m.ExternalItemSchema),
  'xnet://xnet.fyi/InboxState': () => import('./inbox-state').then((m) => m.InboxStateSchema),
  'xnet://xnet.fyi/Grant': () => import('./grant').then((m) => m.GrantSchema),
  'xnet://xnet.fyi/AccountRecord': () =>
    import('./account-ledger').then((m) => m.AccountRecordSchema),
  'xnet://xnet.fyi/DeviceRecord': () =>
    import('./account-ledger').then((m) => m.DeviceRecordSchema),
  'xnet://xnet.fyi/RecoveryRecord': () =>
    import('./account-ledger').then((m) => m.RecoveryRecordSchema),
  'xnet://xnet.fyi/RevocationRecord': () =>
    import('./account-ledger').then((m) => m.RevocationRecordSchema),
  'xnet://xnet.fyi/SavedView': () => import('./saved-view').then((m) => m.SavedViewSchema),
  'xnet://xnet.fyi/Workspace': () => import('./workspace').then((m) => m.WorkspaceSchema),
  'xnet://xnet.fyi/Dashboard': () => import('./dashboard').then((m) => m.DashboardSchema),
  'xnet://xnet.fyi/UserWidget': () => import('./user-widget').then((m) => m.UserWidgetSchema),
  'xnet://xnet.fyi/SchemaDefinition': () =>
    import('./system').then((m) => m.SchemaDefinitionSchema),
  'xnet://xnet.fyi/SchemaCompatibility': () =>
    import('./system').then((m) => m.SchemaCompatibilitySchema),
  'xnet://xnet.fyi/SyncPolicy': () => import('./system').then((m) => m.SyncPolicySchema),
  'xnet://xnet.fyi/PresenceSummary': () => import('./system').then((m) => m.PresenceSummarySchema),
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
  'xnet://xnet.fyi/ReviewTask': () => import('./moderation').then((m) => m.ReviewTaskSchema),
  // Game-interop schema pack (exploration 0200)
  'xnet://xnet.fyi/PlayerIdentity': () => import('./game').then((m) => m.PlayerIdentitySchema),
  'xnet://xnet.fyi/Inventory': () => import('./game').then((m) => m.InventorySchema),
  'xnet://xnet.fyi/GameItem': () => import('./game').then((m) => m.GameItemSchema),
  'xnet://xnet.fyi/Achievement': () => import('./game').then((m) => m.AchievementSchema),
  'xnet://xnet.fyi/MatchSession': () => import('./game').then((m) => m.MatchSessionSchema),
  'xnet://xnet.fyi/GameEconomyEntry': () => import('./game').then((m) => m.GameEconomyEntrySchema),
  'xnet://xnet.fyi/GameAsset': () => import('./game').then((m) => m.GameAssetSchema),
  // Memory schema pack (exploration 0211)
  'xnet://xnet.fyi/MemoryItem': () => import('./memory').then((m) => m.MemoryItemSchema)
} as const

/**
 * Built-in schema IRIs.
 */
export type BuiltInSchemaIRI = keyof typeof builtInSchemas
