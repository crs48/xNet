/**
 * useNodeSync hook for P2P sync of NodeStore data
 *
 * This hook manages synchronization of Nodes between peers using
 * the NodeStore and a WebSocket signaling server.
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import type { DID } from '@xnet/core'
import type { NodeStore, NodeChange } from '@xnet/data'
import type { SyncStatus } from '@xnet/sync'

/**
 * Peer state for sync
 */
export interface NodePeerState {
  peerId: string
  lamportTime: number
  lastSeen: number
}

/**
 * Options for node sync
 */
export interface UseNodeSyncOptions {
  /** NodeStore to sync */
  store: NodeStore | null
  /** Current user's DID */
  peerId: DID | null
  /** Signaling server URLs (defaults to localhost for dev) */
  signalingServers?: string[]
  /** Enable sync (defaults to true) */
  enabled?: boolean
  /** Callback when a change is received from a peer */
  onChangeReceived?: (change: NodeChange) => void
}

/**
 * Result from useNodeSync hook
 */
export interface UseNodeSyncResult {
  /** Current sync status */
  status: SyncStatus
  /** Whether connected to signaling server */
  connected: boolean
  /** Number of connected peers */
  peerCount: number
  /** List of connected peers */
  peers: NodePeerState[]
  /** Broadcast changes to peers */
  broadcastChanges: (changes: NodeChange[]) => Promise<void>
  /** Manually trigger reconnect */
  reconnect: () => void
}

/** Default signaling servers for local development */
const DEFAULT_SIGNALING_SERVERS = ['ws://localhost:4000']

/**
 * Sync message types for the WebSocket protocol
 */
interface SyncMessage {
  type: 'announce' | 'sync-request' | 'sync-response' | 'changes-push'
  from: string
  lamportTime?: number
  changes?: NodeChange[]
  sinceLamportTime?: number
}

/**
 * Hook to enable P2P sync for a NodeStore
 *
 * @example
 * ```tsx
 * const store = useNodeStore()
 * const { status, peerCount, broadcastChanges } = useNodeSync({
 *   store,
 *   peerId: identity.did
 * })
 *
 * // When creating/updating nodes, broadcast to peers
 * const handleCreate = async () => {
 *   const node = await store.create({
 *     schemaId: 'xnet://xnet.dev/Task',
 *     properties: { title: 'New Task' }
 *   })
 *   const changes = await store.getChanges(node.id)
 *   await broadcastChanges(changes)
 * }
 * ```
 */
