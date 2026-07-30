/**
 * xNet React context provider
 *
 * Provides NodeStore and optional identity to the React tree.
 * All data access happens through useQuery/useMutate/useNode hooks.
 */
import type { XNetRuntimeConfig, XNetRuntimeStatus } from './runtime'
import type { DID } from '@xnetjs/core'
import type { SecurityLevel } from '@xnetjs/crypto'
import type { NodeStorageAdapter } from '@xnetjs/data'
import type { Identity, PQKeyRegistry, HybridKeyBundle } from '@xnetjs/identity'
import type { BlobStoreForSync, ConnectionManager, SyncManager, SyncStatus } from '@xnetjs/runtime'
import type { SyncReplicationConfig } from '@xnetjs/sync'
import type { ReactNode } from 'react'
import { NodeStore } from '@xnetjs/data'
import {
  type DataBridge,
  type NodeQueryRouterThresholds,
  type RemoteNodeQueryClient
} from '@xnetjs/data-bridge'
import { UndoManager } from '@xnetjs/history'
import { PluginRegistry, type Platform } from '@xnetjs/plugins'
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { SecurityProvider } from './context/security-context'
import { TelemetryContext, type TelemetryReporter } from './context/telemetry-context'
import { TracingContext, type TracingReporter } from './context/tracing-context'
import { PluginRegistryContext } from './hooks/usePlugins'
import { log } from './provider/debug'
import { useHubAuthToken } from './provider/use-hub-auth-token'
import { useHubSearchIndex } from './provider/use-hub-search-index'
import { useNodeStoreRuntime } from './provider/use-node-store-runtime'
import {
  useBridgeSyncWiring,
  useHubStatus,
  useSyncManagerLifecycle
} from './provider/use-sync-manager'
import { resolveRuntimeConfig } from './runtime'

function resolveConfiguredSignalingUrls(
  hubUrl: string | null,
  signalingServers: string[] | undefined
): string[] {
  const seen = new Set<string>()
  const configured = hubUrl ? [hubUrl, ...(signalingServers ?? [])] : (signalingServers ?? [])
  const urls = configured
    .map((url) => url.trim())
    .filter((url) => {
      if (!url || seen.has(url)) return false
      seen.add(url)
      return true
    })

  // No hub and no signaling servers → no URLs (stay offline / local-first).
  // The old `['ws://localhost:4444']` default dialed a hub that nothing is
  // serving, producing ERR_CONNECTION_REFUSED console errors (exploration 0188);
  // a real signaling server is opted into via hubUrl / signalingServers.
  return urls
}

/**
 * xNet configuration
 */
