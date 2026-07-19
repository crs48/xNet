/**
 * Schema system for xNet.
 *
 * This module provides:
 * - Node: The universal container type
 * - defineSchema: Create schemas with TypeScript inference
 * - Property helpers: text, number, select, date, etc.
 * - Built-in schemas: Page, Database, Task
 * - Schema registry: Runtime lookup for schemas
 */

// Node type
export type { Node, SchemaIRI, DID, ParsedSchemaIRI } from './node'
export {
  isNode,
  createNodeId,
  DEFAULT_SCHEMA_VERSION,
  parseSchemaIRI,
  buildSchemaIRI,
  normalizeSchemaIRI,
  getBaseSchemaIRI,
  isSameSchema,
  getSchemaVersion
} from './node'

// Schema definition
export {
  defineSchema,
  type DefineSchemaOptions,
  DEFAULT_SCHEMA_VERSION as SCHEMA_VERSION
} from './define'

// Types
export type {
  PropertyType,
  PropertyDefinition,
  PropertyBuilder,
  Schema,
  DocumentType,
  DefinedSchema,
  ValidationResult,
  ValidationError,
  CreateNodeOptions,
  InferPropertyType,
  InferProperties,
  InferCreateProps,
  InferNode
} from './types'

// Property helpers - Basic
export {
  text,
  number,
  checkbox,
  json,
  money,
  isMoneyValue,
  type TextOptions,
  type NumberOptions,
  type CheckboxOptions,
  type JsonOptions,
  type MoneyOptions,
  type MoneyValue
} from './properties'

// Property helpers - Temporal
export {
  date,
  dateRange,
  type DateOptions,
  type DateRangeOptions,
  type DateRange
} from './properties'

// Property helpers - Spatial
export { geo, isGeoPoint, type GeoOptions, type GeoPoint } from './properties'

// Property helpers - Selection
export {
  select,
  multiSelect,
  type SelectOptions,
  type SelectOption,
  type MultiSelectOptions
} from './properties'

// Property helpers - References
export { person, relation, type PersonOptions, type RelationOptions } from './properties'

// Property helpers - Rich
export {
  url,
  email,
  phone,
  file,
  type UrlOptions,
  type EmailOptions,
  type PhoneOptions,
  type FileOptions,
  type FileRef
} from './properties'

// Property helpers - Auto
export {
  created,
  updated,
  createdBy,
  type CreatedOptions,
  type UpdatedOptions,
  type CreatedByOptions
} from './properties'

