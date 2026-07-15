/**
 * createXNetClient — the framework-agnostic xNet runtime.
 *
 * This ports the orchestration that used to live inside `XNetProvider`'s
 * effects (packages/react/src/context.ts) into a plain async factory that
 * constructs and owns the full runtime: `NodeStore` → `DataBridge`
 * (main-thread by default; a custom worker/IPC bridge can be supplied) →
 * optional `SyncManager` → optional `PluginRegistry` → optional app-wide
 * `UndoManager`. It exposes the same read / write / auth / doc surface the
 * React hooks expose, so React, a CLI, a worker, or another framework are all
 * thin adapters over this one object.
 *
 * Nothing here imports React.
 */
import type { BlobStoreForSync } from './sync/blob-sync'
import type { SyncManager } from './sync/sync-manager'
import type { AuthCheckInput, AuthDecision, DID, PolicyEvaluator } from '@xnetjs/core'
import type {
  DefinedSchema,
  LensRegistry,
  NodeContentCipher,
  NodeState,
  NodeStorageAdapter,
  PropertyBuilder,
  SchemaLookup,
  StoreAuthAPI,
  TransactionOperation
} from '@xnetjs/data'
import type {
  AcquiredDoc,
  BridgeTransactionResult,
  DataBridge,
  MainThreadBridgeOptions,
  QueryOptions,
  SyncManagerLike,
  SyncStatus
} from '@xnetjs/data-bridge'
import type { Identity } from '@xnetjs/identity'
import type { Platform } from '@xnetjs/plugins'
import type { ChangeSigner, SyncReplicationConfig } from '@xnetjs/sync'
import { getSigningPublicKeyFromPrivate, sign, verify } from '@xnetjs/crypto'
import { MemoryNodeStorageAdapter, NodeStore } from '@xnetjs/data'
import { createMainThreadBridgeSync } from '@xnetjs/data-bridge'
import {
  DocumentHistoryEngine,
  UndoManager,
  rehydrateDraftPrivacy,
  type YjsSnapshotStorageAdapter
} from '@xnetjs/history'
import { PluginRegistry } from '@xnetjs/plugins'
import { createSyncManager } from './sync/sync-manager'

/** Telemetry reporter accepted by the runtime (duck-typed, no hard dep). */
export interface XNetClientTelemetry {
  reportPerformance(metricName: string, durationMs: number, codeNamespace?: string): void
  reportUsage(metricName: string, value: number): void
  reportCrash(error: Error, context?: { codeNamespace?: string }): void
  reportSecurityEvent(eventName: string, severity: 'low' | 'medium' | 'high' | 'critical'): void
}

/** Background-sync configuration. Omit (or pass `false`) for a local-only client. */
export interface XNetClientSyncOptions {
  /** Primary signaling/hub WebSocket URL (default: ws://localhost:4444). */
  signalingUrl?: string
  /** Additional signaling/hub URLs for multi-hub fan-out. */
  signalingUrls?: string[]
  /** Replication compatibility policy. */
  replication?: SyncReplicationConfig
  /** Blob store for P2P blob sync (images, files). */
  blobStore?: BlobStoreForSync
  /** Room for node-change relay (enables NodeStore sync via hub). */
  nodeSyncRoom?: string
  /** Static UCAN token for hub auth. */
  ucanToken?: string
  /** UCAN token provider for hub auth. */
  getUCANToken?: () => Promise<string>
  /** Max Y.Docs held in memory (default: 50). */
  poolSize?: number
  /** TTL for tracked Nodes in ms (default: 7 days). */
  trackTTL?: number
  /** Pool update callback (e.g. for auto-backup). */
  onDocUpdate?: (nodeId: string, doc: import('yjs').Doc) => void
  /** Pool eviction callback. */
  onDocEvict?: (nodeId: string, doc: import('yjs').Doc) => void
  /** Start the sync manager immediately (default: true). */
  autoStart?: boolean
}

