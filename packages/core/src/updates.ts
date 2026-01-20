/**
 * Signed update types for xNet CRDT synchronization
 */

/**
 * Vector clock for tracking causality
 */
export interface VectorClock {
  [peerId: string]: number
}

/**
 * A signed CRDT update with chain linkage
 */
export interface SignedUpdate {
  // CRDT payload
  update: Uint8Array

  // Chain linkage
  parentHash: string // Hash of previous update (or snapshot)
  updateHash: string // Hash of this update

  // Attribution
  authorDID: string
  signature: Uint8Array
  timestamp: number // Logical clock

  // Ordering
  vectorClock: VectorClock
}

/**
 * Represents a fork in the update chain
 */
export interface Fork {
  commonAncestor: string
  branch1: SignedUpdate[]
  branch2: SignedUpdate[]
}

/**
 * Update chain status
 */
export interface ChainStatus {
  valid: boolean
  errors: string[]
  forks: Fork[]
}

/**
 * Compare two vector clocks
 * Returns:
 *  -1 if a < b (a happened before b)
 *   0 if a || b (concurrent)
 *   1 if a > b (a happened after b)
 */
export function compareVectorClocks(a: VectorClock, b: VectorClock): -1 | 0 | 1 {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)])
  let aGreater = false
  let bGreater = false

  for (const key of allKeys) {
    const aVal = a[key] || 0
    const bVal = b[key] || 0
    if (aVal > bVal) aGreater = true
    if (bVal > aVal) bGreater = true
  }

  if (aGreater && !bGreater) return 1
  if (bGreater && !aGreater) return -1
  return 0 // Concurrent or equal
}

/**
 * Check if a vector clock progression is valid
 * The author's clock should increment by exactly 1
 */
export function isValidProgression(
  prev: VectorClock,
  next: VectorClock,
  authorId: string
): boolean {
  const prevAuthor = prev[authorId] || 0
  const nextAuthor = next[authorId] || 0

  // Author's clock must increment by exactly 1
  if (nextAuthor !== prevAuthor + 1) return false

  // Other clocks must not decrease
  for (const key of Object.keys(prev)) {
    if (key !== authorId) {
      const prevVal = prev[key] || 0
      const nextVal = next[key] || 0
      if (nextVal < prevVal) return false
    }
  }

  return true
}

/**
 * Merge two vector clocks (take max of each component)
 */
export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const result: VectorClock = { ...a }
  for (const [key, value] of Object.entries(b)) {
    result[key] = Math.max(result[key] || 0, value)
  }
  return result
}

/**
 * Increment a vector clock for a given peer
 */
export function incrementVectorClock(clock: VectorClock, peerId: string): VectorClock {
  return {
    ...clock,
    [peerId]: (clock[peerId] || 0) + 1
  }
}
