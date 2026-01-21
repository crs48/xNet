/**
 * @xnet/react - React hooks for xNet
 *
 * Simplified API:
 * - useQuery: All read operations (list, single, filtered)
 * - useMutate: All write operations (create, update, remove, transactions)
 */

// =============================================================================
// Core Data Hooks (Recommended)
// =============================================================================

// Reads
export {
  useQuery,
  type TypedNode,
  type QueryFilter,
  type QueryListResult,
  type QuerySingleResult
} from './hooks/useQuery'

// Writes
export {
  useMutate,
  type UseMutateResult,
  type MutateOp,
  type MutateCreate,
  type MutateUpdate,
  type MutateDelete,
  type MutateRestore
} from './hooks/useMutate'

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
// Document Hooks (Rich Text / Yjs)
// =============================================================================

export {
  useDocument,
  type UseDocumentOptions,
  type UseDocumentResult,
  type SyncStatus
} from './hooks/useDocument'

/**
 * @deprecated Use `useDocument` instead, which includes built-in sync support.
 */
export {
  useDocumentSync,
  type UseDocumentSyncOptions,
  type UseDocumentSyncResult
} from './hooks/useDocumentSync'

export { useEditor, type UseEditorOptions, type UseEditorResult } from './hooks/useEditor'

// =============================================================================
// Sync & Presence
// =============================================================================

export { useSync, type UseSyncResult } from './hooks/useSync'

export { usePresence, type UsePresenceResult, type UserPresence } from './hooks/usePresence'

export {
  useNodeSync,
  type UseNodeSyncOptions,
  type UseNodeSyncResult,
  type NodePeerState
} from './hooks/useNodeSync'

// =============================================================================
// Identity
// =============================================================================

export { useIdentity, type UseIdentityResult } from './hooks/useIdentity'

// =============================================================================
// Legacy Context (for XNetProvider users)
// =============================================================================

export {
  XNetProvider,
  useXNet,
  type XNetConfig,
  type XNetContextValue,
  type XNetProviderProps
} from './context'

// =============================================================================
// Store (Zustand)
// =============================================================================

export {
  createXNetStore,
  type XNetStore,
  type XNetState,
  type XNetActions,
  type DocumentState,
  type StoreConfig
} from './store/xnet'
