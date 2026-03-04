/**
 * Lamport clock utilities for total ordering in distributed systems.
 *
 * Lamport timestamps provide a simple, single-integer logical clock that:
 * - Guarantees total ordering of events (with tie-breaker)
 * - Requires no coordination between nodes
 * - Is trivial to merge (max + 1)
 *
 * Combined with author DID as tie-breaker, this gives deterministic
 * ordering across all nodes without the complexity of vector clocks.
 */

import type { DID } from '@xnetjs/core'

/**
 * A Lamport timestamp with author for deterministic tie-breaking.
 *
 * Two changes are ordered by:
 * 1. Lamport time (lower = earlier)
 * 2. Author DID string comparison (deterministic tie-breaker)
 */
export interface LamportTimestamp {
  /** Logical time - increments on each change */
  time: number
  /** Author DID - used for deterministic tie-breaking */
  author: DID
}

/**
 * A Lamport clock that tracks the current logical time.
 * Each author maintains their own clock instance.
 */
export interface LamportClock {
  /** Current logical time */
  time: number
  /** The author's DID */
  author: DID
}

/**
 * Create a new Lamport clock for an author.
 * Starts at time 0; first tick will produce time 1.
 */
export function createLamportClock(author: DID): LamportClock {
  return { time: 0, author }
}

/**
 * Tick the clock and return a new timestamp.
 * This should be called when creating a new change.
 *
 * @param clock - The clock to tick
 * @returns A tuple of [newClock, timestamp]
 */
export function tick(clock: LamportClock): [LamportClock, LamportTimestamp] {
  const newTime = clock.time + 1
  const newClock: LamportClock = { ...clock, time: newTime }
  const timestamp: LamportTimestamp = { time: newTime, author: clock.author }
  return [newClock, timestamp]
}

/**
 * Update the clock after receiving a change from another node.
 * Sets our time to max(ourTime, receivedTime) so next tick is greater.
 *
 * @param clock - Our local clock
 * @param receivedTime - The Lamport time from the received change
 * @returns Updated clock
 */
export function receive(clock: LamportClock, receivedTime: number): LamportClock {
  return {
    ...clock,
    time: Math.max(clock.time, receivedTime)
  }
}

/**
 * Compare two Lamport timestamps for ordering.
 *
 * @returns
 *   -1 if a < b (a happened before b)
 *    1 if a > b (a happened after b)
 *    0 if a === b (same timestamp - should be rare)
 */
export function compareLamportTimestamps(a: LamportTimestamp, b: LamportTimestamp): -1 | 0 | 1 {
  // First compare by time
  if (a.time < b.time) return -1
  if (a.time > b.time) return 1

  // Tie-break by author DID (deterministic string comparison)
  const authorCmp = a.author.localeCompare(b.author)
  if (authorCmp < 0) return -1
  if (authorCmp > 0) return 1

  return 0
}

/**
 * Check if timestamp a is strictly before timestamp b.
 */
export function isBefore(a: LamportTimestamp, b: LamportTimestamp): boolean {
  return compareLamportTimestamps(a, b) === -1
}

/**
 * Check if timestamp a is strictly after timestamp b.
 */
export function isAfter(a: LamportTimestamp, b: LamportTimestamp): boolean {
  return compareLamportTimestamps(a, b) === 1
}

/**
 * Serialize a Lamport timestamp to a string for storage/sorting.
 * Format: {time-padded-16-digits}-{author}
 *
 * The padding ensures lexicographic string sorting matches numeric sorting.
 */
export function serializeTimestamp(ts: LamportTimestamp): string {
  // Pad to 16 digits - supports up to ~10^16 changes
  const paddedTime = ts.time.toString().padStart(16, '0')
  return `${paddedTime}-${ts.author}`
}

/**
 * Parse a serialized Lamport timestamp.
 */
export function parseTimestamp(serialized: string): LamportTimestamp {
  const dashIndex = serialized.indexOf('-')
  if (dashIndex === -1) {
    throw new Error(`Invalid serialized timestamp: ${serialized}`)
  }

  const timeStr = serialized.slice(0, dashIndex)
  const author = serialized.slice(dashIndex + 1) as DID

  const time = parseInt(timeStr, 10)
  if (isNaN(time)) {
    throw new Error(`Invalid time in timestamp: ${timeStr}`)
  }

  return { time, author }
}

/**
 * Get the maximum Lamport time from a list of timestamps.
 * Useful for initializing a clock after loading existing changes.
 */
export function maxTime(timestamps: LamportTimestamp[]): number {
  if (timestamps.length === 0) return 0
  return Math.max(...timestamps.map((ts) => ts.time))
}
