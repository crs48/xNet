/**
 * XNet React context provider
 *
 * Provides NodeStore and optional identity to the React tree.
 * All data access happens through useQuery/useMutate/useNode hooks.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode
} from 'react'
import type { Identity } from '@xnet/identity'
import type { DID } from '@xnet/core'
import { NodeStore, MemoryNodeStorageAdapter, type NodeStorageAdapter } from '@xnet/data'
import { createSyncManager, type SyncManager } from './sync/sync-manager'
import type { BlobStoreForSync } from './sync/blob-sync'

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
  /** Disable Background Sync Manager (default: false) */
  disableSyncManager?: boolean
  /** Provide an external SyncManager (e.g., IPC-based for Electron desktop).
   *  When provided, the internal SyncManager creation is skipped. */
  syncManager?: SyncManager
  /** Blob store for P2P blob sync (images, files). If provided, the SyncManager
   *  will sync blobs alongside Y.Doc state. Typically a BlobStore from @xnet/storage. */
  blobStore?: BlobStoreForSync
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
  /** Blob store for content-addressed storage (null if not configured) */
  blobStore: BlobStoreForSync | null
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
  const nodeStorageRef = useRef<NodeStorageAdapter | null>(null)

  useEffect(() => {
    const nodeStorageAdapter = config.nodeStorage ?? new MemoryNodeStorageAdapter()
    nodeStorageRef.current = nodeStorageAdapter
    const authorDID = config.authorDID ?? (config.identity?.did as DID | undefined)
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
    }

    initializeNodeStore()

    return () => {
      cancelled = true
      setNodeStore(null)
      setNodeStoreReady(false)
      if ('close' in nodeStorageAdapter && typeof nodeStorageAdapter.close === 'function') {
        nodeStorageAdapter.close()
      }
    }
  }, [config.nodeStorage, config.authorDID, config.signingKey, config.identity?.did])

  // Create SyncManager when NodeStore is ready
  useEffect(() => {
    // If an external SyncManager is provided (e.g., IPC-based for Electron), use it directly
    if (config.syncManager) {
      // Set the syncManager immediately so components can subscribe to status updates
      setSyncManager(config.syncManager)

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
      setSyncManager(null)
      return
    }

    const storage = nodeStorageRef.current
    if (!storage) return

    const signalingUrl = config.signalingServers?.[0] ?? 'ws://localhost:4444'
    const authorDID = config.authorDID ?? (config.identity?.did as string | undefined)

    const sm = createSyncManager({
      nodeStore,
      storage,
      signalingUrl,
      authorDID,
      blobStore: config.blobStore
    })

    sm.start()
      .then(() => {
        setSyncManager(sm)
      })
      .catch((err) => {
        console.warn('[XNetProvider] SyncManager failed to start:', err)
      })

    return () => {
      sm.stop().catch((err) => {
        console.warn('[XNetProvider] SyncManager failed to stop:', err)
      })
      setSyncManager(null)
    }
  }, [
    nodeStore,
    nodeStoreReady,
    config.disableSyncManager,
    config.syncManager,
    config.signalingServers,
    config.authorDID,
    config.identity?.did,
    config.blobStore
  ])

  const authorDID = config.authorDID ?? (config.identity?.did as string | undefined)

  const value: XNetContextValue = {
    nodeStore,
    nodeStoreReady,
    identity: config.identity,
    authorDID: authorDID ?? null,
    syncManager,
    blobStore: config.blobStore ?? null
  }

  return React.createElement(XNetContext.Provider, { value }, children)
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
