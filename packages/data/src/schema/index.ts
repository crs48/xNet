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
  type TextOptions,
  type NumberOptions,
  type CheckboxOptions,
  type JsonOptions
} from './properties'

// Property helpers - Temporal
export {
  date,
  dateRange,
  type DateOptions,
  type DateRangeOptions,
  type DateRange
} from './properties'

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
export { DatabaseSchema, type Database } from './schemas'
export { DatabaseRowSchema, type DatabaseRow } from './schemas'
export { DatabaseFieldSchema, type DatabaseField } from './schemas'
export { DatabaseSelectOptionSchema, type DatabaseSelectOption } from './schemas'
export { DatabaseViewSchema, type DatabaseView } from './schemas'
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
export { ExternalReferenceSchema, type ExternalReference } from './schemas'
export { MediaAssetSchema, type MediaAsset } from './schemas'
export { CanvasSchema, type Canvas } from './schemas'
export { CommentSchema, type Comment } from './schemas'
export { ReactionSchema, type Reaction } from './schemas'
export { GrantSchema, type Grant } from './schemas'
export { SavedViewSchema, type SavedView } from './schemas'
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
  identity
} from './lens-builders'
