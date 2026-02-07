/**
 * NodeStore - Event-sourced storage for Nodes
 *
 * @example
 * ```typescript
 * import { NodeStore, MemoryNodeStorageAdapter } from '@xnet/data'
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
  GetWithMigrationOptions,
  MigrationInfo,
  MigratedNodeState
} from './types'

// NodeStore
export { NodeStore } from './store'

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
  IndexedDBNodeStorageAdapter,
  type IndexedDBNodeStorageAdapterOptions
} from './indexeddb-adapter'
export { SQLiteNodeStorageAdapter } from './sqlite-adapter'
