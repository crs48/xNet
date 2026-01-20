/**
 * useSync hook for sync status and peers
 */
import { useEffect } from 'react'
import { useXNet } from '../context'

/**
 * Result from useSync hook
 */
export interface UseSyncResult {
  status: 'offline' | 'connecting' | 'synced'
  peers: string[]
  peerCount: number
}

/**
 * Hook for accessing sync status
 */
export function useSync(): UseSyncResult {
  const { store, network } = useXNet()

  // Subscribe to sync state
  const syncStatus = store((state) => state.syncStatus)
  const peers = store((state) => state.peers)

  useEffect(() => {
    if (!network) {
      store.getState().setSyncStatus('offline')
      store.getState().setPeers([])
      return
    }

    // Set initial connecting state
    store.getState().setSyncStatus('connecting')

    // In real implementation, would subscribe to network events
    // and update sync status accordingly
  }, [network, store])

  return {
    status: syncStatus,
    peers,
    peerCount: peers.length
  }
}