/** Plugin-system configuration. Omit for no plugin registry (lean default). */
export interface XNetClientPluginOptions {
  /** Plugin compatibility platform (default: 'web'). */
  platform?: Platform
  /** Load previously installed plugins from the store on init (default: true). */
  autoLoad?: boolean
}

/** App-wide undo configuration. Omit for no undo manager (lean default). */
export interface XNetClientUndoOptions {
  /** Only undo the local author's own changes (default: true). */
  localOnly?: boolean
  /** Max undo stack size (default: 200). */
  maxStackSize?: number
}

/** Options for {@link createXNetClient}. */
export interface CreateXNetClientOptions {
  /** Node storage adapter (default: in-memory). */
  nodeStorage?: NodeStorageAdapter
  /** Author's DID for signing changes. */
  authorDID: DID
  /** Ed25519 signing key. */
  signingKey: Uint8Array
  /** Optional full identity (exposed as `client.identity`). */
  identity?: Identity
  /** Optional async change signer (e.g. WebCrypto/worker-backed). */
  changeSigner?: ChangeSigner

  // ── store-level seams ──────────────────────────────────────────────
  /** Authorization evaluator for read/write gating. */
  authEvaluator?: PolicyEvaluator
  /** Transparent node-content cipher (encrypt/decrypt snapshots). */
  nodeContentCipher?: NodeContentCipher
  /** High-level authorization API attached as `store.auth`. */
  auth?: StoreAuthAPI
  /** Schema lookup for temp-id resolution in relation properties. */
  schemaLookup?: SchemaLookup
  /** Property lookup for unknown-property preservation. */
  propertyLookup?: (schemaId: string) => Set<string> | undefined
  /** Lens registry for automatic schema migrations on read. */
  lensRegistry?: LensRegistry
  /** Telemetry reporter. */
  telemetry?: XNetClientTelemetry

  // ── runtime wiring ─────────────────────────────────────────────────
  /**
   * Custom DataBridge (e.g. a WorkerBridge or IPC bridge), already
   * initialized. When omitted, a main-thread bridge is created internally.
   */
  dataBridge?: DataBridge
  /** Options for the internally created main-thread bridge. */
  bridgeOptions?: MainThreadBridgeOptions
  /** Background sync — omit or pass `false` for a local-only client. */
  sync?: XNetClientSyncOptions | false
  /** Plugin system — omit or pass `false` to disable. */
  plugins?: XNetClientPluginOptions | false
  /** App-wide undo — omit or pass `false` to disable. */
  undo?: XNetClientUndoOptions | false
}

export type XNetClientRuntimePhase = 'ready' | 'destroyed'
export type XNetClientBridgeMode = 'main-thread' | 'custom'

export interface XNetClientRuntimeStatus {
  phase: XNetClientRuntimePhase
  /** Whether the bridge was created internally ('main-thread') or supplied ('custom'). */
  bridgeMode: XNetClientBridgeMode
  /** Whether background sync is active. */
  syncEnabled: boolean
}

/**
 * A fully constructed, framework-agnostic xNet client. Owns its store, bridge,
 * and (optionally) sync/plugins/undo, and exposes the read/write/auth/doc
 * surface the React hooks expose.
 */
export interface XNetClient {
  readonly store: NodeStore
  readonly bridge: DataBridge
  readonly syncManager: SyncManager | null
  readonly plugins: PluginRegistry | null
  readonly undo: UndoManager | null
  readonly identity?: Identity
  readonly authorDID: DID
  /** Current bridge/sync connection status. */
  readonly status: SyncStatus
  readonly runtimeStatus: XNetClientRuntimeStatus

  // ── reads ──────────────────────────────────────────────────────────
  /** Live query — returns a `{ getSnapshot, subscribe }` subscription. */
  query: DataBridge['query']
  /** One-shot read — resolves once with the first non-null snapshot. */
  fetch<P extends Record<string, PropertyBuilder>>(
    schema: DefinedSchema<P>,
    options?: QueryOptions<P>
  ): Promise<NodeState[]>
  /** Read a single node by id. */
  get(nodeId: string): Promise<NodeState | null>

