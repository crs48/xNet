/**
 * Hook for the Sync Monitor panel
 */

import { useState, useEffect } from 'react'
import { useDevTools } from '../../provider/useDevTools'
import type {
  DevToolsEvent,
  SyncStatusEvent,
  SyncPeerConnectedEvent,
  SyncPeerDisconnectedEvent,
  SyncChangeReceivedEvent,
  SyncErrorEvent
} from '../../core/types'

export type SyncEvent =
  | SyncStatusEvent
  | SyncPeerConnectedEvent
  | SyncPeerDisconnectedEvent
  | SyncChangeReceivedEvent
  | SyncErrorEvent

export interface PeerEntry {
  id: string
  name?: string
  connectedAt: number
  status: 'connected' | 'disconnected'
}

export interface SyncStats {
  sent: number
  received: number
  conflicts: number
  errors: number
}

const SYNC_EVENT_TYPES = new Set([
  'sync:status-change',
  'sync:peer-connected',
  'sync:peer-disconnected',
  'sync:change-received',
  'sync:broadcast',
  'sync:error'
])

export function useSyncMonitor() {
  const { eventBus } = useDevTools()
  const [events, setEvents] = useState<SyncEvent[]>([])
  const [peers, setPeers] = useState<PeerEntry[]>([])
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected')
  const [stats, setStats] = useState<SyncStats>({ sent: 0, received: 0, conflicts: 0, errors: 0 })

  // Load initial events from buffer
  useEffect(() => {
    const syncEvents = eventBus
      .getEvents()
      .filter((e) => SYNC_EVENT_TYPES.has(e.type)) as SyncEvent[]
    setEvents(syncEvents)
    rebuildState(syncEvents)
  }, [eventBus])

  // Subscribe to live sync events
  useEffect(() => {
    const unsub = eventBus.subscribe((event: DevToolsEvent) => {
      if (!SYNC_EVENT_TYPES.has(event.type)) return

      setEvents((prev) => [...prev.slice(-499), event as SyncEvent])

      // Update derived state
      if (event.type === 'sync:status-change') {
        setConnectionStatus(event.newStatus)
      } else if (event.type === 'sync:peer-connected') {
        setPeers((prev) => {
          const existing = prev.find((p) => p.id === event.peer.id)
          if (existing) {
            return prev.map((p) =>
              p.id === event.peer.id
                ? { ...p, status: 'connected' as const, connectedAt: Date.now() }
                : p
            )
          }
          return [
            ...prev,
            {
              id: event.peer.id,
              name: event.peer.name,
              connectedAt: Date.now(),
              status: 'connected' as const
            }
          ]
        })
      } else if (event.type === 'sync:peer-disconnected') {
        setPeers((prev) =>
          prev.map((p) => (p.id === event.peerId ? { ...p, status: 'disconnected' as const } : p))
        )
      } else if (event.type === 'sync:change-received') {
        setStats((prev) => ({ ...prev, received: prev.received + 1 }))
      } else if (event.type === 'sync:error') {
        setStats((prev) => ({ ...prev, errors: prev.errors + 1 }))
      }
    })
    return unsub
  }, [eventBus])

  function rebuildState(syncEvents: SyncEvent[]) {
    const peerMap = new Map<string, PeerEntry>()
    let status = 'disconnected'
    let received = 0
    let errors = 0

    for (const event of syncEvents) {
      if (event.type === 'sync:status-change') {
        status = event.newStatus
      } else if (event.type === 'sync:peer-connected') {
        peerMap.set(event.peer.id, {
          id: event.peer.id,
          name: event.peer.name,
          connectedAt: event.wallTime,
          status: 'connected'
        })
      } else if (event.type === 'sync:peer-disconnected') {
        const p = peerMap.get(event.peerId)
        if (p) p.status = 'disconnected'
      } else if (event.type === 'sync:change-received') {
        received++
      } else if (event.type === 'sync:error') {
        errors++
      }
    }

    setConnectionStatus(status)
    setPeers([...peerMap.values()])
    setStats({ sent: 0, received, conflicts: 0, errors })
  }

  return {
    events,
    peers,
    connectionStatus,
    stats
  }
}