export interface XNetConfig {
  /** Node storage adapter for NodeStore (defaults to MemoryNodeStorageAdapter) */
  nodeStorage?: NodeStorageAdapter
  /** Author's DID for signing changes */
  authorDID?: DID
  /** Ed25519 signing key */
  signingKey?: Uint8Array
  /** User identity */
  identity?: Identity
  /** Signaling server URLs for sync (default: ['ws://localhost:4444']) */
  signalingServers?: string[]
  /** Hub WebSocket URL for always-on sync (overrides signalingServers[0]) */
  hubUrl?: string
  /**
   * Optional billing config (exploration 0187), surfaced to `useBilling`. The
   * default redirect-checkout flow needs neither field — the hub creates checkout
   * sessions server-side with the secret key. Use `apiBase` only to point billing
   * at a different origin than the hub, and `publishableKey` only for future
   * embedded (Stripe Elements) checkout.
   */
  billing?: {
    /** Base URL for the hub billing routes. Defaults to the hub's HTTP URL. */
    apiBase?: string
    /** Stripe publishable key (`pk_…`). The secret key NEVER goes on the client. */
    publishableKey?: string
  }
  /** Hub integration options */
  hubOptions?: {
    /** Auto-generate UCAN for hub auth (default: true) */
    autoAuth?: boolean
    /** Static UCAN token override for pre-authorized share sessions */
    authToken?: string
    /** Enable auto-backup on document updates (default: false) */
    autoBackup?: boolean
    /** Backup debounce delay in ms (default: 5000) */
    backupDebounceMs?: number
    /** Enable search indexing on NodeStore changes (default: false) */
    enableSearchIndex?: boolean
    /** Room name for node-change relay (defaults to author DID) */
    nodeSyncRoom?: string
  }
  /** Encryption key for hub backups (XChaCha20-Poly1305) */
  encryptionKey?: Uint8Array
  /** Disable Background Sync Manager (default: false) */
  disableSyncManager?: boolean
  /** Provide an external SyncManager (e.g., IPC-based for Electron desktop).
   *  When provided, the internal SyncManager creation is skipped. */
  syncManager?: SyncManager
  /** Blob store for P2P blob sync (images, files). If provided, the SyncManager
   *  will sync blobs alongside Y.Doc state. Typically a BlobStore from @xnetjs/storage. */
  blobStore?: BlobStoreForSync
  /** Platform for plugin compatibility ('web' | 'electron' | 'mobile'). Defaults to 'web'. */
  platform?: Platform
  /** Signed replication policy for document sync. */
  sync?: SyncReplicationConfig
  /** Disable plugin system (default: false) */
  disablePlugins?: boolean
  /**
   * Explicit runtime selection for bridge and sync bootstrap.
   */
  runtime?: XNetRuntimeConfig
  /**
   * Custom DataBridge instance.
   *
   * When provided, this bridge is used for data access instead of creating
   * a MainThreadBridge. This allows using WorkerBridge or other off-main-thread
   * implementations.
   *
   * The bridge must already be initialized before passing to XNetProvider.
   *
   * Note: When using a custom bridge, NodeStore is still created on the main
   * thread for SyncManager and other integrations. The custom bridge is used
   * only for React hook data access (useQuery, useMutate).
   *
   * @example
   * ```tsx
   * // Using WorkerBridge
   * const bridge = new WorkerBridge(workerUrl)
   * await bridge.initialize({ authorDID, signingKey, dbName: 'xnet' })
   *
   * <XNetProvider config={{ dataBridge: bridge, ... }}>
   *   <App />
   * </XNetProvider>
   * ```
   */
  dataBridge?: DataBridge
  /**
   * Optional remote Node query client for progressive `useQuery` reads.
   *
   * When provided with the main-thread bridge, queries using
   * `mode: 'local-then-remote'` render the local snapshot first and then merge
   * hub/federated results. Queries using `mode: 'remote'` use this client as
   * their primary source.
   */
  remoteNodeQueryClient?: RemoteNodeQueryClient
  /**
   * Optional routing thresholds for `source: "auto"` Node descriptor reads.
   *
   * These thresholds are used by the main-thread bridge after the first local
   * snapshot to decide whether a remote client should refresh the same query.
   */
  remoteNodeQueryRouting?: Partial<NodeQueryRouterThresholds>
  /**
   * Security configuration for multi-level cryptography.
   */
  security?: {
    /** Default security level for new signatures (default: 0 for Ed25519-only) */
    level?: SecurityLevel
    /** Minimum acceptable level for verification (default: 0) */
    minVerificationLevel?: SecurityLevel
    /** Verification policy (default: 'strict') */
    verificationPolicy?: 'strict' | 'permissive'
    /** Custom PQ key registry */
    registry?: PQKeyRegistry
  }
  /**
   * Hybrid key bundle for multi-level cryptography.
   *
   * When provided, enables signing at higher security levels (1, 2).
   * The bundle includes Ed25519 keys and optionally ML-DSA (post-quantum) keys.
   *
   * @example
   * ```tsx
   * const bundle = createKeyBundle({ includePQ: true })
   *
   * <XNetProvider config={{ keyBundle: bundle, ... }}>
   *   <App />
   * </XNetProvider>
   * ```
   */
  keyBundle?: HybridKeyBundle
  /**
   * Optional telemetry reporter for hook instrumentation.
   *
   * When provided, useQuery and useMutate hooks will report:
   * - Query timing (first-load latency)
   * - Cache hit/miss rates
   * - Mutation success/failure rates
   * - Subscription churn (mount/unmount frequency)
   *
   * Uses a duck-typed interface to avoid circular dependencies with @xnetjs/telemetry.
   *
   * @example
   * ```tsx
   * import { TelemetryCollector, ConsentManager } from '@xnetjs/telemetry'
   * const consent = new ConsentManager()
   * const telemetry = new TelemetryCollector({ consent })
   *
   * <XNetProvider config={{ telemetry, ... }}>
   *   <App />
   * </XNetProvider>
   * ```
   */
  telemetry?: TelemetryReporter
  /**
   * Optional full-stack tracing reporter (exploration 0190).
   *
   * When provided, useQuery/useMutate open a per-call trace and record
   * main-thread stage spans, assembled into a local waterfall (devtools) and
   * — when sampled — folded into bucketed performance metrics. Satisfied by
   * @xnetjs/telemetry's `TraceCollector`. Duck-typed to avoid a circular dep.
   */
  tracing?: TracingReporter
}