  // ── writes ─────────────────────────────────────────────────────────
  mutate: {
    create: DataBridge['create']
    update: DataBridge['update']
    delete: DataBridge['delete']
    restore: DataBridge['restore']
    bulkWrite: DataBridge['bulkWrite']
    transaction(operations: TransactionOperation[]): Promise<BridgeTransactionResult>
  }

  // ── authorization ──────────────────────────────────────────────────
  /** High-level grant/role API (null when no `auth` was configured). */
  auth: StoreAuthAPI | null
  /** Evaluate an authorization decision (permissive when no evaluator is set). */
  can(input: AuthCheckInput): Promise<AuthDecision>

  // ── collaborative documents (Y.Doc) ────────────────────────────────
  node: {
    acquire(nodeId: string): Promise<AcquiredDoc>
    release(nodeId: string): void
  }

  // ── cryptography ───────────────────────────────────────────────────
  /** Sign a message with the client's signing key. */
  sign(message: Uint8Array): Uint8Array
  /** Verify a signature (defaults to the client's own public key). */
  verify(message: Uint8Array, signature: Uint8Array, publicKey?: Uint8Array): boolean

  // ── lifecycle ──────────────────────────────────────────────────────
  on(event: 'status', handler: (status: SyncStatus) => void): () => void
  /** Tear down sync, plugins, undo, the (internally created) bridge, and storage. Idempotent. */
  destroy(): Promise<void>
}

/** A bridge that may accept a SyncManager for Y.Doc acquisition (MainThreadBridge does). */
type SyncManagedBridge = DataBridge & {
  setSyncManager?: (syncManager: SyncManagerLike | null) => void
}

function permissiveDecision(input: AuthCheckInput): AuthDecision {
  return {
    allowed: true,
    action: input.action,
    subject: input.subject,
    resource: input.nodeId,
    roles: [],
    grants: [],
    reasons: [],
    cached: false,
    evaluatedAt: 0,
    duration: 0
  }
}

function reportCrash(
  telemetry: XNetClientTelemetry | undefined,
  err: unknown,
  codeNamespace: string
): void {
  telemetry?.reportCrash(err instanceof Error ? err : new Error(String(err)), { codeNamespace })
}

/** Build the NodeStore from client options (optional seams pass through as undefined). */
function buildNodeStore(options: CreateXNetClientOptions, storage: NodeStorageAdapter): NodeStore {
  return new NodeStore({
    storage,
    authorDID: options.authorDID,
    signingKey: options.signingKey,
    changeSigner: options.changeSigner,
    authEvaluator: options.authEvaluator,
    nodeContentCipher: options.nodeContentCipher,
    auth: options.auth,
    schemaLookup: options.schemaLookup,
    propertyLookup: options.propertyLookup,
    lensRegistry: options.lensRegistry,
    telemetry: options.telemetry
  })
}

/**
 * Production Yjs history capture (exploration 0329): when the storage adapter
 * can persist Yjs snapshots, every doc persist also captures history —
 * min-interval-throttled in steady state, forced at session boundaries — with
 * pinned snapshots (checkpoints/drafts) exempt from eviction.
 */
function buildDocumentHistory(storage: NodeStorageAdapter): DocumentHistoryEngine | undefined {
  const snapshotStorage = storage as Partial<YjsSnapshotStorageAdapter>
  if (
    typeof snapshotStorage.saveYjsSnapshot !== 'function' ||
    typeof snapshotStorage.getYjsSnapshots !== 'function' ||
    typeof snapshotStorage.deleteYjsSnapshots !== 'function'
  ) {
    return undefined
  }
  return new DocumentHistoryEngine(snapshotStorage as YjsSnapshotStorageAdapter, {
    pins: storage.pins
  })
}

