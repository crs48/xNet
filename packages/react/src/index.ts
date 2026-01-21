/**
 * @xnet/react - React hooks for xNet
 */

// Context
export {
  XNetProvider,
  useXNet,
  type XNetConfig,
  type XNetContextValue,
  type XNetProviderProps
} from './context'

// Hooks
export { useDocument, type UseDocumentOptions, type UseDocumentResult } from './hooks/useDocument'

export { useQuery, type UseQueryOptions, type UseQueryResult } from './hooks/useQuery'

export { useSync, type UseSyncResult } from './hooks/useSync'

export { usePresence, type UsePresenceResult, type UserPresence } from './hooks/usePresence'

export { useIdentity, type UseIdentityResult } from './hooks/useIdentity'

export {
  useDocumentSync,
  type UseDocumentSyncOptions,
  type UseDocumentSyncResult
} from './hooks/useDocumentSync'

export { useEditor, type UseEditorOptions, type UseEditorResult } from './hooks/useEditor'

export {
  useNodeSync,
  type UseNodeSyncOptions,
  type UseNodeSyncResult,
  type NodePeerState
} from './hooks/useNodeSync'

export {
  NodeStoreProvider,
  useNodeStore,
  type NodeStoreContextValue,
  type NodeStoreProviderProps
} from './hooks/useNodeStore'

export {
  useNode,
  useNodes,
  type UseNodeOptions,
  type UseNodeResult,
  type UseNodesOptions,
  type UseNodesResult
} from './hooks/useNode'

// Schema-aware hooks (recommended)
export {
  useSchema,
  useSingleNode,
  type TypedNodeState,
  type UseSchemaOptions,
  type UseSchemaResult,
  type UseSingleNodeResult,
  type TypedTransactionOp
} from './hooks/useSchema'

// Store
export {
  createXNetStore,
  type XNetStore,
  type XNetState,
  type XNetActions,
  type DocumentState,
  type StoreConfig
} from './store/xnet'
