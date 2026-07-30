/**
 * @xnetjs/data/database - Database operations and types
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
  type GeoPoint,
  CELL_PREFIX,
  cellKey,
  isCellKey,
  columnIdFromKey,
  toCellProperties,
  fromCellProperties,
  isDateRange,
  isFileRef,
  isGeoPoint,
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

// ─── V2 node model: fields, select options, views ───────────────────────────

// Field types (V2 node model)
export {
  type FieldType,
  type FieldConfig,
  type FieldNode,
  type SelectOptionNode,
  type NumberFieldConfig,
  type TextFieldConfig,
  type RelationFieldConfig,
  type RollupFieldConfig,
  type FormulaFieldConfig,
  type DateFieldConfig,
  type FileFieldConfig,
  FIELD_TYPES,
  SELECT_COLORS,
  isFieldType,
  isSelectColor,
  autoColor,
  isNodeStoreFieldType,
  isComputedFieldType,
  isAutoFieldType,
  isYDocFieldType,
  toFieldNode,
  toSelectOptionNode
} from './field-types'

// Field operations (V2 node model)
export {
  type CreateFieldOptions,
  type UpdateFieldOptions,
  type CreateSelectOptionOptions,
  getFields,
  getField,
  getTitleField,
  createField,
  updateField,
  deleteField,
  moveField,
  duplicateField,
  getSelectOptions,
  getDatabaseSelectOptions,
  createSelectOption,
  updateSelectOption,
  deleteSelectOption,
  moveSelectOption
} from './field-operations'

// Extension field operations (custom columns on an existing schema)
export {
  type EnsureExtensionOptions,
  type CreateExtensionFieldOptions,
  ensureSchemaExtension,
  createExtensionField,
  renameExtensionField,
  deleteExtensionField
} from './extension-field-operations'

// View operations (V2 node model)
export {
  type ViewNode,
  type CreateViewOptions,
  type UpdateViewOptions,
  getViews as getViewNodes,
  getView as getViewNode,
  createView as createViewNode,
  updateView as updateViewNode,
  deleteView as deleteViewNode,
  duplicateView as duplicateViewNode,
  moveView,
  setViewFilters as setViewNodeFilters,
  setViewSorts as setViewNodeSorts,
  setViewGroupBy as setViewNodeGroupBy,
  toggleViewGroupCollapsed,
  setFieldHidden,
  setViewFieldWidth,
  setViewFieldOrder,
  effectiveFieldSortKey
} from './view-node-operations'

// Cell conversion for field type changes (V2 node model)
export {
  convertCellValue,
  cellValueToText,
  type ConvertContext,
  type ConvertedCell
} from './convert-cell'

// Database setup (V2 node model)
export { setupDatabase, type SetupDatabaseResult } from './database-setup'

// Database-defined schemas from field nodes (V2 node model)
export {
  DEFAULT_DATABASE_SCHEMA_VERSION,
  fieldsToStoredColumns,
  buildSchemaFromFields,
  getDatabaseSchemaIRI,
  createNodeDatabaseSchemaResolver
} from './schema-from-fields'

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
  deleteMeta,
  getDatabaseDocumentModel,
  type DatabaseDocumentModel
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

// Form view types and validation (exploration 0278)
export {
  type FormQuestion,
  type FormConfirmation,
  type FormViewConfig,
  type FormFieldRule,
  type FormAudience,
  type FormSubmissionMeta,
  type FormValidationError,
  type FormValidationResult,
  type PublicFormQuestion,
  type PublicFormDefinition,
  PUBLIC_SAFE_FORM_FIELD_TYPES,
  isFormFieldTypeAllowed,
  isFormQuestionVisible,
  visibleFormQuestions,
  validateFormSubmission,
  buildPublicFormDefinition,
  submissionRowId
} from './form-types'

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

// Summary engine (footer aggregations)
export {
  SUMMARY_FUNCTIONS_BY_TYPE,
  summaryFunctionLabel,
  isFilledValue,
  computeColumnSummary,
  type SummaryFunction,
  type SummaryRow,
  type SummaryColumnLike,
  type ColumnSummaryResult
} from './summary-engine'

// Row-height density tiers
export {
  ROW_HEIGHT_PX,
  ROW_HEIGHTS,
  DEFAULT_ROW_HEIGHT,
  rowHeightLabel,
  resolveRowHeightPx,
  asRowHeight,
  type RowHeight
} from './row-height'

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

// Schema resolver for database-defined schemas
export {
  createDatabaseSchemaResolver,
  extractSchemaFromDoc,
  getSchemaIRIFromDoc,
  type DocFetcher,
  type CreateDatabaseSchemaResolverOptions
} from './schema-resolver'

// Clone schema utilities
export {
  cloneSchema,
  cloneColumns,
  cloneSampleRows,
  generateColumnIdMap,
  remapViewColumnIds,
  type CloneSchemaOptions,
  type CloneSchemaResult,
  type CloneSourceData
} from './clone'
