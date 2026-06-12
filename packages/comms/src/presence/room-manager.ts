/**
 * RoomManager — the Room primitive from exploration 0167.
 *
 * `join(nodeId)` attaches the local user to the awareness room for any node
 * (a Channel, a Page, a Database, the workspace presence room) and exposes
 * typed presence updates plus a roster subscription. One code path serves
 * "who is viewing this document", channel occupancy, and call membership.
 *
 * Sessions are refcounted per node ID: panels, tabs, and the dock can join
 * the same room independently and the room is only left when the last
 * session leaves.
 */

import type {
  AwarenessLike,
  CallPresence,
  PeerPresence,
  PresenceStatus,
  RoomPresence,
  RoomProvider,
  UserCard
} from './types'
import { remotePeers } from './helpers'
import { workspacePresenceRoomId } from './types'

export interface RoomSession {
  readonly nodeId: string
  /** Merge presence fields into this client's state (never clobbers). */
  update(fields: Partial<RoomPresence>): void
  /** Set or clear the typing indicator (auto-expires after ttlMs). */
  setTyping(channelId: string | null, ttlMs?: number): void
  /** Advertise or clear call membership. */
  setCall(call: CallPresence | null): void
  setStatus(status: PresenceStatus): void
  /** Remote peers currently in the room. */
  getPeers(): PeerPresence[]
  /** Subscribe to roster changes; returns unsubscribe. */
  onPeersChange(callback: (peers: PeerPresence[]) => void): () => void
  /** Release this session (room is left when the last session leaves). */
  leave(): void
}

export interface RoomManager {
  join(nodeId: string): Promise<RoomSession>
  /** Join the workspace-wide presence roster. */
  joinWorkspace(workspaceId: string): Promise<RoomSession>
  /** Tear down every open session (app shutdown). */
  leaveAll(): void
}

export const TYPING_TTL_MS = 4000

interface RoomEntry {
  awareness: AwarenessLike
  refs: number
}

function mergeLocalState(awareness: AwarenessLike, fields: Partial<RoomPresence>): void {
  const current = awareness.getLocalState() ?? {}
  awareness.setLocalState({ ...current, ...fields, lastUpdated: Date.now() })
}

export function createRoomManager(provider: RoomProvider, me: UserCard): RoomManager {
  const rooms = new Map<string, RoomEntry>()

  async function acquireRoom(nodeId: string): Promise<RoomEntry> {
    const existing = rooms.get(nodeId)
    if (existing) {
      existing.refs += 1
      return existing
    }
    await provider.acquire(nodeId)
    const awareness = provider.getAwareness(nodeId)
    if (!awareness) {
      throw new Error(`No awareness available for room ${nodeId}`)
    }
    const entry: RoomEntry = { awareness, refs: 1 }
    rooms.set(nodeId, entry)
    mergeLocalState(awareness, { user: me })
    return entry
  }

  function releaseRoom(nodeId: string): void {
    const entry = rooms.get(nodeId)
    if (!entry) return
    entry.refs -= 1
    if (entry.refs > 0) return
    rooms.delete(nodeId)
    entry.awareness.setLocalState(null)
    provider.release(nodeId)
  }

  function createSession(nodeId: string, entry: RoomEntry): RoomSession {
    const { awareness } = entry
    let left = false

    return {
      nodeId,
      update(fields) {
        if (!left) mergeLocalState(awareness, fields)
      },
      setTyping(channelId, ttlMs = TYPING_TTL_MS) {
        const typing = channelId ? { channelId, until: Date.now() + ttlMs } : undefined
        if (!left) mergeLocalState(awareness, { typing })
      },
      setCall(call) {
        if (!left) mergeLocalState(awareness, { call: call ?? undefined })
      },
      setStatus(status) {
        if (!left) mergeLocalState(awareness, { status })
      },
      getPeers() {
        return remotePeers(awareness.getStates(), awareness.clientID)
      },
      onPeersChange(callback) {
        const handler = (): void => {
          if (!left) callback(remotePeers(awareness.getStates(), awareness.clientID))
        }
        awareness.on('change', handler)
        return () => awareness.off('change', handler)
      },
      leave() {
        if (left) return
        left = true
        releaseRoom(nodeId)
      }
    }
  }

  return {
    async join(nodeId) {
      const entry = await acquireRoom(nodeId)
      return createSession(nodeId, entry)
    },
    joinWorkspace(workspaceId) {
      return this.join(workspacePresenceRoomId(workspaceId))
    },
    leaveAll() {
      for (const [nodeId, entry] of rooms) {
        entry.awareness.setLocalState(null)
        provider.release(nodeId)
        rooms.delete(nodeId)
      }
    }
  }
}
