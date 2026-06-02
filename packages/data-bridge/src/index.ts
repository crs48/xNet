/**
 * @xnetjs/data-bridge - DataBridge abstraction for off-main-thread data access
 *
 * This package provides the DataBridge interface and implementations for
 * accessing NodeStore data. The abstraction allows moving storage, sync,
 * and crypto off the main thread while keeping the React API unchanged.
 *
 * Implementations:
 * - MainThreadBridge: Direct NodeStore access (fallback/testing)
 * - WorkerBridge: Web Worker via Comlink (default for web)
 * - IPCBridge: Electron utility process (future)
 * - NativeBridge: React Native Turbo Module (future)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  DataBridge,
  NodeQueryRouterThresholds,
  QueryCompletenessMetadata,
  QueryDescriptor,
  QueryExecutionMode,
  QueryMaterializedMetadata,
  QueryMaterializedViewOptions,
  QueryMetadata,
  QueryPageInfo,
  QueryPageCountMode,
  QueryPageOptions,
  QueryRoutingMetadata,
  QuerySearchField,
  QuerySearchFilter,
  QuerySubscription,
  QueryOptions,
  QuerySource,
  QuerySourcePreference,
  QuerySpatialFilter,
  QuerySpatialPoint,
  QuerySpatialPointFields,
  QuerySpatialRadius,
  QuerySpatialRect,
  QuerySpatialRectFields,
  QuerySpatialWindow,
  QueryStreamEventType,
  QueryStreamMetadata,
  QueryStalenessMetadata,
  QueryVerificationMetadata,
  SortDirection,
  SystemOrderField,
  CreateResult,
  UpdateResult,
  AcquiredDoc,
  SyncStatus,
  DataBridgeConfig
} from './types'

export type {
  WorkerConfig,
  SerializedQueryOptions,
  QueryDelta,
  DataWorkerAPI,
  WorkerAcquiredDoc,
  DocUpdateMessage
} from './worker/worker-types'

// ─── Implementations ─────────────────────────────────────────────────────────

export {
  MainThreadBridge,
  createMainThreadBridge,
  type MainThreadBridgeOptions,
  type SyncManagerLike
} from './main-thread-bridge'
export { WorkerBridge, createWorkerBridge } from './worker-bridge'
export {
  NativeBridge,
  createNativeBridge,
  isReactNative,
  isExpo,
  type NativeBridgeConfig,
  type NativeStorageAdapter
} from './native-bridge'

// ─── Factory Functions ────────────────────────────────────────────────────────

export {
  createDataBridge,
  createMainThreadBridgeSync,
  createWorkerBridgeSync,
  isWorkerSupported,
  isNodeEnvironment,
  type CreateBridgeOptions
} from './create-bridge'

// ─── Utilities ───────────────────────────────────────────────────────────────

export { QueryCache } from './query-cache'
export {
  createQueryDescriptor,
  encodeQueryCursor,
  decodeQueryCursor,
  queryDescriptorToOptions,
  serializeQueryDescriptor,
  matchesQueryDescriptor,
  filterQueryNodes,
  sortQueryNodes,
  applyQueryDescriptor,
  queryDescriptorNeedsBoundedReload,
  applyNodeChangeToQueryResult,
  type QueryResultDelta
} from './query-descriptor'
export {
  createQueryMetadata,
  createQueryErrorMetadata,
  createQuerySnapshotMetadata
} from './query-metadata'
export {
  REMOTE_NODE_QUERY_PROTOCOL,
  REMOTE_NODE_QUERY_PROTOCOL_VERSION,
  createRemoteNodeQueryRequest,
  isRemoteNodeQueryError,
  isRemoteNodeQuerySource,
  isRemoteNodeQuerySuccess,
  type RemoteNodeQueryAuth,
  type RemoteNodeQueryClient,
  type RemoteNodeQueryClientState,
  type RemoteNodeQueryErrorResponse,
  type RemoteNodeQueryMode,
  type RemoteNodeQueryRequest,
  type RemoteNodeQueryResponse,
  type RemoteNodeQuerySource,
  type RemoteNodeQueryStreamController,
  type RemoteNodeQueryStreamObserver,
  type RemoteNodeQueryStreamSubscription,
  type RemoteNodeQuerySuccessResponse,
  type RemoteQueryCompleteness,
  type RemoteQueryStaleness,
  type RemoteQueryVerification
} from './remote-query-protocol'
export {
  DEFAULT_NODE_QUERY_ROUTER_THRESHOLDS,
  createQueryRoutingMetadata,
  createRemoteFallbackMetadata,
  createRemoteSuccessMetadata,
  filterRemoteNodesByVerification,
  getRemoteQueryMode,
  getRemoteQuerySource,
  isRemoteVerificationFailed,
  mergeRemoteNodeSnapshots,
  normalizeNodeQueryRouterThresholds,
  routeRemoteNodeQuery,
  type RemoteNodeQueryRouteDecision,
  shouldRunRemoteQuery,
  shouldUseRemoteOnlyQuery,
  withRemoteErrorVerificationMetadata
} from './remote-query-execution'
export {
  createQueryStreamState,
  reduceQueryStreamEvent,
  reduceQueryStreamEvents,
  type QueryStreamEvent,
  type QueryStreamProgress,
  type QueryStreamProgressPhase,
  type QueryStreamResetReason,
  type QueryStreamState,
  type QueryStreamStatus
} from './query-stream'
export {
  debounce,
  createUpdateBatcher,
  createDeltaBatcher,
  type DebounceOptions,
  type DebouncedFunction,
  type UpdateBatcher,
  type UpdateBatcherOptions,
  type DeltaBatcher,
  type DeltaBatcherOptions,
  type QueryDelta as DeltaQueryDelta
} from './utils/debounce'

// Binary serialization for efficient data transfer
export {
  NodeStateEncoder,
  NodeStateDecoder,
  encodeNodeStates,
  decodeNodeStates,
  shouldUseBinaryEncoding
} from './utils/binary-state'
