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
  SetNodeOptions,
  ListNodesOptions,
  CountNodesOptions,
  ConflictResult,
  MergeConflict,
  NodeStoreOptions,
  CreateNodeOptions,
  UpdateNodeOptions,
  TransactionOperation,
  TransactionResult,
  NodeChangeEvent,
  NodeChangeListener,
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
  NodeQueryOptions,
  NodeQueryDescriptor,
  NodeQueryPlanMetadata,
  NodeQueryParityCheckMetadata,
  NodeQueryResult
} from './query'
export {
  createNodeQueryDescriptor,
  nodeQueryDescriptorToOptions,
  serializeNodeQueryDescriptor,
  matchesNodeQueryDescriptor,
  filterNodeQueryResults,
  sortNodeQueryResults,
  applyNodeQueryDescriptor,
  getNodeQuerySearchTokens,
  nodeQueryDescriptorNeedsBoundedReload,
  withoutNodeQueryPagination
} from './query'

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
