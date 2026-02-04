/**
 * XNet React context provider
 *
 * Provides NodeStore and optional identity to the React tree.
 * All data access happens through useQuery/useMutate/useNode hooks.
 */
import type { ReactNode } from 'react'
import type { Identity } from '@xnet/identity'
import type { DID } from '@xnet/core'
import type { NodeChangeEvent } from '@xnet/data'
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'
import { createUCAN } from '@xnet/identity'
import { NodeStore, MemoryNodeStorageAdapter, type NodeStorageAdapter } from '@xnet/data'
import { PluginRegistry, type Platform } from '@xnet/plugins'
import { AutoBackup } from './hub/auto-backup'
import { uploadBackup } from './hub/backup'
import { createSyncManager, type SyncManager, type SyncStatus } from './sync/sync-manager'
import type { BlobStoreForSync } from './sync/blob-sync'
import type { ConnectionManager } from './sync/connection-manager'
import { PluginRegistryContext } from './hooks/usePlugins'

// Debug logging - enable via localStorage.setItem('xnet:sync:debug', 'true')
function log(...args: unknown[]): void {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('xnet:sync:debug') === 'true') {
    console.log('[XNetProvider]', ...args)
  }
}

const HUB_CAPABILITIES = [
  { with: '*', can: 'hub/*' },
  { with: '*', can: 'backup/*' },
  { with: '*', can: 'query/*' },
  { with: '*', can: 'index/*' }
] as const

const HUB_TOKEN_TTL_SECONDS = 60 * 60 * 24
const HUB_INDEX_DEBOUNCE_MS = 2000

/**
 * XNet configuration
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
  /** Hub integration options */
  hubOptions?: {
    /** Auto-generate UCAN for hub auth (default: true) */
    autoAuth?: boolean
    /** Enable auto-backup on document updates (default: false) */
    autoBackup?: boolean
    /** Backup debounce delay in ms (default: 5000) */
    backupDebounceMs?: number
    /** Enable search indexing on NodeStore changes (default: false) */
    enableSearchIndex?: boolean
  }
  /** Encryption key for hub backups (XChaCha20-Poly1305) */
  encryptionKey?: Uint8Array
  /** Disable Background Sync Manager (default: false) */
  disableSyncManager?: boolean
  /** Provide an external SyncManager (e.g., IPC-based for Electron desktop).
   *  When provided, the internal SyncManager creation is skipped. */
  syncManager?: SyncManager
  /** Blob store for P2P blob sync (images, files). If provided, the SyncManager
   *  will sync blobs alongside Y.Doc state. Typically a BlobStore from @xnet/storage. */
  blobStore?: BlobStoreForSync
  /** Platform for plugin compatibility ('web' | 'electron' | 'mobile'). Defaults to 'web'. */
  platform?: Platform
  /** Disable plugin system (default: false) */
  disablePlugins?: boolean
}

/**
 * XNet context value
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
  /** Encryption key for hub backups */
  encryptionKey: Uint8Array | null
  /** Blob store for content-addressed storage (null if not configured) */
  blobStore: BlobStoreForSync | null
  /** Plugin Registry (null if disabled or not yet initialized) */
  pluginRegistry: PluginRegistry | null
}

/** @internal Exported for useNodeStore hook - not part of public API */
export const XNetContext = createContext<XNetContextValue | null>(null)

/**
 * XNet provider props
 */
export interface XNetProviderProps {
  config: XNetConfig
  children: ReactNode
}

/**
 * XNet provider component
 *
 * Initializes NodeStore and provides it to the React tree.
 */
