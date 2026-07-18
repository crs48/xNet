/**
 * @xnetjs/react - React hooks for xNet
 *
 * Core API:
 * - useQuery: Read nodes (list, single, filtered)
 * - useFind: Guarded advanced AST reads
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
  type SortDirection,
  type MigrationWarning
} from './hooks/useQuery'
export {
  useInfiniteQuery,
  type InfiniteQueryFilter,
  type InfiniteQueryPage,
  type InfiniteQueryResult
} from './hooks/useInfiniteQuery'
export { useFind, type UseFindOptions, type UseFindResult } from './hooks/useFind'
export { useEffectiveSchema, type UseEffectiveSchemaResult } from './hooks/useEffectiveSchema'
export {
  useSavedView,
  type SavedViewPrivacySummary,
  type SavedViewQueryOverride,
  type SavedViewQueryResult,
  type SavedViewSchemaRegistry,
  type UseSavedViewOptions,
  type UseSavedViewResult
} from './hooks/useSavedView'
export {
  deriveSavedViewDateBucketSummaries,
  deriveSavedViewFacetSummaries,
  deriveSavedViewColumns,
  deriveSavedViewPrivacyChips,
  deriveSavedViewRowInspector,
  createSavedViewLensDraft,
  createSavedViewVisualCanvasProjectionRequest,
  filterSavedViewRowsByDateBrush,
  filterSavedViewRowsByFacets,
  formatSavedViewCellValue,
  getSavedViewSensitiveResultWarning,
  SavedViewResultTable,
  SavedViewRunner,
  type SavedViewDateBrushSelection,
  type SavedViewDateBucketFieldSummary,
  type SavedViewDateBucketInterval,
  type SavedViewDateBucketSummary,
  type SavedViewFacetSelection,
  type SavedViewFacetSummary,
  type SavedViewFacetValueSummary,
  type SavedViewInspectorItem,
  type SavedViewInspectorItemKind,
  type SavedViewLensDraft,
  type SavedViewPrivacyChip,
  type SavedViewPrivacyChipTone,
  type SavedViewResultTableProps,
  type SavedViewRowInspectorModel,
  type SavedViewRunnerProps,
  type SavedViewSortDirection,
  type SavedViewVisualCanvasProjectionRequest,
  type SavedViewVisualLayoutId,
  type SavedViewVisualLayoutOption,
  type SavedViewPresentationMode,
  type SavedViewFeedDensity,
  type SavedViewFeedLayout
} from './components/SavedViewRunner'
export {
  SavedViewVisualFeed,
  mergeSavedViewFeedEnrichment,
  type SavedViewFeedEnrichmentAdapter,
  type SavedViewFeedEnrichmentEntry
} from './components/SavedViewVisualFeed'
export {
  deriveCachedSavedViewVisualPreviews,
  createSavedViewCanvasProjectionNodes,
  createSavedViewVisualPreviewFingerprint,
  deriveSavedViewTimelineBuckets,
  deriveSavedViewVisualPreview,
  deriveSavedViewVisualPreviews,
  hasSavedViewVisualPreviewSensitiveData,
  isSavedViewVisualPreviewEmbeddable,
  savedViewVisualPreviewIsSelfActor,
  type SavedViewCanvasProjectionNode,
  type SavedViewVisualPreviewCreator,
  type SavedViewVisualPreviewKind,
  type SavedViewVisualPreviewModel,
  type SavedViewVisualPreviewPrivacy,
  type SavedViewVisualPreviewRelationship,
  type SavedViewVisualTimelineBucket,
  type SavedViewVisualWorkspaceLayout
} from './components/savedViewVisualPreview'

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
  type MutateRestore
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
// Ephemeral typed presence over Yjs Awareness — never writes the change log (0314)
export {
  usePresence,
  type PresenceAwareness,
  type PresencePeer,
  type UsePresenceOptions,
  type UsePresenceResult
} from './hooks/usePresence'
export {
  usePageTaskSync,
  type PageTaskInput,
  type PageTaskReferenceInput,
  type UsePageTaskSyncOptions,
  type UsePageTaskSyncResult
} from './hooks/usePageTaskSync'
export {
  useCanvasTaskSync,
  type CanvasTaskInput,
  type UseCanvasTaskSyncOptions,
  type UseCanvasTaskSyncResult
} from './hooks/useCanvasTaskSync'
export {
  useTaskProjectionSync,
  type TaskProjectionInput,
  type TaskProjectionReferenceInput,
  type TaskProjectionHost,
  type UseTaskProjectionSyncOptions,
  type UseTaskProjectionSyncResult
} from './hooks/useTaskProjectionSync'
export {
  useTasks,
  type UseTasksOptions,
  type UseTasksResult,
  type TaskTreeItem
} from './hooks/useTasks'

// =============================================================================
// Database Hooks
// =============================================================================

/**
 * useDatabaseDoc - Hook for database column and view operations
 *
 * @example
 * ```tsx
 * const {
 *   columns,
 *   views,
 *   createColumn,
 *   updateColumn,
 *   createView
 * } = useDatabaseDoc(databaseId)
 * ```
 */
