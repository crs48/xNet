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
export { useFind, type UseFindOptions, type UseFindResult } from './hooks/useFind'
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
export {
  useVisibleComments,
  useModeratedThread,
  createModerationLabelIndex,
  evaluateCommentModeration,
  evaluateInteractionPermission,
  moderateThread,
  selectActiveInteractionPolicy,
  selectPublicInteractionMode,
  summarizeModerationLabel,
  summarizePublicInteractionPolicy,
  type CommentVisibility,
  type FirstContactMode,
  type InteractionPermission,
  type ModeratedCommentNode,
  type ModeratedCommentThread,
  type ModerationFilterOptions,
  type ModerationLabelSummary,
  type PublicInteractionMode,
  type PublicInteractionPolicySnapshot,
  type PublicInteractionSurface,
  type PublicModerationMode,
  type UseModeratedThreadOptions,
  type UseVisibleCommentsOptions,
  type UseVisibleCommentsResult
} from './hooks/useModeratedComments'
export {
  usePolicyFilteredReactionCounters,
  createReactionCounterSnapshot,
  dedupeReactions,
  isReactionVisible,
  summarizeReactionNode,
  type AddReactionOptions,
  type ReactionCounterSnapshot,
  type ReactionNode,
  type ReactionType,
  type UsePolicyFilteredReactionCountersOptions,
  type UsePolicyFilteredReactionCountersResult
} from './hooks/useReactionCounters'
export {
  useMessageRequests,
  createConversationKey,
  createMessageRequestProperties,
  evaluateFirstContactDecision,
  findLatestMessageRequest,
  hasAcceptedContact,
  summarizeMessageRequest,
  type CreateMessageRequestOptions,
  type FirstContactAdmission,
  type FirstContactDecision,
  type FirstContactDecisionInput,
  type FirstContactVisibility,
  type MessageRequestNode,
  type MessageRequestProperties,
  type MessageRequestStatus,
  type UseMessageRequestsOptions,
  type UseMessageRequestsResult
} from './hooks/useMessageRequests'
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
export {
  describeGrantConsent,
  useGrants,
  type GrantConsentSummary,
  type GrantInput,
  type UseGrantsResult
} from './hooks/useGrants'
export {
  summarizeAuthTrace,
  useAuthTrace,
  type AuthTraceSummary,
  type UseAuthTraceResult
} from './hooks/useAuthTrace'
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
export { WebSocketSyncProvider, type WebSocketSyncProviderOptions } from '@xnetjs/runtime'
export {
  createSyncManager,
  type SyncManager,
  type SyncManagerConfig,
  type SyncLifecyclePhase,
  type SyncLifecycleState,
  type SyncStatus as SyncManagerStatus
} from '@xnetjs/runtime'
export { useSyncManager } from './hooks/useSyncManager'
export {
  createNodePool,
  type NodePool,
  type NodePoolConfig,
  type PoolEntryState
} from '@xnetjs/runtime'
export {
  createConnectionManager,
  type ConnectionManager,
  type ConnectionManagerConfig,
  type ConnectionStatus
} from '@xnetjs/runtime'
export {
  NodeStoreSyncProvider,
  type SerializedNodeChange,
  type NodeSyncResponse
} from '@xnetjs/runtime'
export {
  createRegistry,
  type Registry,
  type RegistryConfig,
  type RegistryStorage,
  type TrackedNode
} from '@xnetjs/runtime'
export {
  createMetaBridge,
  type MetaBridge,
  METABRIDGE_ORIGIN,
  METABRIDGE_SEED_ORIGIN
} from '@xnetjs/runtime'
export {
  createOfflineQueue,
  type OfflineQueue,
  type OfflineQueueConfig,
  type QueueEntry
} from '@xnetjs/runtime'
export { type BlobStoreForSync } from '@xnetjs/runtime'
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
} from '@xnetjs/runtime'
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
  useMergedEditorContributions,
  mergeEditorContributions,
  type MergedEditorContributions,
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
