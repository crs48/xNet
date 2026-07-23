/**
 * NodeStore - Event-sourced storage for Nodes
 *
 * @example
 * ```typescript
 * import { NodeStore, MemoryNodeStorageAdapter } from '@xnetjs/data'
 *
 * const adapter = new MemoryNodeStorageAdapter()
 * const store = new NodeStore({
 *   storage: adapter,
 *   authorDID: 'did:key:z6Mk...',
 *   signingKey: privateKey
 * })
 *
 * await store.initialize()
 *
 * // Create a node
 * const task = await store.create({
 *   schemaId: 'xnet://xnet.fyi/Task',
 *   properties: { title: 'My Task', status: 'todo' }
 * })
 *
 * // Update
 * await store.update(task.id, { properties: { status: 'done' } })
 *
 * // List
 * const tasks = await store.list({ schemaId: 'xnet://xnet.fyi/Task' })
 * ```
 */

// Types
export type {
  NodeId,
  PropertyKey,
  NodePayload,
  NodeChange,
  PropertyTimestamp,
  NodeState,
  NodeStorageAdapter,
  CheckedOutDraftOverlay,
  PinEntry,
  PinRegistry,
  SetNodeOptions,
  ImportNodesOptions,
  RebuildNodeIndexesOptions,
  ApplyNodeBatchInput,
  ApplyNodeBatchResult,
  NodeBatchIndexMode,
  NodeBatchNotificationMode,
  NodeBatchSyncMode,
  NodeBatchPreflightResult,
  NodeBatchWriteInput,
  DeterministicNodeBatchWriteInput,
  OperationNodeBatchWriteInput,
  NodeBatchWritePolicy,
  NodeBatchWriteResult,
  NodeBatchWriteTimings,
  ListNodesOptions,
  CountNodesOptions,
  NodeTextSearchResult,
  ConflictResult,
  MergeConflict,
  NodeStoreOptions,
  CreateNodeOptions,
  UpdateNodeOptions,
  DeterministicNodeImportDraft,
  ImportDeterministicNodesOptions,
  ImportDeterministicNodesResult,
  TransactionOperation,
  TransactionResult,
  NodeChangeEvent,
  NodeChangeListener,
  NodeBatchChangeEvent,
  NodeBatchChangeListener,
  PropertyLookup,
  NodeContentCipher,
  ContentKeyCache,
  GetWithMigrationOptions,
  MigrationInfo,
  MigratedNodeState
} from './types'

export type {
  SortDirection,
  SystemOrderField,
  NodeQuerySpatialPoint,
  NodeQuerySpatialRect,
  NodeQuerySpatialPointFields,
  NodeQuerySpatialRectFields,
  NodeQuerySpatialWindow,
  NodeQuerySpatialRadius,
  NodeQuerySpatialFilter,
  NodeQuerySearchField,
  NodeQuerySearchFilter,
  NodeQueryMaterializedViewOptions,
  NodeQueryPageCountMode,
  NodeQueryPageOptions,
  NodeQueryCursorOrderEntry,
  NodeQueryCursor,
  NodeQueryOptions,
  NodeQueryDescriptor,
  NodeQueryPlanMetadata,
  NodeQueryParityCheckMetadata,
  NodeQueryResult
} from './query'
export {
  createNodeQueryDescriptor,
  encodeNodeQueryCursor,
  decodeNodeQueryCursor,
  nodeQueryDescriptorToOptions,
  serializeNodeQueryDescriptor,
  matchesNodeQueryDescriptor,
  filterNodeQueryResults,
  sortNodeQueryResults,
  applyNodeQueryDescriptor,
  getNodeQuerySearchTokens,
  nodeQueryDescriptorNeedsBoundedReload,
  withoutNodeQueryPagination,
  withoutNodeQueryMaterializedView
} from './query'
export type {
  QueryASTVersion,
  QueryASTField,
  QueryASTSchemaInput,
  QueryASTOperator,
  QueryASTComparisonPredicate,
  QueryASTCompoundPredicate,
  QueryASTNotPredicate,
  QueryASTPredicate,
  QueryASTOrderBy,
  QueryASTPage,
  QueryASTRelationDirection,
  QueryASTRelationInclude,
  QueryASTIncludes,
  QueryASTAggregateFunction,
  QueryASTAggregate,
  QueryASTQuerySetAggregate,
  QueryASTNodeQuery,
  QueryASTQuerySet,
  QueryAST,
  QueryASTNodeQueryOptions,
  QueryASTRelationIncludeOptions,
  QueryASTValidationError,
  QueryASTValidationResult,
  QueryASTRelationIndexRequirement,
  QueryASTAggregatePlan,
  QueryASTAggregateGroup,
  QueryASTAggregateResult,
  QueryASTAggregateExecution,
  QueryASTPlannerGate,
  SavedViewDescriptor,
  SavedViewPresentationHint,
  SavedViewPresentationHintMode,
  SavedViewFeedLayout,
  SavedViewFeedDensity
} from './query-ast'
export {
  QUERY_AST_VERSION,
  eq,
  neq,
  gt,
  gte,
  lt,
  lte,
  between,
  includesAny,
  contains,
  startsWith,
  isNull,
  isNotNull,
  and,
  or,
  not,
  queryOperators,
  defineNodeQueryAST,
  follow,
  from,
  count,
  countDistinct,
  sum,
  avg,
  min,
  max,
  groupBy,
  having,
  defineQuerySetAST,
  dashboardQuerySet,
  querySetCount,
  defineSavedViewDescriptor,
  validateQueryAST,
  validateSavedViewDescriptor,
  planQueryASTAggregates,
  executeQueryASTLoadedAggregates,
  filterQueryASTLoadedRows,
  getQueryASTRelationIndexRequirements,
  matchesQueryASTLoadedRow,
  evaluateQueryASTPlannerGate
} from './query-ast'

// NodeStore
export { NodeStore } from './store'
export { PermissionError } from './permission-error'

// Temp ID utilities
export {
  isTempId,
  TEMP_ID_PREFIX,
  resolveTempIds,
  createSchemaLookup,
  createPropertyLookup,
  type SchemaLookup,
  type TempIdResolution
} from './tempids'

// Adapters
export { MemoryNodeStorageAdapter } from './memory-adapter'
export {
  SQLiteNodeStorageAdapter,
  createNodeStorageAdapter,
  type SQLiteAdaptiveIndexingOptions,
  type SQLiteQueryVerificationOptions,
  type SQLiteNodeStorageAdapterOptions
} from './sqlite-adapter'
