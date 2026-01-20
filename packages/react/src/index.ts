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
export {
  useDocument,
  type UseDocumentOptions,
  type UseDocumentResult
} from './hooks/useDocument'

export {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult
} from './hooks/useQuery'

export {
  useSync,
  type UseSyncResult
} from './hooks/useSync'

export {
  usePresence,
  type UsePresenceResult,
  type UserPresence
} from './hooks/usePresence'

export {
  useIdentity,
  type UseIdentityResult
} from './hooks/useIdentity'

// Store
export {
  createXNetStore,
  type XNetStore,
  type XNetState,
  type XNetActions,
  type DocumentState,
  type StoreConfig
} from './store/xnet'