export function useNodeSync(options: UseNodeSyncOptions): UseNodeSyncResult {
  const {
    store,
    peerId,
    signalingServers = DEFAULT_SIGNALING_SERVERS,
    enabled = true,
    onChangeReceived
  } = options

  const wsRef = useRef<WebSocket | null>(null)
  const [status, setStatus] = useState<SyncStatus>('disconnected')
  const [peers, setPeers] = useState<NodePeerState[]>([])
  const peersRef = useRef<Map<string, NodePeerState>>(new Map())

  // Room name for this sync group
  const roomName = peerId ? `xnet-nodes-${peerId}` : null

  // Connect to signaling server
  useEffect(() => {
    if (!store || !peerId || !enabled || signalingServers.length === 0 || !roomName) {
      return
    }

    const url = signalingServers[0]
    setStatus('connecting')

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setStatus('syncing')
        // Subscribe to room
        ws.send(JSON.stringify({ type: 'subscribe', topics: [roomName] }))
        // Announce presence
        announcePresence(ws, peerId, store)
      }

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'publish' && message.topic === roomName) {
            const { from, payload } = message.data
            if (from !== peerId) {
              await handlePeerMessage(
                from,
                payload as SyncMessage,
                ws,
                store,
                peerId,
                onChangeReceived
              )
            }
          }
        } catch (err) {
          console.error('Failed to handle sync message:', err)
        }
      }

      ws.onclose = () => {
        setStatus('disconnected')
        peersRef.current.clear()
        setPeers([])
      }

      ws.onerror = () => {
        setStatus('disconnected')
      }

      return () => {
        ws.send(JSON.stringify({ type: 'unsubscribe', topics: [roomName] }))
        ws.close()
        wsRef.current = null
        peersRef.current.clear()
        setPeers([])
      }
    } catch (err) {
      console.error('Failed to connect to signaling server:', err)
      setStatus('disconnected')
    }
  }, [store, peerId, enabled, signalingServers.join(','), roomName, onChangeReceived])

  // Announce presence to peers
  const announcePresence = async (ws: WebSocket, peerId: DID, store: NodeStore) => {
    const message: SyncMessage = {
      type: 'announce',
      from: peerId,
      lamportTime: store.getCurrentLamportTime()
    }
    publish(ws, roomName!, peerId, message)
  }

  // Handle messages from peers
  const handlePeerMessage = async (
    fromPeerId: string,
    msg: SyncMessage,
    ws: WebSocket,
    store: NodeStore,
    localPeerId: DID,
    onChangeReceived?: (change: NodeChange) => void
  ) => {
    switch (msg.type) {
      case 'announce': {
        // Track peer
        const peer: NodePeerState = {
          peerId: fromPeerId,
          lamportTime: msg.lamportTime ?? 0,
          lastSeen: Date.now()
        }
        peersRef.current.set(fromPeerId, peer)
        setPeers(Array.from(peersRef.current.values()))

        // Check if we need to sync
        const localTime = store.getCurrentLamportTime()
        if (msg.lamportTime && msg.lamportTime > localTime) {
          // Request sync from peer
          setStatus('syncing')
          const request: SyncMessage = {
            type: 'sync-request',
            from: localPeerId,
            sinceLamportTime: localTime
          }
          publish(ws, roomName!, localPeerId, request)
        } else if (localTime > (msg.lamportTime ?? 0)) {
          // Send our changes to peer
          const changes = await store.getAllChanges()
          const newChanges = changes.filter((c) => c.lamport.time > (msg.lamportTime ?? 0))
          if (newChanges.length > 0) {
            const push: SyncMessage = {
              type: 'changes-push',
              from: localPeerId,
              changes: newChanges
            }
            publish(ws, roomName!, localPeerId, push)
          }
        }
        break
      }

      case 'sync-request': {
        // Send changes since requested time
        const changes = await store.getAllChanges()
        const newChanges = changes.filter((c) => c.lamport.time > (msg.sinceLamportTime ?? 0))
        const response: SyncMessage = {
          type: 'sync-response',
          from: localPeerId,
          changes: newChanges,
          lamportTime: store.getCurrentLamportTime()
        }
        publish(ws, roomName!, localPeerId, response)
        break
      }

      case 'sync-response':
      case 'changes-push': {
        // Apply received changes
        if (msg.changes && msg.changes.length > 0) {
          await store.applyRemoteChanges(msg.changes)
          for (const change of msg.changes) {
            onChangeReceived?.(change)
          }
        }
        setStatus('synced')

        // Update peer state
        const peer = peersRef.current.get(fromPeerId)
        if (peer && msg.lamportTime) {
          peer.lamportTime = msg.lamportTime
          peer.lastSeen = Date.now()
          setPeers(Array.from(peersRef.current.values()))
        }
        break
      }
    }
  }

  // Publish to room
  const publish = (ws: WebSocket, room: string, from: DID, payload: SyncMessage) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: 'publish',
          topic: room,
          data: { from, payload }
        })
      )
    }
  }

  // Broadcast changes to all peers
  const broadcastChanges = useCallback(
    async (changes: NodeChange[]) => {
      if (!wsRef.current || !peerId || !roomName) return

      const message: SyncMessage = {
        type: 'changes-push',
        from: peerId,
        changes,
        lamportTime: store?.getCurrentLamportTime()
      }
      publish(wsRef.current, roomName, peerId, message)
    },
    [peerId, roomName, store]
  )

  // Reconnect function
  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
    }
    // The useEffect will handle reconnection
  }, [])

  return {
    status,
    connected: status === 'syncing' || status === 'synced',
    peerCount: peers.length,
    peers,
    broadcastChanges,
    reconnect
  }
}
