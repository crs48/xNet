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
  QueryDescriptor,
  QuerySubscription,
  QueryOptions,
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
