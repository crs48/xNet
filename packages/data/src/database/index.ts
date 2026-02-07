/**
 * @xnet/data/database - Database operations and types
 *
 * This module provides the core data model for Notion-like databases:
 * - DatabaseRow nodes with per-cell LWW conflict resolution
 * - Cell value types and utilities
 * - Column definitions stored in Y.Doc (CRDT ordering)
 * - View configurations stored in Y.Doc
 * - Rich text cell support via Y.Doc
 * - Row CRUD operations
 */

// Cell types and utilities
export {
  type CellValue,
  type FileRef,
  type DateRange,
  CELL_PREFIX,
  cellKey,
  isCellKey,
  columnIdFromKey,
  toCellProperties,
  fromCellProperties,
  isDateRange,
  isFileRef,
  isCellValue
} from './cell-types'

// Row operations
export {
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
  checkNeedsRebalancing
} from './row-operations'

// Fractional indexing
export {
  generateSortKey,
  generateSortKeyWithJitter,
  isValidSortKey,
  compareSortKeys,
  rebalanceSortKeys,
  needsRebalancing,
  MAX_KEY_LENGTH
} from './fractional-index'

// Rich text cell support
export {
  RICHTEXT_PREFIX,
  getRichTextCell,
  hasRichTextContent,
  hasRichTextColumns,
  getRichTextColumnIds,
  deleteRichTextCell,
  getRichTextPlainText
} from './rich-text-cell'

// Column types and configs
export {
  type ColumnType,
  type ColumnDefinition,
  type ColumnConfig,
  type EmptyConfig,
  type TextColumnConfig,
  type NumberColumnConfig,
  type SelectColumnConfig,
  type SelectOption,
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
  isYDocColumnType
} from './column-types'

// Database doc initialization
export {
  initializeDatabaseDoc,
  isDatabaseDocInitialized,
  addDefaultTitleColumn,
  addDefaultTableView,
  setupNewDatabase,
  getMeta,
  setMeta,
  deleteMeta
} from './database-doc'

// Column operations
export {
  getColumns,
  getColumn,
  getColumnIndex,
  getTitleColumn,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumn,
  duplicateColumn
} from './column-operations'

// View types
export {
  type ViewType,
  type ViewConfig,
  type FilterGroup,
  type FilterCondition,
  type FilterOperator,
  type SortConfig,
  isFilterGroup,
  isFilterCondition,
  supportsGrouping,
  requiresDateColumn
} from './view-types'

// View operations
export {
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
  setColumnWidth
} from './view-operations'

// Filter operators
export {
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  getOperatorsForType,
  isValidOperator,
  getOperatorLabel,
  operatorRequiresValue
} from './filter-operators'

// Filter engine
export {
  filterRows,
  createEqualsFilter,
  createAnyOfFilter,
  combineFiltersAnd,
  combineFiltersOr,
  type FilterableRow
} from './filter-engine'

// Sort engine
export {
  sortRows,
  createSort,
  toggleSortDirection,
  addOrToggleSort,
  removeSort,
  type SortableRow
} from './sort-engine'

// Group engine
export {
  groupRows,
  toggleGroupCollapsed as toggleGroupCollapsedState,
  expandAllGroups,
  collapseAllGroups,
  type GroupableRow,
  type GroupConfig,
  type RowGroup,
  type GroupAggregates
} from './group-engine'

// Query pipeline
export {
  executeQuery,
  createFilterQuery,
  createSortQuery,
  createPaginatedQuery,
  flattenGroups,
  getTotalFromGroups,
  type QueryableRow,
  type QueryOptions,
  type QueryResult
} from './query-pipeline'

// Query router
export {
  QueryRouter,
  createQueryRouter,
  DEFAULT_ROUTER_CONFIG,
  type QuerySource,
  type QueryRouterConfig,
  type QueryRouterResult,
  type RouteOptions
} from './query-router'

// Row cache
export {
  RowCache,
  createRowCache,
  DEFAULT_CACHE_CONFIG,
  type CachedRow,
  type RowCacheConfig,
  type CacheStats
} from './row-cache'

// Rollup engine
export {
  aggregate,
  getEmptyValue,
  computeRollup,
  batchComputeRollups,
  validateRollupConfig,
  isNumericAggregation,
  getAggregationResultType,
  type RollupRow,
  type RollupContext
} from './rollup-engine'

// Formula module
export {
  FormulaParser,
  evaluate,
  safeEvaluate,
  FUNCTIONS,
  isValidFunction,
  getFunction,
  getFunctionNames,
  extractDependencies,
  detectCircularDependencies,
  wouldCreateCircular,
  buildDependencyGraph,
  getAffectedColumns,
  getEvaluationOrder,
  type ASTNode,
  type EvalContext,
  type FormulaFunction,
  type CircularCheckResult,
  type DependencyGraph
} from './formula'

// Formula service
export {
  FormulaService,
  createFormulaService,
  type FormulaRow,
  type FormulaValidationResult
} from './formula-service'

// Computed cache
export {
  ComputedCache,
  createComputedCache,
  batchInvalidate,
  computeInputHash,
  isEntryValid,
  DEFAULT_COMPUTED_CACHE_CONFIG,
  type ComputedCacheEntry,
  type ComputedCacheConfig,
  type ComputedCacheStats
} from './computed-cache'

// Import module (CSV/JSON parsing)
export {
  parseCSV,
  parseCSVLine,
  guessColumnType,
  parseValue,
  parseRow,
  inferColumnTypes,
  parseJSON,
  inferColumnsFromRows,
  inferTypeFromValues,
  toColumnDefinitions,
  validateJsonData,
  type ParsedCSV,
  type CsvParseOptions,
  type ParsedJSON,
  type InferredColumn,
  type JsonParseOptions
} from './import'

// Export module (CSV/JSON export)
export {
  exportToCsv,
  escapeCSV,
  formatValue,
  createCsvBlob,
  downloadCsv,
  exportToJson,
  exportToJsonArray,
  exportToNdjson,
  createJsonBlob,
  downloadJson,
  type ExportRow,
  type CsvExportOptions,
  type JsonExportOptions,
  type ExportedJSON,
  type ExportedColumn
} from './export'

// Templates module
export {
  BUILTIN_TEMPLATES,
  getTemplatesByCategory,
  searchTemplates,
  getTemplateById,
  getTemplateCategoryCounts,
  instantiateTemplate,
  createEmptyTemplate,
  createEmptyDatabase,
  createTemplateFromDatabase,
  sanitizeValueForTemplate,
  validateTemplate,
  type DatabaseTemplate,
  type TemplateCategory,
  type TemplateColumn,
  type TemplateView,
  type TemplateSampleRow,
  type TemplateMetadata,
  type InstantiateOptions,
  type InstantiatedDatabase,
  type InstantiatedColumn,
  type InstantiatedView,
  type InstantiatedRow,
  type SaveTemplateOptions,
  type DatabaseForTemplate
} from './templates'

// Schema utilities for database-defined schemas
export {
  buildSchemaIRI,
  parseDatabaseSchemaIRI,
  isDatabaseSchemaIRI,
  parseVersion,
  bumpSchemaVersion,
  createInitialSchemaMetadata,
  buildDatabaseSchema,
  createVersionEntry,
  pruneVersionHistory,
  getVersionBumpType,
  DATABASE_SCHEMA_NAMESPACE,
  DATABASE_SCHEMA_PREFIX,
  MAX_VERSION_HISTORY,
  type DatabaseSchemaMetadata,
  type StoredColumn,
  type SchemaVersionEntry,
  type VersionBumpType
} from './schema-utils'
