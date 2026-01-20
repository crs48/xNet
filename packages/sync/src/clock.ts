/**
 * Vector clock utilities for causal ordering in distributed systems.
 *
 * Vector clocks track the logical time at each node, enabling:
 * - Determining causality (happened-before relationship)
 * - Detecting concurrent events
 * - Merging divergent states
 */

import type { DID, VectorClock } from '@xnet/core'

// Re-export VectorClock type for convenience
export type { VectorClock } from '@xnet/core'

/**
 * Create a new vector clock with initial value for a node.
 * This should be called when a node first creates a change.
 */
export function createVectorClock(nodeId: DID): VectorClock {
  return { [nodeId]: 1 }
}

/**
 * Increment the clock for a specific node.
 * Call this when the node creates a new change.
 */
export function incrementVectorClock(clock: VectorClock, nodeId: DID): VectorClock {
  return {
    ...clock,
    [nodeId]: (clock[nodeId] || 0) + 1
  }
}

/**
 * Merge two vector clocks by taking the maximum of each entry.
 * This is used when receiving changes from other nodes.
 */
export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const result: VectorClock = { ...a }

  for (const [nodeId, value] of Object.entries(b) as [string, number][]) {
    result[nodeId] = Math.max(result[nodeId] || 0, value)
  }

  return result
}

/**
 * Compare two vector clocks to determine their causal relationship.
 *
 * @returns
 *   -1 if a < b (a happened before b)
 *    0 if a || b (concurrent - neither happened before the other)
 *    1 if a > b (a happened after b)
 */
export function compareVectorClocks(a: VectorClock, b: VectorClock): -1 | 0 | 1 {
  let aGreater = false
  let bGreater = false

  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)])

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
 * Check if clock a happened strictly before clock b.
 * a < b means all of a's entries are <= b's entries, and at least one is strictly less.
 */
export function happenedBefore(a: VectorClock, b: VectorClock): boolean {
  return compareVectorClocks(a, b) === -1
}

/**
 * Check if clock a happened strictly after clock b.
 */
export function happenedAfter(a: VectorClock, b: VectorClock): boolean {
  return compareVectorClocks(a, b) === 1
}

/**
 * Check if two clocks are concurrent (neither happened before the other).
 * Concurrent events may need conflict resolution.
 */
export function areConcurrent(a: VectorClock, b: VectorClock): boolean {
  return compareVectorClocks(a, b) === 0 && !areEqual(a, b)
}

/**
 * Check if two clocks are exactly equal.
 */
export function areEqual(a: VectorClock, b: VectorClock): boolean {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)])

  for (const key of allKeys) {
    if ((a[key] || 0) !== (b[key] || 0)) {
      return false
    }
  }

  return true
}

/**
 * Check if a vector clock progression is valid.
 * The author's clock should increment by exactly 1, and no other clock should decrease.
 *
 * @param prev - The previous vector clock
 * @param next - The next vector clock
 * @param authorId - The DID of the author making the change
 * @returns true if the progression is valid
 */
export function isValidProgression(prev: VectorClock, next: VectorClock, authorId: DID): boolean {
  const prevAuthor = prev[authorId] || 0
  const nextAuthor = next[authorId] || 0

  // Author's clock must increment by exactly 1
  if (nextAuthor !== prevAuthor + 1) return false

  // Other clocks must not decrease (can stay same or increase from merging)
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
 * Get the maximum logical time across all nodes in a vector clock.
 * Useful for getting a rough "latest" timestamp.
 */
export function getMaxTime(clock: VectorClock): number {
  const values = Object.values(clock) as number[]
  return values.length > 0 ? Math.max(...values) : 0
}

/**
 * Get all node IDs present in a vector clock.
 */
export function getNodes(clock: VectorClock): DID[] {
  return Object.keys(clock) as DID[]
}
