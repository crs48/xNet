/**
 * @xnetjs/runtime - Framework-agnostic xNet runtime.
 *
 * This package owns the orchestration that used to live inside the React
 * provider's effects: sync management, connection handling, the offline queue,
 * Y.Doc pooling, and (via `createXNetClient`) the full store + bridge + sync +
 * plugins + undo lifecycle. None of it imports React; the React, CLI, and
 * other-framework layers are thin adapters over this surface.
 */

// =============================================================================
// Client — the framework-agnostic runtime factory
// =============================================================================

export {
  createXNetClient,
  type XNetClient,
  type CreateXNetClientOptions,
  type XNetClientSyncOptions,
  type XNetClientPluginOptions,
  type XNetClientUndoOptions,
  type XNetClientTelemetry,
  type XNetClientRuntimeStatus,
  type XNetClientRuntimePhase,
  type XNetClientBridgeMode
} from './client'

export { liveQuery, type LiveQuery, type LiveQueryValue } from './live-query'

// =============================================================================
// Sync orchestration (relocated from @xnetjs/react — these never imported React)
// =============================================================================

export {
  WebSocketSyncProvider,
  type WebSocketSyncProviderOptions
} from './sync/WebSocketSyncProvider'

export {
  createSyncManager,
  type SyncManager,
  type SyncManagerConfig,
  type SyncReconciliationOptions,
  type SyncReconciliationReport,
  type SyncLifecyclePhase,
  type SyncLifecycleState,
  type SyncStatus
} from './sync/sync-manager'

export {
  createNodePool,
  type NodePool,
  type NodePoolConfig,
  type PoolEntryState
} from './sync/node-pool'

export {
  createConnectionManager,
  createMultiHubConnectionManager,
  type ConnectionManager,
  type ConnectionManagerConfig,
  type MultiHubConnectionManagerConfig,
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
  createInitialSyncManager,
  type InitialSyncManager,
  type InitialSyncMessage,
  type SyncProgress,
  type SyncPhase,
  type ProgressListener
} from './sync/InitialSyncManager'
