/**
 * XNet React context provider
 *
 * Provides both the legacy Zustand store (XNetStore) and the new NodeStore.
 * Apps should migrate to using useQuery/useMutate/useDocument hooks which
 * use the NodeStore internally.
 */
import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { StorageAdapter } from '@xnet/storage'
import type { NetworkNode } from '@xnet/network'
import type { Identity } from '@xnet/identity'
import type { SearchIndex } from '@xnet/query'
import type { DID } from '@xnet/core'
import { NodeStore, MemoryNodeStorageAdapter, type NodeStorageAdapter } from '@xnet/data'
import { createXNetStore, type XNetStore } from './store/xnet'

/**
 * XNet configuration
 */
export interface XNetConfig {
  /** Legacy storage adapter for XDocument-based storage */
  storage: StorageAdapter
  /** Node storage adapter for NodeStore (defaults to MemoryNodeStorageAdapter) */
  nodeStorage?: NodeStorageAdapter
  /** Author's DID for signing changes */
  authorDID?: DID
  /** Ed25519 signing key */
  signingKey?: Uint8Array
  /** Network node for P2P */
  network?: NetworkNode
  /** User identity */
  identity?: Identity
  /** Search index */
  searchIndex?: SearchIndex
}

/**
 * XNet context value
 */
export interface XNetContextValue {
  /** Legacy Zustand store for XDocument operations */
  store: XNetStore
  /** New NodeStore for Node operations */
  nodeStore: NodeStore | null
  /** Whether NodeStore is initialized */
  nodeStoreReady: boolean
  /** Legacy storage adapter */
  storage: StorageAdapter
  network?: NetworkNode
  identity?: Identity
  searchIndex?: SearchIndex
  isReady: boolean
}

const XNetContext = createContext<XNetContextValue | null>(null)

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
 * Provides both legacy XNetStore and new NodeStore for gradual migration.
 */
export function XNetProvider({ config, children }: XNetProviderProps): JSX.Element {
  // Legacy Zustand store
  const [store] = useState(() => createXNetStore({ storage: config.storage }))
  const [isReady, setIsReady] = useState(false)

  // New NodeStore
  const [nodeStore, setNodeStore] = useState<NodeStore | null>(null)
  const [nodeStoreReady, setNodeStoreReady] = useState(false)

  useEffect(() => {
    // Initialize legacy storage
    config.storage.open().then(() => {
      setIsReady(true)
    })

    // Initialize NodeStore
    const nodeStorageAdapter = config.nodeStorage ?? new MemoryNodeStorageAdapter()
    const authorDID = config.authorDID ?? (config.identity?.did as DID | undefined)
    const signingKey = config.signingKey

    // Skip NodeStore initialization if credentials not provided
    if (!authorDID || !signingKey) {
      console.warn(
        'XNetProvider: authorDID and signingKey not provided. NodeStore will not be initialized. ' +
          'Provide these via config.authorDID/config.signingKey or config.identity.'
      )
      return () => {
        config.storage.close()
      }
    }

    const ns = new NodeStore({
      storage: nodeStorageAdapter,
      authorDID,
      signingKey
    })

    ns.initialize().then(() => {
      setNodeStore(ns)
      setNodeStoreReady(true)
    })

    return () => {
      config.storage.close()
    }
  }, [
    config.storage,
    config.nodeStorage,
    config.authorDID,
    config.signingKey,
    config.identity?.did
  ])

  const value: XNetContextValue = {
    store,
    nodeStore,
    nodeStoreReady,
    storage: config.storage,
    network: config.network,
    identity: config.identity,
    searchIndex: config.searchIndex,
    isReady
  }

  return React.createElement(XNetContext.Provider, { value }, children)
}

/**
 * Hook to access XNet context
 */
export function useXNet(): XNetContextValue {
  const context = useContext(XNetContext)
  if (!context) {
    throw new Error('useXNet must be used within an XNetProvider')
  }
  return context
}