export {
  useDatabaseDoc,
  type UseDatabaseDocResult,
  type ColumnDefinition,
  type ColumnType,
  type ColumnConfig,
  type ViewConfig,
  type ViewType
} from './hooks/useDatabaseDoc'

/**
 * useDatabase - Hook for database row operations with pagination
 *
 * @example
 * ```tsx
 * const {
 *   rows,
 *   columns,
 *   views,
 *   loading,
 *   hasMore,
 *   loadMore,
 *   createRow
 * } = useDatabase(databaseId)
 * ```
 */
export {
  useDatabase,
  type UseDatabaseOptions,
  type UseDatabaseResult,
  type DatabaseRow
} from './hooks/useDatabase'

/**
 * useGridDatabase - The V2 database hook (exploration 0159).
 * Fields/views/options/rows as nodes via useQuery; view nodes are the
 * single source of truth; scoped local-only undo.
 *
 * @example
 * ```tsx
 * const grid = useGridDatabase(databaseId, { viewId, search })
 * <GridSurface fields={grid.visibleFields} rows={grid.rows} ... />
 * ```
 */
/**
 * useNodeStore - Direct access to the underlying NodeStore (advanced).
 */
export { useNodeStore } from './hooks/useNodeStore'

export {
  useGridDatabase,
  type UseGridDatabaseOptions,
  type UseGridDatabaseResult,
  type AddRowOptions,
  type GridFieldModel,
  type GridOptionModel,
  type GridViewModel,
  type GridViewConfigPatch,
  type GridRowModel
} from './hooks/useGridDatabase'

/**
 * useDatabaseRow - Hook for single row operations with optimistic updates
 *
 * @example
 * ```tsx
 * const { row, update, delete: deleteRow } = useDatabaseRow(rowId)
 * ```
 */
export {
  useDatabaseRow,
  type UseDatabaseRowResult,
  type DatabaseRowData
} from './hooks/useDatabaseRow'

/**
 * useCell - Hook for individual cell editing with debounced saves
 *
 * @example
 * ```tsx
 * const { value, setValue, saving } = useCell<string>(rowId, 'title')
 * ```
 */
export { useCell, type UseCellResult, type UseCellOptions } from './hooks/useCell'

/**
 * useRelatedRows - Hook for loading related row data for relation columns
 *
 * @example
 * ```tsx
 * const { rows, loading, error } = useRelatedRows(['row1', 'row2'])
 * ```
 */
export { useRelatedRows, type UseRelatedRowsResult } from './hooks/useRelatedRows'

/**
 * useReverseRelations - Hook for finding rows that link TO a given row
 *
 * @example
 * ```tsx
 * const { relations, loading } = useReverseRelations(rowId, databaseId)
 * ```
 */
export {
  useReverseRelations,
  type ReverseRelation,
  type UseReverseRelationsResult
} from './hooks/useReverseRelations'

/**
 * useDatabaseSchema - Hook for database-defined schema access
 *
 * @example
 * ```tsx
 * const { schema, metadata, loading } = useDatabaseSchema(databaseId)
 * console.log(metadata?.version) // "1.2.0"
 * ```
 */
export { useDatabaseSchema, type UseDatabaseSchemaResult } from './hooks/useDatabaseSchema'

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
 * useVisibleComments - Moderated comment visibility for public surfaces
 *
 * @example
 * ```tsx
 * const { threads, hiddenCount, canAddRootComment } = useVisibleComments({
 *   nodeId: pageId,
 *   viewerDID
 * })
 * ```
 */
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

/**
 * usePolicyFilteredReactionCounters - Moderated likes, reposts, and reply counts
 */
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

/**
 * useMessageRequests - First-contact requests and quarantine queues
 */
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
 * Hooks area sub-barrel (0276 policy) — ONE grouped block for new hook
 * surface. Currently: useTimeMachine (Time Machine scrub/checkpoint/restore)
 * and useDraft (drafts fork/checkout/review/merge), exploration 0329, plus
 * the history types their consumers bind to.
 */
