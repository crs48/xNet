/**
 * @xnetjs/react/experimental - Secondary and still-converging surfaces
 */

export {
  usePageTaskSync,
  type PageTaskInput,
  type PageTaskReferenceInput,
  type UsePageTaskSyncOptions,
  type UsePageTaskSyncResult
} from './hooks/usePageTaskSync'
export {
  useTasks,
  type UseTasksOptions,
  type UseTasksResult,
  type TaskTreeItem
} from './hooks/useTasks'
export {
  useComments,
  type UseCommentsOptions,
  type UseCommentsResult,
  type CommentThread,
  type CommentNode,
  type AddCommentOptions,
  type ReplyContext
} from './hooks/useComments'
export { useCommentCount, useCommentCounts } from './hooks/useCommentCount'
export { useHistory, type UseHistoryResult } from './hooks/useHistory'
export { useUndo, type UseUndoResult, type UseUndoOptions } from './hooks/useUndo'
export { useAudit, type UseAuditResult, type UseAuditOptions } from './hooks/useAudit'
export { useDiff, type UseDiffResult } from './hooks/useDiff'
export { useBlame, type UseBlameResult } from './hooks/useBlame'
export { useVerification, type UseVerificationResult } from './hooks/useVerification'
export { useHubStatus } from './hooks/useHubStatus'
export { useCan, type UseCanResult } from './hooks/useCan'
export { useCanEdit, type UseCanEditResult } from './hooks/useCanEdit'
export { useGrants, type GrantInput, type UseGrantsResult } from './hooks/useGrants'
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
export { Skeleton, injectSkeletonStyles, type SkeletonProps } from './components/Skeleton'
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
  flattenNode,
  flattenNodes,
  flattenUnknownSchemaNode,
  flattenNodesWithSchemaCheck,
  type FlattenNodeOptions
} from './utils/flattenNode'
export {
  WebSocketSyncProvider,
  type WebSocketSyncProviderOptions
} from './sync/WebSocketSyncProvider'
export {
  createSyncManager,
  type SyncManager,
  type SyncManagerConfig,
  type SyncLifecyclePhase,
  type SyncLifecycleState,
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
export {
  createInitialSyncManager,
  type InitialSyncManager,
  type InitialSyncMessage,
  type SyncProgress,
  type SyncPhase,
  type ProgressListener
} from './sync/InitialSyncManager'
export { PageTasksPanel, type PageTasksPanelProps } from './components/PageTasksPanel'
export {
  TaskCollectionEmbed,
  type TaskCollectionEmbedProps
} from './components/TaskCollectionEmbed'
export {
  SecurityProvider,
  useSecurityContext,
  useSecurityContextOptional,
  type SecurityContextState,
  type SecurityContextActions,
  type SecurityContextValue,
  type SecurityProviderProps
} from './context/security-context'
export { useSecurity, type UseSecurityOptions, type UseSecurityResult } from './hooks/useSecurity'
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
export {
  InstrumentationContext,
  useInstrumentation,
  type InstrumentationContextValue,
  type QueryTrackerLike,
  type YDocRegistryLike
} from './instrumentation'
export {
  TelemetryContext,
  useTelemetryReporter,
  type TelemetryReporter
} from './context/telemetry-context'
