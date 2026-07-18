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

// The executable "use xNet from any framework" contract (exploration 0237).
// Behaviour is validated once here, framework-agnostically; each adapter adds
// only a tiny render-harness test on top.
export {
  runAdapterConformance,
  AdapterConformanceError,
  type ConformanceClientFactory,
  type AdapterConformanceCheck,
  type AdapterConformanceResult
} from './adapter-conformance'

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

// Multi-home sync: policy-driven selective routing over the multiplexed
// per-hub transports (exploration 0258).
export {
  createMultiHubSyncManager,
  type MultiHubSyncManager,
  type MultiHubSyncManagerConfig,
  type HubConnection,
  type HubTransport,
  type PlannedHub,
  type ScopedRoomHandle
} from './sync/MultiHubSyncManager'

export {
  spaceNamespace,
  systemNamespace,
  namespaceForNode,
  replicationConfigFromPolicies,
  type ReplicaTrust,
  type ReplicationScopeNode,
  type ReplicationDestinationSpec,
  type SpaceReplicationPolicy
} from './sync/replication-scope'

export {
  NodeStoreSyncProvider,
  channelShareRoom,
  workspaceShareRoom,
  type SerializedNodeChange,
  type NodeSyncResponse,
  type SyncBlockedListener,
  type SyncBlockedReason
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

// The umbrella xNet Protocol Version — the machine-readable counterpart of the
// normative spec in docs/specs/protocol/. See exploration 0200.
export {
  XNET_PROTOCOL_VERSION,
  XNET_SUPPORTED_PROTOCOL_VERSIONS,
  XNET_SCHEMA_VERSION,
  XNET_SYNC_ENVELOPE_VERSION,
  XNET_AWARENESS_VERSION,
  XNET_DATA_MODEL_VERSION,
  XNET_UCAN_PROFILE,
  negotiateProtocolVersion,
  isProtocolCompatible,
  type XNetProtocolBundle
} from './protocol'