/** Build the SyncManager when sync is enabled (else null). */
function buildSyncManager(
  store: NodeStore,
  storage: NodeStorageAdapter,
  options: CreateXNetClientOptions
): SyncManager | null {
  const sync = options.sync
  if (!sync) return null
  const signalingUrl = sync.signalingUrl ?? sync.signalingUrls?.[0] ?? 'ws://localhost:4444'
  return createSyncManager({
    nodeStore: store,
    storage,
    documentHistory: buildDocumentHistory(storage),
    signalingUrl,
    authorDID: options.authorDID,
    signingKey: options.signingKey,
    signalingUrls: sync.signalingUrls,
    replication: sync.replication,
    blobStore: sync.blobStore,
    nodeSyncRoom: sync.nodeSyncRoom,
    ucanToken: sync.ucanToken,
    getUCANToken: sync.getUCANToken,
    poolSize: sync.poolSize,
    trackTTL: sync.trackTTL,
    onDocUpdate: sync.onDocUpdate,
    onDocEvict: sync.onDocEvict
  })
}

/** Wire a SyncManager into the bridge and start it (unless autoStart is false). */
function startSyncManager(
  syncManager: SyncManager,
  bridge: DataBridge,
  sync: XNetClientSyncOptions,
  telemetry: XNetClientTelemetry | undefined
): void {
  const managed = bridge as SyncManagedBridge
  managed.setSyncManager?.(syncManager)
  if (sync.autoStart === false) return
  syncManager.start().catch((err) => reportCrash(telemetry, err, 'runtime.syncManager.start'))
}

/**
 * Draft privacy must be rehydrated BEFORE outbound sync starts so a reload
 * never replays draft clones into the personal node-sync room (0329).
 */
async function startSyncManagerWithDraftPrivacy(
  store: NodeStore,
  syncManager: SyncManager,
  bridge: DataBridge,
  sync: XNetClientSyncOptions,
  telemetry: XNetClientTelemetry | undefined
): Promise<void> {
  try {
    await rehydrateDraftPrivacy(store)
  } catch (err) {
    reportCrash(telemetry, err, 'runtime.drafts.rehydratePrivacy')
  }
  startSyncManager(syncManager, bridge, sync, telemetry)
}

/** Build the PluginRegistry when plugins are enabled (else null). */
function buildPlugins(store: NodeStore, options: CreateXNetClientOptions): PluginRegistry | null {
  const plugins = options.plugins
  if (!plugins) return null
  const registry = new PluginRegistry(store, plugins.platform ?? 'web')
  if (plugins.autoLoad !== false) {
    registry
      .loadFromStore()
      .catch((err: unknown) => reportCrash(options.telemetry, err, 'runtime.plugins.loadFromStore'))
  }
  return registry
}

/** Build the app-wide UndoManager when undo is enabled (else null). */
function buildUndo(store: NodeStore, options: CreateXNetClientOptions): UndoManager | null {
  const undo = options.undo
  if (!undo) return null
  const manager = new UndoManager(
    store,
    options.authorDID,
    { localOnly: undo.localOnly ?? true, maxStackSize: undo.maxStackSize ?? 200 },
    options.telemetry
  )
  manager.start()
  return manager
}

/** Deactivate every active plugin (best-effort) during teardown. */
async function deactivateAllPlugins(registry: PluginRegistry): Promise<void> {
  for (const plugin of registry.getAll()) {
    if (plugin.status === 'active') {
      await registry.deactivate(plugin.manifest.id).catch(() => {})
    }
  }
}

/**
 * Construct an xNet runtime. Returns a ready-to-use {@link XNetClient}.
 *
 * @example
 * const client = await createXNetClient({
 *   nodeStorage: new MemoryNodeStorageAdapter(),
 *   authorDID: identity.did,
 *   signingKey: privateKey
 * })
 * const tasks = await client.fetch(TaskSchema, { where: { status: 'todo' } })
 * await client.mutate.create(TaskSchema, { title: 'Ship it' })
 * await client.destroy()
 */