export {
  useDraft,
  useTimeMachine,
  type DraftMergeConflict,
  type DraftReview,
  type DraftReviewCard,
  type DraftReviewMember,
  type Frontier,
  type FrontierEntry,
  type HistoryHorizon,
  type MergeDraftResult,
  type PropertyDiff,
  type RefreshDraftResult,
  type RestoreResult,
  type ScopeTimelineEntry,
  type UseDraftResult,
  type UseTimeMachineOptions,
  type UseTimeMachineResult
} from './hooks'

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
 * useGlobalUndo - app-wide Cmd+Z across every node-backed surface (0179)
 *
 * @example
 * ```tsx
 * const { undo, redo, canUndo, canRedo } = useGlobalUndo()
 * ```
 */
export { useGlobalUndo, type UseGlobalUndoResult } from './hooks/useGlobalUndo'

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

export { useCan, type UseCanResult } from './hooks/useCan'

export { useCanEdit, type UseCanEditResult } from './hooks/useCanEdit'

export { useCanCreate, type UseCanCreateResult } from './hooks/useCanCreate'

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

export {
  flattenNode,
  flattenNodes,
  flattenUnknownSchemaNode,
  flattenNodesWithSchemaCheck,
  type FlattenNodeOptions
} from './utils/flattenNode'

// =============================================================================
// Sync
// =============================================================================

export { WebSocketSyncProvider, type WebSocketSyncProviderOptions } from '@xnetjs/runtime'

export {
  createSyncManager,
  type SyncManager,
  type SyncManagerConfig,
  type SyncReconciliationOptions,
  type SyncReconciliationReport,
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
  createMultiHubConnectionManager,
  type ConnectionManager,
  type ConnectionManagerConfig,
  type MultiHubConnectionManagerConfig,
  type ConnectionStatus
} from '@xnetjs/runtime'

export {
  NodeStoreSyncProvider,
  channelShareRoom,
  workspaceShareRoom,
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

// =============================================================================
// Identity
// =============================================================================

export { useIdentity, type UseIdentityResult } from './hooks/useIdentity'
export { useBilling, type UseBillingResult, type CheckoutOptions } from './hooks/useBilling'

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
} from '@xnetjs/runtime'

// =============================================================================
// Provider
// =============================================================================

export {
  XNetProvider,
  useXNet,
  useDataBridge,
  type XNetConfig,
  type XNetContextValue,
  type XNetProviderProps
} from './context'
export {
  type XNetRuntimeConfig,
  type XNetRuntimeFallback,
  type XNetRuntimeMode,
  type XNetRuntimePhase,
  type XNetRuntimeStatus,
  type XNetRuntimeWorkerConfig
} from './runtime'
export { PageTasksPanel, type PageTasksPanelProps } from './components/PageTasksPanel'
export {
  flattenTaskTree,
  formatTaskDueDate,
  isTaskOverdue,
  type RenderableTaskRow
} from './components/pageTaskRows'
export {
  TaskCollectionEmbed,
  type TaskCollectionEmbedProps
} from './components/TaskCollectionEmbed'

// =============================================================================
// Security (Multi-Level Cryptography)
// =============================================================================

/**
 * SecurityProvider - Global security configuration context
 *
 * @example
 * ```tsx
 * // Usually managed by XNetProvider, but can be used standalone
 * <SecurityProvider level={1} verificationPolicy="strict">
 *   <App />
 * </SecurityProvider>
 * ```
 */
export {
  SecurityProvider,
  useSecurityContext,
  useSecurityContextOptional,
  type SecurityContextState,
  type SecurityContextActions,
  type SecurityContextValue,
  type SecurityProviderProps
} from './context/security-context'

/**
 * useSecurity - Hook for security-aware operations
 *
 * @example
 * ```tsx
 * const { sign, verify, level, hasPQKeys } = useSecurity()
 *
 * // Sign data at current security level
 * const sig = sign(data)
 *
 * // Override level for high-security operations
 * const { sign: signPQ } = useSecurity({ level: 2 })
 * ```
 */
export { useSecurity, type UseSecurityOptions, type UseSecurityResult } from './hooks/useSecurity'

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
  useImporters,
  useEditorExtensions,
  useEditorExtensionsSafe,
  useMergedEditorContributions,
  mergeEditorContributions,
  type MergedEditorContributions,
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

// =============================================================================
// Telemetry
// =============================================================================

export {
  TelemetryContext,
  useTelemetryReporter,
  type TelemetryReporter
} from './context/telemetry-context'

export {
  TracingContext,
  useTracingReporter,
  TRACE_STAGES,
  type TracingReporter,
  type TracingHandle,
  type TracingSpanInput,
  type TracingRootKind,
  type TracingAttributes
} from './context/tracing-context'
