/**
 * useNodeStore hook for NodeStore context management
 *
 * Provides a way to create and access a NodeStore instance within React.
 * Works with both NodeStoreProvider (standalone) and XNetProvider (unified).
 */
import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { NodeStore, MemoryNodeStorageAdapter, type NodeStorageAdapter } from '@xnet/data'
import type { DID } from '@xnet/core'

/**
 * NodeStore context value
 */
export interface NodeStoreContextValue {
  /** The NodeStore instance */
  store: NodeStore | null
  /** Whether the store is initialized and ready */
  isReady: boolean
  /** Any initialization error */
  error: Error | null
}

const NodeStoreContext = createContext<NodeStoreContextValue | null>(null)

// Also import the XNetContext to allow using NodeStore from XNetProvider
// We use a lazy import pattern to avoid circular dependencies
let useXNetContext: (() => { nodeStore: NodeStore | null; nodeStoreReady: boolean } | null) | null =
  null

/**
 * Props for NodeStoreProvider
 */
export interface NodeStoreProviderProps {
  /** Storage adapter (defaults to MemoryNodeStorageAdapter) */
  storage?: NodeStorageAdapter
  /** Author's DID */
  authorDID: DID
  /** Ed25519 signing key */
  signingKey: Uint8Array
  /** Children */
  children: ReactNode
}

/**
 * Provider component for NodeStore context
 *
 * Use this for standalone NodeStore usage. If using XNetProvider,
 * the NodeStore is already provided and you don't need this.
 *
 * @example
 * ```tsx
 * <NodeStoreProvider authorDID={identity.did} signingKey={identity.signingKey}>
 *   <App />
 * </NodeStoreProvider>
 * ```
 */
export function NodeStoreProvider({
  storage,
  authorDID,
  signingKey,
  children
}: NodeStoreProviderProps): JSX.Element {
  const [store, setStore] = useState<NodeStore | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const adapter = storage ?? new MemoryNodeStorageAdapter()
    const nodeStore = new NodeStore({
      storage: adapter,
      authorDID,
      signingKey
    })

    nodeStore
      .initialize()
      .then(() => {
        setStore(nodeStore)
        setIsReady(true)
      })
      .catch((err) => {
        setError(err)
      })
  }, [storage, authorDID, signingKey])

  const value: NodeStoreContextValue = {
    store,
    isReady,
    error
  }

  return React.createElement(NodeStoreContext.Provider, { value }, children)
}

/**
 * Hook to access the NodeStore from context
 *
 * Works with both NodeStoreProvider and XNetProvider.
 *
 * @example
 * ```tsx
 * const { store, isReady } = useNodeStore()
 *
 * if (!isReady) return <Loading />
 *
 * const tasks = await store.list({ schemaId: 'xnet://xnet.dev/Task' })
 * ```
 */
export function useNodeStore(): NodeStoreContextValue {
  // First try NodeStoreProvider context
  const nodeStoreContext = useContext(NodeStoreContext)
  if (nodeStoreContext) {
    return nodeStoreContext
  }

  // Fall back to XNetProvider context (lazy import to avoid circular deps)
  if (!useXNetContext) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const contextModule = require('../context')
    const XNetContext = contextModule.useXNet
    useXNetContext = () => {
      try {
        const ctx = XNetContext()
        return { nodeStore: ctx.nodeStore, nodeStoreReady: ctx.nodeStoreReady }
      } catch {
        return null
      }
    }
  }

  const xnetContext = useXNetContext?.()
  if (xnetContext) {
    return {
      store: xnetContext.nodeStore,
      isReady: xnetContext.nodeStoreReady,
      error: null
    }
  }

  throw new Error('useNodeStore must be used within a NodeStoreProvider or XNetProvider')
}
