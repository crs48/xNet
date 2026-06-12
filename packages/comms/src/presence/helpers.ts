/**
 * Pure presence derivations — kept out of components so they can be tested
 * and reused across surfaces (status bar, rosters, chat badges).
 */

import type { PeerPresence, RoomPresence, UserCard } from './types'

/** All remote peers (excludes the local client), newest update first. */
export function remotePeers(
  states: Map<number, Record<string, unknown>>,
  selfClientId: number
): PeerPresence[] {
  const peers: PeerPresence[] = []
  states.forEach((state, clientId) => {
    if (clientId === selfClientId || !state) return
    peers.push({ ...(state as RoomPresence), clientId })
  })
  return peers.sort((a, b) => (b.lastUpdated ?? 0) - (a.lastUpdated ?? 0))
}

/** Peers with a live (unexpired) typing indicator for the channel. */
export function typingPeers(peers: PeerPresence[], channelId: string, now: number): PeerPresence[] {
  return peers.filter((p) => p.typing?.channelId === channelId && p.typing.until > now)
}

/** Peers advertising membership in the given call room. */
export function peersInCall(peers: PeerPresence[], roomId: string): PeerPresence[] {
  return peers.filter((p) => p.call?.roomId === roomId)
}

/** Unique users on the room, deduped by DID (a user may have many tabs). */
export function rosterUsers(peers: PeerPresence[]): UserCard[] {
  const seen = new Map<string, UserCard>()
  for (const peer of peers) {
    const user = peer.user
    if (user?.did && !seen.has(user.did)) seen.set(user.did, user)
  }
  return [...seen.values()]
}

/** DIDs with any live presence in the room (used for push suppression). */
export function presentDids(peers: PeerPresence[]): Set<string> {
  return new Set(rosterUsers(peers).map((u) => u.did))
}
