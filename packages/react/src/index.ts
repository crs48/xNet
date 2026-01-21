/**
 * @xnet/react - React hooks for xNet
 *
 * Core API (3 hooks):
 * - useQuery: Read nodes (list, single, filtered)
 * - useMutate: Write nodes (create, update, remove, transactions)
 * - useDocument: Y.Doc for rich text + sync + presence
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
 * useDocument - Y.Doc for rich text editing with sync and presence
 *
 * @example
 * ```tsx
 * const {
 *   data,           // FlatNode
 *   doc,            // Y.Doc
 *   update,         // Type-safe mutations
 *   syncStatus,     // 'offline' | 'connecting' | 'connected'
 *   remoteUsers,    // Collaborators
 * } = useDocument(PageSchema, pageId, {
 *   createIfMissing: { title: 'Untitled' },
 *   user: { name: 'Alice' }
 * })
 * ```
 */
export {
  useDocument,
  type UseDocumentOptions,
  type UseDocumentResult,
  type SyncStatus,
  type RemoteUser
} from './hooks/useDocument'

// =============================================================================
// Store Provider
// =============================================================================

export {
  NodeStoreProvider,
  useNodeStore,
  type NodeStoreContextValue,
  type NodeStoreProviderProps
} from './hooks/useNodeStore'

// =============================================================================
// Utilities
// =============================================================================

export {
  flattenNode,
  flattenNodes,
  extractProperties,
  isFlatNode,
  type NodeBase
} from './utils/flattenNode'

// =============================================================================
// Identity
// =============================================================================

export { useIdentity, type UseIdentityResult } from './hooks/useIdentity'

// =============================================================================
// Legacy (for backwards compatibility)
// =============================================================================

/** @deprecated Use useDocument instead */
export {
  useDocumentSync,
  type UseDocumentSyncOptions,
  type UseDocumentSyncResult
} from './hooks/useDocumentSync'

/** @deprecated Use useDocument instead */
export { useEditor, type UseEditorOptions, type UseEditorResult } from './hooks/useEditor'

/** @deprecated Use useDocument instead */
export {
  useNodeSync,
  type UseNodeSyncOptions,
  type UseNodeSyncResult,
  type NodePeerState
} from './hooks/useNodeSync'

// Legacy context
export {
  XNetProvider,
  useXNet,
  type XNetConfig,
  type XNetContextValue,
  type XNetProviderProps
} from './context'

// Legacy store
export {
  createXNetStore,
  type XNetStore,
  type XNetState,
  type XNetActions,
  type DocumentState,
  type StoreConfig
} from './store/xnet'