export function XNetProvider({ config, children }: XNetProviderProps): JSX.Element {
  const [nodeStore, setNodeStore] = useState<NodeStore | null>(null)
  const [nodeStoreReady, setNodeStoreReady] = useState(false)
  const [syncManager, setSyncManager] = useState<SyncManager | null>(null)
  const [hubStatus, setHubStatus] = useState<SyncStatus>('disconnected')
  const [pluginRegistry, setPluginRegistry] = useState<PluginRegistry | null>(null)
  const nodeStorageRef = useRef<NodeStorageAdapter | null>(null)

  const authorDID = config.authorDID ?? (config.identity?.did as string | undefined)
  const hubUrl = config.hubUrl ?? null
  const hubOptions = config.hubOptions
  const autoAuth = hubOptions?.autoAuth ?? true
  const autoBackup = hubOptions?.autoBackup ?? false
  const backupDebounceMs = hubOptions?.backupDebounceMs ?? 5000
  const enableSearchIndex = hubOptions?.enableSearchIndex ?? false
  const encryptionKey = config.encryptionKey ?? null

  const getHubAuthToken = useCallback(async (): Promise<string> => {
    if (!hubUrl || !autoAuth) return ''
    if (!authorDID || !config.signingKey) {
      throw new Error('Missing authorDID/signingKey for hub auth')
    }

    return createUCAN({
      issuer: authorDID,
      issuerKey: config.signingKey,
      audience: hubUrl,
      capabilities: HUB_CAPABILITIES as unknown as Array<{ with: string; can: string }>,
      expiration: Math.floor(Date.now() / 1000) + HUB_TOKEN_TTL_SECONDS
    })
  }, [authorDID, autoAuth, config.signingKey, hubUrl])

  useEffect(() => {
    const nodeStorageAdapter = config.nodeStorage ?? new MemoryNodeStorageAdapter()
    nodeStorageRef.current = nodeStorageAdapter
    const signingKey = config.signingKey

    // Skip NodeStore initialization if credentials not provided
    if (!authorDID || !signingKey) {
      console.warn(
        'XNetProvider: authorDID and signingKey not provided. NodeStore will not be initialized. ' +
          'Provide these via config.authorDID/config.signingKey or config.identity.'
      )
      return
    }

    // Track whether this effect instance is still active (handles StrictMode double-mount)
    let cancelled = false

    // Initialize the node storage adapter if it has an open() method
    const initializeNodeStore = async () => {
      if ('open' in nodeStorageAdapter && typeof nodeStorageAdapter.open === 'function') {
        await nodeStorageAdapter.open()
      }

      // Check if effect was cleaned up while we were awaiting
      if (cancelled) return

      const ns = new NodeStore({
        storage: nodeStorageAdapter,
        authorDID,
        signingKey
      })

      await ns.initialize()

      // Check again after second await
      if (cancelled) return

      setNodeStore(ns)
      setNodeStoreReady(true)

      // Expose NodeStore to window for main process access (Electron Local API)
      if (typeof window !== 'undefined') {
        ;(window as Window & { __xnetNodeStore?: NodeStore }).__xnetNodeStore = ns
      }
    }

    initializeNodeStore()

    return () => {
      cancelled = true
      setNodeStore(null)
      setNodeStoreReady(false)

      // Clean up window reference
      if (typeof window !== 'undefined') {
        delete (window as Window & { __xnetNodeStore?: NodeStore }).__xnetNodeStore
      }

      if ('close' in nodeStorageAdapter && typeof nodeStorageAdapter.close === 'function') {
        nodeStorageAdapter.close()
      }
    }
  }, [authorDID, config.nodeStorage, config.signingKey])

  // Create SyncManager when NodeStore is ready
  useEffect(() => {
    // If an external SyncManager is provided (e.g., IPC-based for Electron), use it directly
    if (config.syncManager) {
      // Set the syncManager immediately so components can subscribe to status updates
      setSyncManager(config.syncManager)

      // If the external SyncManager supports setIdentity (e.g., IPCSyncManager for Electron),
      // set the identity before starting so updates can be signed
      const sm = config.syncManager as SyncManager & {
        setIdentity?: (authorDID: string, signingKey: Uint8Array) => void
      }
      if (sm.setIdentity && authorDID && config.signingKey) {
        sm.setIdentity(authorDID, config.signingKey)
      }

      config.syncManager.start().catch((err) => {
        console.warn('[XNetProvider] External SyncManager failed to start:', err)
        // SyncManager is still usable for local-only operation
      })

      return () => {
        config.syncManager!.stop().catch((err) => {
          console.warn('[XNetProvider] External SyncManager failed to stop:', err)
        })
        setSyncManager(null)
      }
    }

    if (!nodeStore || !nodeStoreReady || config.disableSyncManager) {
      log('SyncManager disabled or NodeStore not ready', {
        nodeStore: !!nodeStore,
        nodeStoreReady,
        disableSyncManager: config.disableSyncManager
      })
      setSyncManager(null)
      return
    }

    const storage = nodeStorageRef.current
    if (!storage) {
      log('No storage adapter available')
      return
    }

    const signalingUrl = hubUrl ?? config.signalingServers?.[0] ?? 'ws://localhost:4444'

    if (autoAuth && hubUrl && (!authorDID || !config.signingKey)) {
      console.warn('[XNetProvider] Hub auth enabled but authorDID/signingKey missing')
    }

    if (autoBackup && (!hubUrl || !encryptionKey)) {
      console.warn('[XNetProvider] Auto-backup requires hubUrl and encryptionKey')
    }

    console.log('[XNetProvider] Creating SyncManager with signalingUrl:', signalingUrl)
    log('Creating SyncManager with signalingUrl:', signalingUrl)
    let autoBackupManager: AutoBackup | null = null
    const enableAutoBackup = Boolean(autoBackup && hubUrl && encryptionKey)

    const sm = createSyncManager({
      nodeStore,
      storage,
      signalingUrl,
      authorDID,
      blobStore: config.blobStore,
      getUCANToken: hubUrl && autoAuth ? getHubAuthToken : undefined,
      onDocUpdate: enableAutoBackup
        ? (nodeId, doc) => {
            autoBackupManager?.handleDocUpdate(nodeId, doc)
          }
        : undefined,
      onDocEvict: enableAutoBackup
        ? (nodeId, doc) => {
            autoBackupManager?.handleDocEvict(nodeId, doc)
          }
        : undefined
    })

    if (enableAutoBackup && hubUrl && encryptionKey) {
      autoBackupManager = new AutoBackup(
        async (docId, plaintext) => {
          await uploadBackup(
            {
              hubUrl,
              encryptionKey,
              getAuthToken: autoAuth ? getHubAuthToken : undefined
            },
            docId,
            plaintext
          )
        },
        {
          debounceMs: backupDebounceMs,
          isEnabled: () => sm.connection?.status === 'connected'
        }
      )
    }

    // Set SyncManager immediately so hooks can use it
    // (it will connect in the background)
    setSyncManager(sm)
    console.log('[XNetProvider] SyncManager created and set in context')
    log('SyncManager created, starting...')

    sm.start()
      .then(() => {
        log('SyncManager started successfully')
      })
      .catch((err) => {
        console.warn('[XNetProvider] SyncManager failed to start:', err)
        log('SyncManager start failed:', err)
      })

    return () => {
      sm.stop().catch((err) => {
        console.warn('[XNetProvider] SyncManager failed to stop:', err)
      })
      autoBackupManager?.destroy()
      setSyncManager(null)
    }
  }, [
    nodeStore,
    nodeStoreReady,
    config.disableSyncManager,
    config.syncManager,
    config.signalingServers,
    config.blobStore,
    authorDID,
    autoAuth,
    autoBackup,
    backupDebounceMs,
    encryptionKey,
    getHubAuthToken,
    hubUrl
  ])

  // Track hub connection status from SyncManager
  useEffect(() => {
    if (!syncManager) {
      setHubStatus('disconnected')
      return
    }

    setHubStatus(syncManager.status)
    return syncManager.on('status', (status) => {
      setHubStatus(status)
    })
  }, [syncManager])

  // Hub search index updates (NodeStore -> hub index)
  useEffect(() => {
    if (!nodeStore || !syncManager || !hubUrl || !enableSearchIndex) return
    const connection = syncManager.connection
    if (!connection) return

    const timers = new Map<string, ReturnType<typeof setTimeout>>()
    const pending = new Map<string, { type: 'update'; meta: { schemaIri: string; title: string; properties: Record<string, unknown> } } | { type: 'remove' }>()

    const schedule = (
      docId: string,
      payload:
        | { type: 'update'; meta: { schemaIri: string; title: string; properties: Record<string, unknown> } }
        | { type: 'remove' }
    ): void => {
      pending.set(docId, payload)
      const existing = timers.get(docId)
      if (existing) clearTimeout(existing)

      timers.set(
        docId,
        setTimeout(() => {
          timers.delete(docId)
          const next = pending.get(docId)
          pending.delete(docId)
          if (!next) return

          if (connection.status !== 'connected') return

          if (next.type === 'remove') {
            connection.sendRaw({ type: 'index-remove', docId })
            return
          }

          connection.sendRaw({
            type: 'index-update',
            docId,
            meta: next.meta
          })
        }, HUB_INDEX_DEBOUNCE_MS)
      )
    }

    const handleChange = (event: NodeChangeEvent) => {
      const node = event.node
      if (!node || node.deleted) {
        schedule(event.change.payload.nodeId, { type: 'remove' })
        return
      }

      if (!node.schemaId) return

      const title = typeof node.properties.title === 'string' ? node.properties.title : ''
      schedule(node.id, {
        type: 'update',
        meta: {
          schemaIri: node.schemaId,
          title,
          properties: node.properties
        }
      })
    }

    const unsubscribe = nodeStore.subscribe(handleChange)

    return () => {
      unsubscribe()
      for (const timer of timers.values()) {
        clearTimeout(timer)
      }
      timers.clear()
      pending.clear()
    }
  }, [enableSearchIndex, hubUrl, nodeStore, syncManager])

  // Create PluginRegistry when NodeStore is ready
  useEffect(() => {
    if (!nodeStore || !nodeStoreReady || config.disablePlugins) {
      log('PluginRegistry disabled or NodeStore not ready')
      setPluginRegistry(null)
      return
    }

    const platform = config.platform ?? 'web'
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

  const value: XNetContextValue = {
    nodeStore,
    nodeStoreReady,
    identity: config.identity,
    authorDID: authorDID ?? null,
    syncManager,
    hubUrl,
    hubStatus,
    hubConnection: syncManager?.connection ?? null,
    getHubAuthToken: hubUrl ? getHubAuthToken : undefined,
    encryptionKey,
    blobStore: config.blobStore ?? null,
    pluginRegistry
  }

  // Wrap children with PluginRegistryContext if plugins are enabled
  const content = pluginRegistry
    ? React.createElement(PluginRegistryContext.Provider, { value: pluginRegistry }, children)
    : children

  return React.createElement(XNetContext.Provider, { value }, content)
}

/**
 * Hook to access XNet context
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
