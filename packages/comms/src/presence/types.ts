/**
 * App-level presence types (exploration 0167).
 *
 * Presence rides Yjs Awareness on a node's room: ephemeral, last-writer-wins
 * per client, dropped automatically when a peer disconnects. The same field
 * shapes are merged into awareness states that may also carry canvas
 * presence (cursor/selection) — RoomManager only ever merges, never clobbers.
 */

/** Who a presence entry belongs to. */
export interface UserCard {
  did: string
  name?: string
  color?: string
  avatar?: string
}

export type PresenceStatus = 'active' | 'idle' | 'dnd'

/** Ephemeral typing indicator; expires at `until` without a clear event. */
export interface TypingPresence {
  channelId: string
  /** Epoch ms after which this indicator is stale */
  until: number
}

/** Advertises call membership (rendered as "in a call" everywhere). */
export interface CallPresence {
  roomId: string
  audio: boolean
  video: boolean
  screen: boolean
}

/** App-level presence fields carried on a room's awareness state. */
export interface RoomPresence {
  user?: UserCard
  /** Node ID the user is currently viewing */
  viewing?: string
  status?: PresenceStatus
  typing?: TypingPresence
  call?: CallPresence
  lastUpdated?: number
}

/** A remote peer's presence, keyed by their awareness clientID. */
export interface PeerPresence extends RoomPresence {
  clientId: number
}

/**
 * Minimal Awareness interface (compatible with y-protocols/awareness).
 * Mirrors the shape canvas presence already depends on.
 */
export interface AwarenessLike {
  clientID: number
  getLocalState(): Record<string, unknown> | null
  setLocalState(state: Record<string, unknown> | null): void
  getStates(): Map<number, Record<string, unknown>>
  on(event: 'change', handler: () => void): void
  off(event: 'change', handler: () => void): void
}

/**
 * What RoomManager needs from the sync layer. SyncManager satisfies this
 * directly: `acquire` joins the node's room and creates its awareness.
 */
export interface RoomProvider {
  acquire(nodeId: string): Promise<unknown>
  release(nodeId: string): void
  getAwareness(nodeId: string): AwarenessLike | null
}

/** Well-known room ID carrying the workspace-wide roster. */
export function workspacePresenceRoomId(workspaceId: string): string {
  return `presence-${workspaceId}`
}
