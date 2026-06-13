/**
 * Friends-of-friends discovery over the local social graph (exploration 0174).
 *
 * Pure traversal over an adjacency map (built from follow interactions, the
 * comms roster, and the grant graph by the caller). This is the layer that
 * answers "people near me in the graph" with zero server trust.
 */

import type { Adjacency } from './matching'
import { adamicAdar } from './matching'

export type FriendOfFriend = {
  did: string
  /** Mutual connections that bridge to this person. */
  via: string[]
  /** Adamic-Adar proximity (unbounded; higher = closer). */
  proximity: number
}

/**
 * People exactly two hops away: neighbours-of-neighbours, excluding self and
 * anyone already directly connected, ranked by Adamic-Adar proximity.
 */
export function friendsOfFriends(adjacency: Adjacency, me: string): FriendOfFriend[] {
  const direct = adjacency.get(me) ?? new Set<string>()
  const candidates = new Map<string, Set<string>>()

  for (const friend of direct) {
    for (const fof of adjacency.get(friend) ?? new Set<string>()) {
      if (fof === me || direct.has(fof)) continue
      const via = candidates.get(fof) ?? new Set<string>()
      via.add(friend)
      candidates.set(fof, via)
    }
  }

  return [...candidates.entries()]
    .map(([did, via]) => ({
      did,
      via: [...via].sort(),
      proximity: adamicAdar(adjacency, me, did)
    }))
    .sort((a, b) => b.proximity - a.proximity || a.did.localeCompare(b.did))
}

/**
 * Shortest social path between two people (BFS), for the "why you matched" card
 * — e.g. "2 hops via @carol". Returns the node sequence including both ends, or
 * null if disconnected within `maxHops`.
 */
export function shortestSocialPath(
  adjacency: Adjacency,
  from: string,
  to: string,
  maxHops = 4
): string[] | null {
  if (from === to) return [from]
  const visited = new Set<string>([from])
  let frontier: string[][] = [[from]]

  for (let hop = 0; hop < maxHops; hop++) {
    const next: string[][] = []
    for (const path of frontier) {
      const tail = path[path.length - 1]
      for (const neighbor of adjacency.get(tail) ?? new Set<string>()) {
        if (neighbor === to) return [...path, neighbor]
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        next.push([...path, neighbor])
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return null
}
