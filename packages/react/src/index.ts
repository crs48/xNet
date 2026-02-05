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
 * const { create, update, remove, isPending } = useMutate()
 *
 * await create(TaskSchema, { title: 'New Task' })
 * await update(TaskSchema, taskId, { status: 'done' })
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
 *   presence,       // Presence list (live + hub snapshot)
 * } = useNode(PageSchema, pageId, {
 *   createIfMissing: { title: 'Untitled' },
 *   did: myDid
 * })
 * ```
 */
export {
  useNode,
  type UseNodeOptions,
  type UseNodeResult,
  type SyncStatus,
  type PresenceUser
} from './hooks/useNode'

/**
 * useComments - Universal hook for comments on any Node
 *
 * @example
 * ```tsx
 * const { threads, addComment, replyTo, resolveThread } = useComments({ nodeId: pageId })
 * ```
 */
export {
  useComments,
  type UseCommentsOptions,
  type UseCommentsResult,
  type CommentThread,
  type CommentNode,
  type AddCommentOptions,
  type ReplyContext
} from './hooks/useComments'

/**
 * useCommentCount - Get unresolved comment count for a Node
 *
 * @example
 * ```tsx
 * const count = useCommentCount(node.id)
 * // Show badge if count > 0
 * ```
 */
export { useCommentCount, useCommentCounts } from './hooks/useCommentCount'

// =============================================================================
// History
// =============================================================================

/**
 * useHistory - React hook for node history / time travel
 *
 * @example
 * ```tsx
 * const { timeline, materializeAt, diff, changeCount } = useHistory(nodeId)
 * ```
 */
export { useHistory, type UseHistoryResult } from './hooks/useHistory'

/**
 * useUndo - Per-node undo/redo via compensating changes
 *
 * @example
 * ```tsx
 * const { undo, redo, canUndo, canRedo } = useUndo(nodeId, { localDID })
 * ```
 */
export { useUndo, type UseUndoResult, type UseUndoOptions } from './hooks/useUndo'

/**
 * useAudit - Query the audit log for a node
 *
 * @example
 * ```tsx
 * const { entries, activity, loading } = useAudit(nodeId)
 * ```
 */
export { useAudit, type UseAuditResult, type UseAuditOptions } from './hooks/useAudit'

/**
 * useDiff - Compare node state between two points in time
 *
 * @example
 * ```tsx
 * const { diff, result, loading } = useDiff(nodeId)
 * await diff({ type: 'index', index: 0 }, { type: 'latest' })
 * ```
 */
export { useDiff, type UseDiffResult } from './hooks/useDiff'

/**
 * useBlame - Per-property attribution (who changed what)
 *
 * @example
 * ```tsx
 * const { blame, loading } = useBlame(nodeId)
 * ```
 */
export { useBlame, type UseBlameResult } from './hooks/useBlame'

/**
 * useVerification - Cryptographic chain verification
 *
 * @example
 * ```tsx
 * const { verify, result, loading } = useVerification(nodeId)
 * await verify()
 * ```
 */
export { useVerification, type UseVerificationResult } from './hooks/useVerification'

// =============================================================================
// Hub
// =============================================================================

export { useHubStatus } from './hooks/useHubStatus'

export { useBackup, type UseBackupReturn } from './hooks/useBackup'

export { useFileUpload, type FileRef, type UseFileUploadReturn } from './hooks/useFileUpload'

export {
  useHubSearch,
  type HubSearchOptions,
  type HubSearchResult,
  type HubSearchState
} from './hooks/useHubSearch'

export {
  useRemoteSchema,
  type RemoteSchemaDefinition,
  type RemoteSchemaState
} from './hooks/useRemoteSchema'

export { usePeerDiscovery, type DiscoveredPeer } from './hooks/usePeerDiscovery'

export { HubStatusIndicator } from './components/HubStatusIndicator'

export { ErrorBoundary, type ErrorBoundaryProps } from './components/ErrorBoundary'

export { Skeleton, injectSkeletonStyles, type SkeletonProps } from './components/Skeleton'

// =============================================================================
// Demo Mode
// =============================================================================

export { DemoBanner, type DemoBannerProps } from './components/DemoBanner'

export { DemoQuotaIndicator, type DemoQuotaIndicatorProps } from './components/DemoQuotaIndicator'

export { DemoDataExpiredScreen } from './components/DemoDataExpiredScreen'

export {
  useDemoMode,
  type DemoModeState,
  type DemoLimits,
  type DemoUsage
} from './hooks/useDemoMode'

export {
  OfflineIndicator,
  useIsOffline,
  type OfflineIndicatorProps
} from './components/OfflineIndicator'

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
  NodeStoreSyncProvider,
  type SerializedNodeChange,
  type NodeSyncResponse
} from './sync/node-store-sync-provider'

export {
  createRegistry,
  type Registry,
  type RegistryConfig,
  type RegistryStorage,
  type TrackedNode
} from './sync/registry'

export {
  createMetaBridge,
  type MetaBridge,
  METABRIDGE_ORIGIN,
  METABRIDGE_SEED_ORIGIN
} from './sync/meta-bridge'

export {
  createOfflineQueue,
  type OfflineQueue,
  type OfflineQueueConfig,
  type QueueEntry
} from './sync/offline-queue'

export { type BlobStoreForSync } from './sync/blob-sync'

// =============================================================================
// Identity
// =============================================================================

export { useIdentity, type UseIdentityResult } from './hooks/useIdentity'

// =============================================================================
// Onboarding
// =============================================================================

export {
  OnboardingProvider,
  useOnboarding,
  OnboardingFlow,
  WelcomeScreen,
  AuthenticatingScreen,
  AuthErrorScreen,
  UnsupportedBrowserScreen,
  ImportIdentityScreen,
  HubConnectScreen,
  ReadyScreen,
  SmartWelcome,
  SyncProgressOverlay,
  onboardingReducer,
  createInitialState,
  QUICK_START_TEMPLATES,
  getPlatformAuthName,
  truncateDid,
  copyToClipboard,
  type OnboardingProviderProps,
  type OnboardingContextValue,
  type OnboardingFlowProps,
  type OnboardingState,
  type OnboardingEvent,
  type OnboardingMachineContext,
  type OnboardingReducerState,
  type QuickStartTemplate,
  type SyncProgressOverlayProps
} from './onboarding/index'

// =============================================================================
// Initial Sync
// =============================================================================

export {
  createInitialSyncManager,
  type InitialSyncManager,
  type InitialSyncMessage,
  type SyncProgress,
  type SyncPhase,
  type ProgressListener
} from './sync/InitialSyncManager'

// =============================================================================
// Provider
// =============================================================================

export {
  XNetProvider,
  useXNet,
  type XNetConfig,
  type XNetContextValue,
  type XNetProviderProps
} from './context'

// =============================================================================
// Plugin System
// =============================================================================

export {
  PluginRegistryContext,
  usePluginRegistry,
  usePluginRegistryOptional,
  usePlugins,
  useContributions,
  useViews,
  useCommands,
  useSlashCommands,
  useSidebarItems,
  useEditorExtensions,
  useEditorExtensionsSafe,
  useView,
  useCommand
} from './hooks/usePlugins'

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
