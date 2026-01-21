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
 *   schemaId: 'xnet://xnet.dev/Task',
 *   properties: { title: 'My Task', status: 'todo' }
 * })
 *
 * // Update
 * await store.update(task.id, { properties: { status: 'done' } })
 *
 * // List
 * const tasks = await store.list({ schemaId: 'xnet://xnet.dev/Task' })
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
  UpdateNodeOptions
} from './types'

// NodeStore
export { NodeStore } from './store'

// Adapters
export { MemoryNodeStorageAdapter } from './memory-adapter'