/**
 * xNet context value
 */
export interface XNetContextValue {
  /** NodeStore for Node operations */
  nodeStore: NodeStore | null
  /** Whether NodeStore is initialized */
  nodeStoreReady: boolean
  /** User identity (if provided) */
  identity?: Identity
  /** Author DID (resolved from config.authorDID or config.identity.did) */
  authorDID: string | null
  /** Background Sync Manager (null if disabled or not yet initialized) */
  syncManager: SyncManager | null
  /** Hub URL (if configured) */
  hubUrl: string | null
  /** Hub connection status */
  hubStatus: SyncStatus
  /** Hub connection (shares SyncManager connection when available) */
  hubConnection: ConnectionManager | null
  /** Hub auth token provider (for HTTP requests) */
  getHubAuthToken?: () => Promise<string>
  /** Billing config (exploration 0187), surfaced to useBilling. */
  billing?: { apiBase?: string; publishableKey?: string }
  /** Encryption key for hub backups */
  encryptionKey: Uint8Array | null
  /** Blob store for content-addressed storage (null if not configured) */
  blobStore: BlobStoreForSync | null
  /** Plugin Registry (null if disabled or not yet initialized) */
  pluginRegistry: PluginRegistry | null
  /** Runtime mode request, fallback behavior, and active runtime status */
  runtimeStatus: XNetRuntimeStatus
  /**
   * App-wide undo manager — one stack across every node-backed surface
   * (folders, tasks, databases, chat, settings). Drives Cmd+Z via
   * undoLatest/redoLatest. Null until the NodeStore is ready (0179).
   */
  undoManager: UndoManager | null
}

export type XNetInternalContextValue = {
  authorDID: string | null
  signingKey: Uint8Array | null
  sync: SyncReplicationConfig | undefined
}

/** @internal Exported for useNodeStore hook - not part of public API */
export const XNetContext = createContext<XNetContextValue | null>(null)
const XNetInternalContext = createContext<XNetInternalContextValue>({
  authorDID: null,
  signingKey: null,
  sync: undefined
})

/**
 * DataBridge context for runtime-backed data access.
 *
 * @internal
 */
export const DataBridgeContext = createContext<DataBridge | null>(null)

/**
 * Hook to access the DataBridge.
 * Returns null while the bridge is initializing.
 *
 * @internal Used by useQuery/useMutate hooks - not part of public API yet.
 */
export function useDataBridge(): DataBridge | null {
  return useContext(DataBridgeContext)
}

/**
 * xNet provider props
 */
export interface XNetProviderProps {
  config: XNetConfig
  children: ReactNode
}

/**
 * xNet provider component
 *
 * Initializes NodeStore and provides it to the React tree.
 *
 * @public
 */
