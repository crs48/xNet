/**
 * useNodeStore hook - internal access to the NodeStore from XNetProvider context.
 *
 * This is NOT part of the public API. Use useQuery/useMutate/useDocument instead.
 * Only @xnet/devtools uses this via the @xnet/react/internal subpath.
 */
import { useContext } from 'react'
import type { NodeStore } from '@xnet/data'
import { XNetContext } from '../context'

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

/**
 * Hook to access the NodeStore from XNetProvider context.
 *
 * @internal Not part of the public API.
 */
export function useNodeStore(): NodeStoreContextValue {
  const context = useContext(XNetContext)

  if (context) {
    return {
      store: context.nodeStore,
      isReady: context.nodeStoreReady,
      error: null
    }
  }

  throw new Error('useNodeStore must be used within an XNetProvider')
}