export async function createXNetClient(options: CreateXNetClientOptions): Promise<XNetClient> {
  const { authorDID, signingKey, identity, telemetry, dataBridge, bridgeOptions, sync } = options

  if (!authorDID || !signingKey) {
    throw new Error('createXNetClient requires both authorDID and signingKey.')
  }

  // ── storage + store ──────────────────────────────────────────────
  const storage = options.nodeStorage ?? new MemoryNodeStorageAdapter()
  if ('open' in storage && typeof storage.open === 'function') {
    await storage.open()
  }

  const store = buildNodeStore(options, storage)
  await store.initialize()

  // ── bridge ───────────────────────────────────────────────────────
  const bridgeCreatedInternally = !dataBridge
  const bridge: DataBridge = dataBridge ?? createMainThreadBridgeSync(store, bridgeOptions)

  // ── optional subsystems ──────────────────────────────────────────
  const syncManager = buildSyncManager(store, storage, options)
  if (syncManager && sync) {
    void startSyncManagerWithDraftPrivacy(store, syncManager, bridge, sync, telemetry)
  }
  const pluginRegistry = buildPlugins(store, options)
  const undoManager = buildUndo(store, options)

  // ── derived crypto ───────────────────────────────────────────────
  const publicKey = getSigningPublicKeyFromPrivate(signingKey)

  let destroyed = false

  const runtimeStatus: XNetClientRuntimeStatus = {
    phase: 'ready',
    bridgeMode: bridgeCreatedInternally ? 'main-thread' : 'custom',
    syncEnabled: syncManager !== null
  }

  const client: XNetClient = {
    store,
    bridge,
    syncManager,
    plugins: pluginRegistry,
    undo: undoManager,
    identity,
    authorDID,
    get status() {
      return bridge.status
    },
    runtimeStatus,

    query: bridge.query.bind(bridge),

    async fetch(schema, queryOptions) {
      const subscription = bridge.query(schema, queryOptions)
      const immediate = subscription.getSnapshot()
      if (immediate !== null) return immediate
      return new Promise<NodeState[]>((resolve) => {
        const unsubscribe = subscription.subscribe(() => {
          const snapshot = subscription.getSnapshot()
          if (snapshot !== null) {
            unsubscribe()
            resolve(snapshot)
          }
        })
      })
    },

    get(nodeId) {
      return store.get(nodeId)
    },

    mutate: {
      create: bridge.create.bind(bridge),
      update: bridge.update.bind(bridge),
      delete: bridge.delete.bind(bridge),
      restore: bridge.restore.bind(bridge),
      bulkWrite: bridge.bulkWrite.bind(bridge),
      transaction(operations) {
        if (typeof bridge.transaction !== 'function') {
          throw new Error('The active DataBridge does not support transactions.')
        }
        return bridge.transaction(operations)
      }
    },

    auth: options.auth ?? null,

    async can(input) {
      if (options.authEvaluator) return options.authEvaluator.can(input)
      return permissiveDecision(input)
    },

    node: {
      async acquire(nodeId) {
        if (typeof bridge.acquireDoc !== 'function') {
          throw new Error(
            'node.acquire() requires a doc-capable bridge with a SyncManager. ' +
              'Enable `sync` or supply a bridge that implements acquireDoc().'
          )
        }
        return bridge.acquireDoc(nodeId)
      },
      release(nodeId) {
        bridge.releaseDoc?.(nodeId)
      }
    },

    sign(message) {
      return sign(message, signingKey)
    },
    verify(message, signature, key) {
      return verify(message, signature, key ?? publicKey)
    },

    on(event, handler) {
      return bridge.on(event, handler)
    },

    async destroy() {
      if (destroyed) return
      destroyed = true
      runtimeStatus.phase = 'destroyed'

      undoManager?.stop()

      if (pluginRegistry) {
        await deactivateAllPlugins(pluginRegistry)
      }

      if (syncManager) {
        await syncManager.stop().catch(() => {})
      }

      // Detach the sync manager from the bridge before teardown.
      const managedBridge = bridge as SyncManagedBridge
      managedBridge.setSyncManager?.(null)

      if (bridgeCreatedInternally) {
        bridge.destroy()
      }

      if ('close' in storage && typeof storage.close === 'function') {
        await storage.close()
      }
    }
  }

  return client
}