export function XNetProvider({ config, children }: XNetProviderProps): JSX.Element {
  const [undoManager, setUndoManager] = useState<UndoManager | null>(null)
  const [pluginRegistry, setPluginRegistry] = useState<PluginRegistry | null>(null)

  const platform = config.platform ?? 'web'
  const authorDID = config.authorDID ?? (config.identity?.did as string | undefined)
  const hubUrl = config.hubUrl ?? null
  const signalingServersKey = (config.signalingServers ?? []).join('\n')
  const signalingServers = useMemo(
    () => (signalingServersKey ? signalingServersKey.split('\n') : []),
    [signalingServersKey]
  )
  const signalingUrls = useMemo(
    () => resolveConfiguredSignalingUrls(hubUrl, signalingServers),
    [hubUrl, signalingServers]
  )
  const hubOptions = config.hubOptions
  const autoAuth = hubOptions?.autoAuth ?? true
  const staticHubAuthToken = hubOptions?.authToken?.trim() ?? ''
  const autoBackup = hubOptions?.autoBackup ?? false
  const backupDebounceMs = hubOptions?.backupDebounceMs ?? 5000
  const enableSearchIndex = hubOptions?.enableSearchIndex ?? false
  const nodeSyncRoom = hubOptions?.nodeSyncRoom ?? authorDID ?? 'default'
  const encryptionKey = config.encryptionKey ?? null
  const runtimeWorkerUrlKey = config.runtime?.worker?.url ? String(config.runtime.worker.url) : ''
  const runtimeConfig = useMemo(
    () => resolveRuntimeConfig(config.runtime, platform),
    [
      config.runtime?.mode,
      config.runtime?.fallback,
      config.runtime?.diagnostics,
      config.runtime?.worker?.dbName,
      config.runtime?.worker?.signalingUrl,
      runtimeWorkerUrlKey,
      platform
    ]
  )
  const getHubAuthToken = useHubAuthToken({
    authorDID,
    signingKey: config.signingKey,
    hubUrl,
    autoAuth,
    staticHubAuthToken
  })

  // Initialization: storage → NodeStore → runtime bridge (provider/ unit, 0276)
  const { nodeStore, nodeStoreReady, dataBridge, runtimeStatus, nodeStorageRef } =
    useNodeStoreRuntime({
      authorDID,
      signingKey: config.signingKey,
      nodeStorage: config.nodeStorage,
      dataBridge: config.dataBridge,
      remoteNodeQueryClient: config.remoteNodeQueryClient,
      remoteNodeQueryRouting: config.remoteNodeQueryRouting,
      syncManager: config.syncManager,
      telemetry: config.telemetry,
      hubUrl,
      signalingUrls,
      runtimeConfig,
      runtimeWorkerUrlKey
    })

  // Sync + backup lifecycle, bridge wiring, hub status, search indexing
  // (provider/ units, 0276)
  const syncManager = useSyncManagerLifecycle({
    nodeStore,
    nodeStoreReady,
    nodeStorageRef,
    externalSyncManager: config.syncManager,
    disableSyncManager: config.disableSyncManager,
    signalingUrls,
    authorDID,
    signingKey: config.signingKey,
    sync: config.sync,
    blobStore: config.blobStore,
    hubUrl,
    nodeSyncRoom,
    autoAuth,
    autoBackup,
    backupDebounceMs,
    encryptionKey,
    getHubAuthToken
  })
  useBridgeSyncWiring(dataBridge, syncManager)
  const hubStatus = useHubStatus(syncManager)
  useHubSearchIndex({ nodeStore, syncManager, hubUrl, enableSearchIndex })

  // Create PluginRegistry when NodeStore is ready
  useEffect(() => {
    if (!nodeStore || !nodeStoreReady || config.disablePlugins) {
      log('PluginRegistry disabled or NodeStore not ready')
      setPluginRegistry(null)
      return
    }

    log('Creating PluginRegistry with platform:', platform)

    const registry = new PluginRegistry(nodeStore, platform)
    setPluginRegistry(registry)

    // Load any previously installed plugins from storage
    registry.loadFromStore().catch((err: unknown) => {
      console.warn('[XNetProvider] Failed to load plugins from store:', err)
    })

    return () => {
      // Deactivate all plugins on cleanup
      const plugins = registry.getAll()
      for (const plugin of plugins) {
        if (plugin.status === 'active') {
          registry.deactivate(plugin.manifest.id).catch((err: unknown) => {
            console.warn(`[XNetProvider] Failed to deactivate plugin ${plugin.manifest.id}:`, err)
          })
        }
      }
      setPluginRegistry(null)
    }
  }, [nodeStore, nodeStoreReady, config.disablePlugins, config.platform])

  // App-wide undo manager (0179): a single UndoManager subscribed to the
  // one NodeStore gives Cmd+Z a global stack across folders, tasks,
  // databases, chat, and settings — undoLatest() pops the most recent
  // action regardless of which surface produced it. local-only so a user
  // only ever reverses their own changes, never a collaborator's.
  useEffect(() => {
    if (!nodeStore || !nodeStoreReady || !authorDID) {
      setUndoManager(null)
      return
    }

    const manager = new UndoManager(
      nodeStore,
      authorDID as DID,
      { localOnly: true, maxStackSize: 200 },
      config.telemetry
    )
    manager.start()
    setUndoManager(manager)

    return () => {
      manager.stop()
      setUndoManager(null)
    }
  }, [nodeStore, nodeStoreReady, authorDID, config.telemetry])

  const value: XNetContextValue = useMemo(
    () => ({
      nodeStore,
      nodeStoreReady,
      identity: config.identity,
      authorDID: authorDID ?? null,
      syncManager,
      hubUrl,
      hubStatus,
      hubConnection: syncManager?.connection ?? null,
      getHubAuthToken: hubUrl ? getHubAuthToken : undefined,
      billing: config.billing,
      encryptionKey,
      blobStore: config.blobStore ?? null,
      pluginRegistry,
      runtimeStatus,
      undoManager
    }),
    [
      nodeStore,
      nodeStoreReady,
      config.identity,
      authorDID,
      syncManager,
      hubUrl,
      hubStatus,
      getHubAuthToken,
      config.billing,
      encryptionKey,
      config.blobStore,
      pluginRegistry,
      runtimeStatus,
      undoManager
    ]
  )

  const internalValue: XNetInternalContextValue = useMemo(
    () => ({
      authorDID: authorDID ?? null,
      signingKey: config.signingKey ?? null,
      sync: config.sync
    }),
    [authorDID, config.signingKey, config.sync]
  )

  let content: ReactNode = React.createElement(
    PluginRegistryContext.Provider,
    { value: pluginRegistry },
    children
  )

  content = React.createElement(DataBridgeContext.Provider, { value: dataBridge }, content)

  content = React.createElement(
    TelemetryContext.Provider,
    { value: config.telemetry ?? null },
    content
  )

  content = React.createElement(TracingContext.Provider, { value: config.tracing ?? null }, content)

  // Wrap with SecurityProvider for multi-level crypto support
  content = React.createElement(SecurityProvider, {
    level: config.security?.level,
    minVerificationLevel: config.security?.minVerificationLevel,
    verificationPolicy: config.security?.verificationPolicy,
    registry: config.security?.registry,
    keyBundle: config.keyBundle,
    children: content
  })

  content = React.createElement(XNetInternalContext.Provider, { value: internalValue }, content)

  return React.createElement(XNetContext.Provider, { value }, content)
}

/**
 * Hook to access xNet context
 *
 * @internal Used by useIdentity. Not part of public API.
 */
export function useXNet(): XNetContextValue {
  const context = useContext(XNetContext)
  if (!context) {
    throw new Error('useXNet must be used within an XNetProvider')
  }
  return context
}

/**
 * @internal Internal access to sync credentials and replication policy.
 */
export function useXNetInternal(): XNetInternalContextValue {
  return useContext(XNetInternalContext)
}