// Built-in schemas
export { PageSchema, type Page } from './schemas'
export { POST_SCHEMA_IRI, PostSchema, comparePostsForFeed, type Post } from './schemas'
export {
  COURSE_SCHEMA_IRI,
  LESSON_SCHEMA_IRI,
  LESSON_PROGRESS_SCHEMA_IRI,
  CourseSchema,
  LessonSchema,
  LessonProgressSchema,
  lessonProgressId,
  courseCompletion,
  type Course,
  type Lesson,
  type LessonProgress
} from './schemas'
export {
  EVENT_SCHEMA_IRI,
  RSVP_SCHEMA_IRI,
  EventSchema,
  RsvpSchema,
  rsvpId,
  upcomingEvents,
  type Event,
  type Rsvp
} from './schemas'
export { PublicationSchema, type Publication } from './schemas'
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
} from './schemas'
export {
  MAX_TAG_NAME_LENGTH,
  TAG_SCHEMA_IRI,
  TagSchema,
  isValidTagName,
  normalizeTagName,
  type Tag
} from './schemas'
export { DatabaseSchema, type Database } from './schemas'
export { DatabaseRowSchema, type DatabaseRow } from './schemas'
export { DatabaseFieldSchema, type DatabaseField } from './schemas'
export { DatabaseSelectOptionSchema, type DatabaseSelectOption } from './schemas'
export { DatabaseViewSchema, type DatabaseView, type ViewGroupMeta } from './schemas'
export {
  SchemaExtensionSchema,
  ExtensionFieldSchema,
  SCHEMA_EXTENSION_SCHEMA_IRI,
  EXTENSION_FIELD_SCHEMA_IRI,
  schemaExtensionId,
  type SchemaExtension,
  type ExtensionField
} from './schemas'
// Extension overlay + effective-schema composition
export { EXT_PREFIX, extKey, isExtKey, parseExtKey } from './extension'
export {
  buildEffectiveSchema,
  lockedPropertyKeys,
  canModifyColumn,
  findLockedColumns,
  type EffectiveExtensionField
} from './effective-schema'
export {
  loadExtensionFields,
  selectExtensionFields,
  resolveEffectiveSchema,
  type CoreSchemaResolver,
  type ExtensionRecord,
  type ExtensionFieldRecord
} from './extension-resolver'
// Sidecar (join-node) extensions
export {
  SIDECAR_PREFIX,
  sidecarId,
  sidecarOverlayKeys,
  mergeSidecarsIntoRow,
  type SidecarOverlay
} from './sidecar'
export {
  TaskSchema,
  TASK_STATUS_CATEGORIES,
  getTaskStatusCategory,
  isCompletedTaskStatus,
  type Task,
  type TaskStatusCategory,
  type TaskStatusId
} from './schemas'
export { TaskViewSchema, type TaskView } from './schemas'
export {
  TASK_SHORT_ID_PATTERN,
  formatTaskShortId,
  parseTaskShortId,
  taskBranchName,
  shortIdsFromBlock,
  type ParsedTaskShortId,
  type TaskShortIdBlock
} from './schemas'
export { ProjectSchema, type Project } from './schemas'
export {
  MetricSchema,
  type Metric,
  type MetricKind,
  type MetricScheduleId,
  type MetricPolarity
} from './schemas'
export { ObservationSchema, type Observation, type ObservationPhase } from './schemas'
export {
  ExperimentSchema,
  type Experiment,
  type ExperimentStatus,
  type ExperimentDesign,
  type ExperimentPhase
} from './schemas'
export { MilestoneSchema, MILESTONE_SCHEMA_IRI, type Milestone } from './schemas'
export { AccountSchema, ACCOUNT_SCHEMA_IRI, type Account, type AccountClassId } from './schemas'
export {
  TransactionSchema,
  TRANSACTION_SCHEMA_IRI,
  type Transaction,
  type TransactionStatus
} from './schemas'
export { PostingSchema, POSTING_SCHEMA_IRI, type Posting } from './schemas'
export { BudgetSchema, BUDGET_SCHEMA_IRI, type Budget, type BudgetPeriod } from './schemas'
export {
  ImportBatchSchema,
  IMPORT_BATCH_SCHEMA_IRI,
  type ImportBatch,
  type ImportSource
} from './schemas'
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
} from './schemas'
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
  SPACE_MEMBERSHIP_SCHEMA_IRI,
  SpaceMembershipSchema,
  spaceMembershipId,
  isSpaceRole,
  type Space,
  type SpaceKind,
  type SpaceRole,
  type SpaceVisibility,
  type NodeVisibility,
  type SpaceLike,
  type SpaceTreeNode,
  type SpaceMembership
} from './schemas'
export { ExternalReferenceSchema, type ExternalReference } from './schemas'
export { MediaAssetSchema, type MediaAsset } from './schemas'
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
} from './schemas'
export {
  MEMORY_ITEM_SCHEMA_IRI,
  MEMORY_KINDS,
  MemoryItemSchema,
  type MemoryItem,
  type MemoryKind
} from './schemas'
// Agent schema pack (exploration 0337)
export {
  AGENT_ACTION_SCHEMA_IRI,
  AGENT_ACTION_STATUSES,
  AGENT_APPROVAL_DECISIONS,
  AGENT_APPROVAL_SCHEMA_IRI,
  AGENT_APPROVAL_SURFACES,
  AGENT_CHANNELS,
  AGENT_NOTIFICATION_KINDS,
  AGENT_NOTIFICATION_SCHEMA_IRI,
  AGENT_NOTIFICATION_STATUSES,
  AGENT_PASSPORT_SCHEMA_IRI,
  AGENT_REVERSIBILITIES,
  AGENT_RISKS,
  AGENT_RUNTIMES,
  AGENT_SESSION_SCHEMA_IRI,
  AgentActionSchema,
  AgentApprovalSchema,
  AgentNotificationSchema,
  AgentPassportSchema,
  AgentSessionSchema,
  agentActionId,
  agentApprovalId,
  agentNotificationId,
  agentPassportId,
  agentSessionId,
  redactInstruction,
  type AgentAction,
  type AgentActionStatus,
  type AgentApproval,
  type AgentApprovalDecision,
  type AgentApprovalSurface,
  type AgentChannel,
  type AgentNotification,
  type AgentNotificationKind,
  type AgentNotificationStatus,
  type AgentPassport,
  type AgentReversibility,
  type AgentRisk,
  type AgentRuntime,
  type AgentSession
} from './schemas'
export {
  TranscriptionSchema,
  TRANSCRIPTION_SCHEMA_IRI,
  type Transcription,
  type TranscriptionSourceId
} from './schemas'
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
} from './schemas'
export { CanvasSchema, type Canvas } from './schemas'
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
} from './schemas'
export { CommentSchema, type Comment } from './schemas'
export {
  CHECKPOINT_SCHEMA_IRI,
  CheckpointSchema,
  type Checkpoint,
  type CheckpointFrontierEntry
} from './schemas'
export {
  DRAFT_SCHEMA_IRI,
  DraftSchema,
  type Draft,
  type DraftEntry,
  type DraftProvenance
} from './schemas'
export { ReactionSchema, type Reaction } from './schemas'
export { DebugReportSchema, type DebugReport } from './schemas'
export { ProfileSchema, profileNodeId, didFromProfileNodeId, type Profile } from './schemas'
export { ChannelSchema, CHANNEL_KINDS, type Channel, type ChannelKind } from './schemas'
export { ChatMessageSchema, type ChatMessage } from './schemas'
// Integration schema pack (exploration 0213)
export { FeedSchema, FEED_SCHEMA_IRI, type Feed } from './schemas'
export { FeedItemSchema, FEED_ITEM_SCHEMA_IRI, type FeedItem } from './schemas'
export {
  ExternalItemSchema,
  EXTERNAL_ITEM_SCHEMA_IRI,
  EXTERNAL_ITEM_SOURCES,
  type ExternalItem
} from './schemas'
export {
  InboxStateSchema,
  inboxStateNodeId,
  DEFAULT_CHANNEL_TIER,
  type InboxState,
  type InboxWatermark,
  type InboxItemTriage,
  type ChannelNotifyTier,
  type NotificationPrefs
} from './schemas'
export {
  MAX_MENTION_DIDS,
  normalizeMentions,
  mentionsInclude,
  isValidMentions,
  type MessageMentions
} from './schemas'
export {
  MAX_LINK_PREVIEWS_PER_MESSAGE,
  isMessageLinkPreview,
  sanitizeLinkPreviews,
  type MessageLinkPreview
} from './schemas'
export { extractMentions, getMentionedUsers, type Mention } from './schemas'
export { GrantSchema, type Grant } from './schemas'
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
  type RevocationLike,
  createAccountRecord,
  admitDeviceRecord,
  revokeSubjectRecord,
  revokeDeviceRecord,
  accountState,
  nextEpoch,
  type LedgerNodeIntent,
  evaluateLedgerWrite,
  foldAccountRecord,
  ledgerAccountId,
  ledgerWriteKind,
  type LedgerEnforcementState,
  type LedgerWriteDecision,
  type LedgerWriteKind
} from './schemas'
export { SavedViewSchema, type SavedView } from './schemas'
export { WorkspaceSchema, type Workspace, type WorkspaceTreeJson } from './schemas'
export {
  UserWidgetSchema,
  type UserWidget,
  type UserWidgetConfigField,
  type UserWidgetSize
} from './schemas'
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
} from './schemas'
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
} from './schemas'
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
} from './schemas'
export { builtInSchemas, type BuiltInSchemaIRI } from './schemas'

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
} from './schemas'

