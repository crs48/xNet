/**
 * useRoomSession — join a presence room while mounted (0167).
 * The single join/leave lifecycle shared by the workspace roster and
 * per-node rooms.
 */
import type { PeerPresence, RoomManager, RoomSession } from '@xnetjs/comms'
import { useEffect, useState } from 'react'

export interface RoomSessionState {
  session: RoomSession | null
  peers: PeerPresence[]
}

export function useRoomSession(
  roomManager: RoomManager | null,
  nodeId: string | null
): RoomSessionState {
  const [session, setSession] = useState<RoomSession | null>(null)
  const [peers, setPeers] = useState<PeerPresence[]>([])

  useEffect(() => {
    if (!roomManager || !nodeId) return
    let active = true
    let joined: RoomSession | null = null
    let unsubscribe: (() => void) | null = null

    void roomManager.join(nodeId).then((s) => {
      if (!active) {
        s.leave()
        return
      }
      joined = s
      setSession(s)
      setPeers(s.getPeers())
      unsubscribe = s.onPeersChange(setPeers)
    })

    return () => {
      active = false
      unsubscribe?.()
      joined?.leave()
      setSession(null)
      setPeers([])
    }
  }, [roomManager, nodeId])

  return { session, peers }
}
