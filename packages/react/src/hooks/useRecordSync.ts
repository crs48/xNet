/**
 * useRecordSync hook for P2P sync of record databases
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import {
  RecordSyncProvider,
  createRecordSyncProvider,
  type RecordStore,
  type SyncStatus,
  type PeerState,
  type RecordOperation,
  type DatabaseId
} from '@xnet/records'
import type { DID } from '@xnet/core'

/**
 * Options for record sync
 */
export interface UseRecordSyncOptions {
  /** Record store to sync */
  store: RecordStore | null
  /** Database ID to sync */
  databaseId: DatabaseId | null
  /** Current user's DID */
  peerId: DID | null
  /** Signaling server URLs (defaults to localhost for dev) */
  signalingServers?: string[]
  /** Enable sync (defaults to true) */
  enabled?: boolean
  /** Callback when an operation is received from a peer */
  onOperationReceived?: (op: RecordOperation) => void
}

/**
 * Result from useRecordSync hook
 */
export interface UseRecordSyncResult {
  /** Current sync status */
  status: SyncStatus
  /** Whether connected to signaling server */
  connected: boolean
  /** Number of connected peers */
  peerCount: number
  /** List of connected peers */
  peers: PeerState[]
  /** Broadcast an operation to peers */
  broadcastOperation: (op: RecordOperation) => Promise<void>
  /** Manually trigger reconnect */
  reconnect: () => void
}

/** Default signaling servers for local development */
const DEFAULT_SIGNALING_SERVERS = ['ws://localhost:4000']

/**
 * Hook to enable P2P sync for a record database
 *
 * @example
 * ```tsx
 * const store = useRecordStore()
 * const { status, peerCount, broadcastOperation } = useRecordSync({
 *   store,
 *   databaseId: 'db:123',
 *   peerId: identity.did
 * })
 *
 * // When creating/updating items, broadcast to peers
 * const handleCreate = async () => {
 *   const item = await store.createItem(databaseId, { title: 'New' })
 *   const ops = await store.getOperationsForSync(databaseId)
 *   await broadcastOperation(ops[ops.length - 1])
 * }
 * ```
 */
export function useRecordSync(options: UseRecordSyncOptions): UseRecordSyncResult {
  const {
    store,
    databaseId,
    peerId,
    signalingServers = DEFAULT_SIGNALING_SERVERS,
    enabled = true,
    onOperationReceived
  } = options

  const providerRef = useRef<RecordSyncProvider | null>(null)
  const [status, setStatus] = useState<SyncStatus>('disconnected')
  const [peers, setPeers] = useState<PeerState[]>([])

  // Create and manage the sync provider
  useEffect(() => {
    if (!store || !databaseId || !peerId || !enabled || signalingServers.length === 0) {
      return
    }

    // Create provider
    const provider = createRecordSyncProvider({
      store,
      databaseId,
      peerId,
      signalingServers
    })
    providerRef.current = provider

    // Subscribe to events
    const unsubStatus = provider.on('status-change', (newStatus) => {
      setStatus(newStatus)
    })

    const unsubPeerJoin = provider.on('peer-join', () => {
      setPeers(provider.getPeers())
    })

    const unsubPeerLeave = provider.on('peer-leave', () => {
      setPeers(provider.getPeers())
    })

    const unsubOpReceived = provider.on('operation-received', (op) => {
      onOperationReceived?.(op)
    })

    // Connect
    provider.connect()

    // Cleanup
    return () => {
      unsubStatus()
      unsubPeerJoin()
      unsubPeerLeave()
      unsubOpReceived()
      provider.disconnect()
      providerRef.current = null
      setStatus('disconnected')
      setPeers([])
    }
  }, [store, databaseId, peerId, enabled, signalingServers.join(',')])

  // Stable callback for broadcasting operations
  const broadcastOperation = useCallback(async (op: RecordOperation) => {
    if (providerRef.current) {
      await providerRef.current.broadcastOperation(op)
    }
  }, [])

  // Reconnect function
  const reconnect = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.disconnect()
      providerRef.current.connect()
    }
  }, [])

  return {
    status,
    connected: status === 'connected' || status === 'syncing' || status === 'synced',
    peerCount: peers.length,
    peers,
    broadcastOperation,
    reconnect
  }
}
