/**
 * @xnet/react - React hooks for xNet
 *
 * Core API (3 hooks):
 * - useQuery: Read nodes (list, single, filtered)
 * - useMutate: Write nodes (create, update, remove, transactions)
 * - useNode: Load a Node with Y.Doc, sync, presence, and mutations
 */

// =============================================================================
// Core Hooks
// =============================================================================

/**
 * useQuery - Read nodes from the store
 *
 * @example
 * ```tsx
 * // List all tasks
 * const { data: tasks } = useQuery(TaskSchema)
 *
 * // Single task by ID
 * const { data: task } = useQuery(TaskSchema, taskId)
 *
 * // Filtered and sorted
 * const { data } = useQuery(TaskSchema, {
 *   where: { status: 'todo' },
 *   orderBy: { createdAt: 'desc' }
 * })
 * ```
 */
export {
  useQuery,
  type FlatNode,
  type QueryFilter,
  type QueryListResult,
  type QuerySingleResult,
  type SortDirection
} from './hooks/useQuery'

/**
 * useMutate - Write operations for nodes
 *
 * @example
 * ```tsx
 * const { create, update, updateTyped, remove, isPending } = useMutate()
 *
 * await create(TaskSchema, { title: 'New Task' })
 * await updateTyped(TaskSchema, taskId, { status: 'done' })
 * await remove(taskId)
 * ```
 */
export {
  useMutate,
  type UseMutateResult,
  type MutateOp,
  type MutateCreate,
  type MutateUpdate,
  type MutateDelete,
  type MutateRestore,
  type MutateOptions
} from './hooks/useMutate'

/**
 * useNode - Load a Node with Y.Doc, sync, presence, and mutations
 *
 * @example
 * ```tsx
 * const {
 *   data,           // FlatNode
 *   doc,            // Y.Doc
 *   update,         // Type-safe mutations
 *   syncStatus,     // 'offline' | 'connecting' | 'connected'
 *   remoteUsers,    // Collaborators
 * } = useNode(PageSchema, pageId, {
 *   createIfMissing: { title: 'Untitled' },
 *   did: myDid
 * })
 * ```
 */
export {
  useNode,
  // Backwards-compatible aliases
  useDocument,
  type UseNodeOptions,
  type UseNodeResult,
  type UseDocumentOptions,
  type UseDocumentResult,
  type SyncStatus,
  type RemoteUser
} from './hooks/useDocument'

// =============================================================================
// Utilities
// =============================================================================

export { flattenNode, flattenNodes } from './utils/flattenNode'

// =============================================================================
// Sync
// =============================================================================

export {
  WebSocketSyncProvider,
  type WebSocketSyncProviderOptions
} from './sync/WebSocketSyncProvider'

export {
  createSyncManager,
  type SyncManager,
  type SyncManagerConfig,
  type SyncStatus as SyncManagerStatus
} from './sync/sync-manager'

export { useSyncManager } from './hooks/useSyncManager'

export {
  createNodePool,
  type NodePool,
  type NodePoolConfig,
  type PoolEntryState
} from './sync/node-pool'

export {
  createConnectionManager,
  type ConnectionManager,
  type ConnectionManagerConfig,
  type ConnectionStatus
} from './sync/connection-manager'

export {
  createRegistry,
  type Registry,
  type RegistryConfig,
  type RegistryStorage,
  type TrackedNode
} from './sync/registry'

export { createMetaBridge, type MetaBridge } from './sync/meta-bridge'

export {
  createOfflineQueue,
  type OfflineQueue,
  type OfflineQueueConfig,
  type QueueEntry
} from './sync/offline-queue'

export {
  createBlobSyncProvider,
  type BlobSyncProvider,
  type BlobSyncProviderConfig,
  type BlobStoreForSync,
  type BlobSyncMessage,
  BLOB_SYNC_ROOM
} from './sync/blob-sync'

// =============================================================================
// Identity
// =============================================================================

export { useIdentity, type UseIdentityResult } from './hooks/useIdentity'

// =============================================================================
// Provider
// =============================================================================

export {
  XNetProvider,
  type XNetConfig,
  type XNetContextValue,
  type XNetProviderProps
} from './context'

// =============================================================================
// Instrumentation (for DevTools integration)
// =============================================================================

export {
  InstrumentationContext,
  useInstrumentation,
  type InstrumentationContextValue,
  type QueryTrackerLike,
  type YDocRegistryLike
} from './instrumentation'
