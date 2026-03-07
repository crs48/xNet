/**
 * @xnetjs/react/core - Stable provider and hook entrypoints
 */

export {
  useQuery,
  type FlatNode,
  type QueryFilter,
  type QueryListResult,
  type QuerySingleResult,
  type SortDirection,
  type MigrationWarning
} from './hooks/useQuery'
export {
  useMutate,
  type UseMutateResult,
  type MutateOp,
  type MutateCreate,
  type MutateUpdate,
  type MutateDelete,
  type MutateRestore
} from './hooks/useMutate'
export {
  useNode,
  type UseNodeOptions,
  type UseNodeResult,
  type SyncStatus,
  type PresenceUser
} from './hooks/useNode'
export { useIdentity, type UseIdentityResult } from './hooks/useIdentity'
export {
  XNetProvider,
  useXNet,
  type XNetConfig,
  type XNetContextValue,
  type XNetProviderProps
} from './context'
export { ErrorBoundary, type ErrorBoundaryProps } from './components/ErrorBoundary'
export {
  OfflineIndicator,
  useIsOffline,
  type OfflineIndicatorProps
} from './components/OfflineIndicator'
