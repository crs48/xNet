/**
 * @xnet/data - Unified data layer for xNet
 *
 * This package provides:
 * - Schema system for typed Nodes (defineSchema, property helpers)
 * - NodeStore for event-sourced Node persistence with LWW conflict resolution
 * - Yjs CRDT document management (for rich text content)
 * - Built-in schemas (Page, Database, Task)
 */

// Schema system
export {
  // Node type
  type Node,
  type SchemaIRI,
  type DID,
  isNode,
  createNodeId,

  // Schema definition
  defineSchema,
  type DefineSchemaOptions,

  // Types
  type PropertyType,
  type PropertyDefinition,
  type PropertyBuilder,
  type Schema,
  type DefinedSchema,
  type ValidationResult,
  type ValidationError,
  type CreateNodeOptions,
  type InferPropertyType,
  type InferProperties,
  type InferCreateProps,
  type InferNode,

  // Property helpers
  text,
  number,
  checkbox,
  date,
  dateRange,
  select,
  multiSelect,
  person,
  relation,
  url,
  email,
  phone,
  file,
  created,
  updated,
  createdBy,

  // Property option types
  type TextOptions,
  type NumberOptions,
  type CheckboxOptions,
  type DateOptions,
  type DateRangeOptions,
  type DateRange,
  type SelectOptions,
  type SelectOption,
  type MultiSelectOptions,
  type PersonOptions,
  type RelationOptions,
  type UrlOptions,
  type EmailOptions,
  type PhoneOptions,
  type FileOptions,
  type FileRef,
  type CreatedOptions,
  type UpdatedOptions,
  type CreatedByOptions,

  // Built-in schemas
  PageSchema,
  type Page,
  DatabaseSchema,
  type Database,
  TaskSchema,
  type Task,
  CanvasSchema,
  type Canvas,
  CommentSchema,
  type Comment,
  builtInSchemas,
  type BuiltInSchemaIRI,

  // Comment anchor types
  type AnchorType,
  type TextAnchor,
  type CellAnchor,
  type RowAnchor,
  type ColumnAnchor,
  type CanvasPositionAnchor,
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
  isNodeAnchor,

  // Comment orphan detection
  type OrphanReason,
  type OrphanStatus,
  type OrphanResolvers,
  checkOrphanStatus,
  filterOrphanedComments,

  // Schema registry
  SchemaRegistry,
  schemaRegistry,

  // Schema lens system (migrations)
  type SchemaLens,
  type LensOperation,
  type MigrationResult,
  MigrationError,
  LensRegistry,
  lensRegistry,

  // Lens builder utilities
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
} from './schema'

// Types
export type {
  XDocument,
  DocumentType,
  DocumentMetadata,
  Block,
  BlockType,
  UpdateBatch
} from './types'

// Document operations
export {
  createDocument,
  loadDocument,
  getDocumentState,
  getStateVector,
  setDocumentTitle,
  setDocumentArchived,
  type CreateDocumentOptions
} from './document'

// Update handling
export {
  signUpdate,
  verifyUpdate,
  applySignedUpdate,
  captureUpdate,
  mergeDocuments,
  getMissingUpdates,
  type SignUpdateOptions
} from './updates'

// Block registry
export {
  registerBlockType,
  createBlock,
  validateBlock,
  getRegisteredBlockTypes,
  type BlockDefinition
} from './blocks/registry'

// Awareness/presence
export {
  createAwareness,
  setLocalPresence,
  clearLocalPresence,
  getRemotePresences,
  getAllPresences,
  onPresenceChange,
  getLocalClientId,
  generateUserColor,
  type UserPresence,
  type CursorPosition,
  type SelectionRange
} from './sync/awareness'

// NodeStore - Event-sourced storage for Nodes
export {
  NodeStore,
  MemoryNodeStorageAdapter,
  IndexedDBNodeStorageAdapter,
  type IndexedDBNodeStorageAdapterOptions,
  type NodeId,
  type PropertyKey,
  type NodePayload,
  type NodeChange,
  type PropertyTimestamp,
  type NodeState,
  type NodeStorageAdapter,
  type ListNodesOptions,
  type CountNodesOptions,
  type ConflictResult,
  type MergeConflict,
  type NodeStoreOptions,
  type CreateNodeOptions as CreateNodeStoreOptions,
  type UpdateNodeOptions,
  type TransactionOperation,
  type TransactionResult,
  type NodeChangeEvent,
  type NodeChangeListener,
  type GetWithMigrationOptions,
  type MigrationInfo,
  type MigratedNodeState,
  isTempId,
  TEMP_ID_PREFIX,
  resolveTempIds,
  createSchemaLookup,
  type SchemaLookup,
  type TempIdResolution
} from './store'

// Blob service
export { BlobService, type BlobServiceOptions } from './blob'

// Re-export Yjs for convenience
export {
  Doc as YDoc,
  Map as YMap,
  Array as YArray,
  Text as YText,
  XmlFragment as YXmlFragment
} from 'yjs'
