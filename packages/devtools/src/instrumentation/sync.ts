/**
 * SyncProvider instrumentation
 *
 * Listens to SyncProvider events (status-change, peer-connected,
 * peer-disconnected, change-received, error) and emits DevTools events.
 */

import type { SyncProvider, PeerInfo, SyncStatus } from '@xnet/sync'
import type { DevToolsEventBus } from '../core/event-bus'

export function instrumentSync(
  provider: SyncProvider<unknown>,
  room: string,
  bus: DevToolsEventBus
): () => void {
  let previousStatus: SyncStatus = provider.status

  const onStatus = (status: SyncStatus) => {
    bus.emit({
      type: 'sync:status-change',
      room,
      previousStatus,
      newStatus: status
    })
    previousStatus = status
  }

  const onPeerConnected = (peer: PeerInfo) => {
    bus.emit({
      type: 'sync:peer-connected',
      peer,
      room,
      totalPeers: provider.peers.length
    })
  }

  const onPeerDisconnected = (peerId: string) => {
    bus.emit({
      type: 'sync:peer-disconnected',
      peerId,
      room,
      totalPeers: provider.peers.length
    })
  }

  const onChangeReceived = (change: unknown, peerId: string) => {
    const c = change as { id: string; lamport: unknown }
    bus.emit({
      type: 'sync:change-received',
      changeId: c.id,
      peerId,
      lamport: c.lamport as any,
      room
    })
  }

  const onError = (error: Error) => {
    bus.emit({
      type: 'sync:error',
      error: error.message,
      room
    })
  }

  provider.on('status-change', onStatus)
  provider.on('peer-connected', onPeerConnected)
  provider.on('peer-disconnected', onPeerDisconnected)
  provider.on('change-received', onChangeReceived)
  provider.on('error', onError)

  return () => {
    provider.off('status-change', onStatus)
    provider.off('peer-connected', onPeerConnected)
    provider.off('peer-disconnected', onPeerDisconnected)
    provider.off('change-received', onChangeReceived)
    provider.off('error', onError)
  }
}
