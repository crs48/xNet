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
  DatabaseRowSchema,
  type DatabaseRow,
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

// Database operations
export {
  // Cell types and utilities
  type CellValue,
  type FileRef as CellFileRef,
  type DateRange as CellDateRange,
  CELL_PREFIX,
  cellKey,
  isCellKey,
  columnIdFromKey,
  toCellProperties,
  fromCellProperties,
  isDateRange as isCellDateRange,
  isFileRef as isCellFileRef,
  isCellValue,

  // Row operations
  type CreateRowOptions,
  type QueryRowsOptions,
  type QueryRowsResult,
  type DatabaseRowNode,
  createRow,
  updateCell,
  updateCells,
  deleteRow,
  getRow,
  queryRows,
  moveRow,
  rebalanceDatabase,
  checkNeedsRebalancing,

  // Fractional indexing
  generateSortKey,
  generateSortKeyWithJitter,
  isValidSortKey,
  compareSortKeys,
  rebalanceSortKeys,
  needsRebalancing,
  MAX_KEY_LENGTH,

  // Rich text cell support
  RICHTEXT_PREFIX,
  getRichTextCell,
  hasRichTextContent,
  hasRichTextColumns,
  getRichTextColumnIds,
  deleteRichTextCell,
  getRichTextPlainText,

  // Column types and configs
  type ColumnType,
  type ColumnDefinition,
  type ColumnConfig,
  type EmptyConfig,
  type TextColumnConfig,
  type NumberColumnConfig,
  type SelectColumnConfig,
  type SelectOption as ColumnSelectOption,
  type SelectColor,
  type RelationColumnConfig,
  type RollupColumnConfig,
  type RollupAggregation,
  type FormulaColumnConfig,
  type DateColumnConfig,
  type FileColumnConfig,
  isNodeStoreColumnType,
  isComputedColumnType,
  isAutoColumnType,
  isYDocColumnType,

  // Database doc initialization
  initializeDatabaseDoc,
  isDatabaseDocInitialized,
  addDefaultTitleColumn,
  addDefaultTableView,
  setupNewDatabase,
  getMeta,
  setMeta,
  deleteMeta,

  // Column operations
  getColumns,
  getColumn,
  getColumnIndex,
  getTitleColumn,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumn,
  duplicateColumn,

  // View types
  type ViewType,
  type ViewConfig,
  type FilterGroup,
  type FilterCondition,
  type FilterOperator,
  type SortConfig,
  isFilterGroup,
  isFilterCondition,
  supportsGrouping,
  requiresDateColumn,

  // View operations
  getViews,
  getView,
  getViewByType,
  createView,
  updateView,
  deleteView,
  duplicateView,
  setViewFilters,
  clearViewFilters,
  setViewSorts,
  addViewSort,
  removeViewSort,
  clearViewSorts,
  setViewGroupBy,
  toggleGroupCollapsed,
  setVisibleColumns,
  showColumn,
  hideColumn,
  reorderViewColumns,
  setColumnWidth,

  // Filter operators
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  getOperatorsForType,
  isValidOperator,
  getOperatorLabel,
  operatorRequiresValue,

  // Filter engine
  filterRows,
  createEqualsFilter,
  createAnyOfFilter,
  combineFiltersAnd,
  combineFiltersOr,
  type FilterableRow,

  // Sort engine
  sortRows,
  createSort,
  toggleSortDirection,
  addOrToggleSort,
  removeSort,
  type SortableRow,

  // Group engine
  groupRows,
  toggleGroupCollapsedState,
  expandAllGroups,
  collapseAllGroups,
  type GroupableRow,
  type GroupConfig,
  type RowGroup,
  type GroupAggregates,

  // Query pipeline
  executeQuery,
  createFilterQuery,
  createSortQuery,
  createPaginatedQuery,
  flattenGroups,
  getTotalFromGroups,
  type QueryableRow,
  type QueryOptions,
  type QueryResult
} from './database'

// Re-export Yjs for convenience
export {
  Doc as YDoc,
  Map as YMap,
  Array as YArray,
  Text as YText,
  XmlFragment as YXmlFragment
} from 'yjs'