// Comment orphan detection
export {
  type OrphanReason,
  type OrphanStatus,
  type OrphanResolvers,
  checkOrphanStatus,
  filterOrphanedComments
} from './schemas'

// Schema registry
export { SchemaRegistry, schemaRegistry } from './registry'
export {
  SystemSchemaIndex,
  createNodeGraphSchemaResolver,
  isSchemaDefinitionNode,
  type SystemSchemaDefinitionRecord,
  type SystemSchemaIndexDiagnostic,
  type SystemSchemaIndexOptions,
  type SystemSchemaIndexStore
} from './system-index'
export {
  PresenceAggregator,
  bucketPresenceCount,
  getPresenceNoisePolicy,
  summarizePresenceNodes,
  type PresenceAggregatorOptions,
  type PresenceAggregatorStore,
  type PresenceSummaryDescriptor,
  type PresenceVisibilityResolver
} from './presence'

// Schema lens system (migrations)
export {
  type SchemaLens,
  type LensOperation,
  type MigrationResult,
  MigrationError,
  LensRegistry,
  lensRegistry
} from './lens'

// Lens builder utilities
export {
  rename,
  convert,
  addDefault,
  remove,
  transform,
  copy,
  merge,
  when,
  composeLens,
  createOperations,
  identity,
  promoteOverlay
} from './lens-builders'
