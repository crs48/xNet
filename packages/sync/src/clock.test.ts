import { describe, it, expect } from 'vitest'
import type { DID, VectorClock } from '@xnet/core'
import {
  createVectorClock,
  incrementVectorClock,
  mergeVectorClocks,
  compareVectorClocks,
  happenedBefore,
  happenedAfter,
  areConcurrent,
  areEqual,
  isValidProgression,
  getMaxTime,
  getNodes
} from './clock'

describe('VectorClock', () => {
  const nodeA = 'did:key:z6MkNodeA' as DID
  const nodeB = 'did:key:z6MkNodeB' as DID
  const nodeC = 'did:key:z6MkNodeC' as DID

  describe('createVectorClock', () => {
    it('creates a clock with initial value of 1', () => {
      const clock = createVectorClock(nodeA)
      expect(clock).toEqual({ [nodeA]: 1 })
    })
  })

  describe('incrementVectorClock', () => {
    it('increments existing node', () => {
      const clock = { [nodeA]: 5 }
      const incremented = incrementVectorClock(clock, nodeA)
      expect(incremented[nodeA]).toBe(6)
    })

    it('initializes and increments new node', () => {
      const clock = { [nodeA]: 3 }
      const incremented = incrementVectorClock(clock, nodeB)
      expect(incremented).toEqual({ [nodeA]: 3, [nodeB]: 1 })
    })

    it('does not mutate original clock', () => {
      const clock = { [nodeA]: 1 }
      incrementVectorClock(clock, nodeA)
      expect(clock[nodeA]).toBe(1)
    })
  })

  describe('mergeVectorClocks', () => {
    it('takes max of each entry', () => {
      const clockA: VectorClock = { [nodeA]: 3, [nodeB]: 1 }
      const clockB: VectorClock = { [nodeA]: 2, [nodeB]: 4 }
      const merged = mergeVectorClocks(clockA, clockB)
      expect(merged).toEqual({ [nodeA]: 3, [nodeB]: 4 })
    })

    it('includes entries from both clocks', () => {
      const clockA: VectorClock = { [nodeA]: 1 }
      const clockB: VectorClock = { [nodeB]: 2 }
      const merged = mergeVectorClocks(clockA, clockB)
      expect(merged).toEqual({ [nodeA]: 1, [nodeB]: 2 })
    })

    it('handles empty clocks', () => {
      const clockA: VectorClock = { [nodeA]: 1 }
      const empty: VectorClock = {}
      expect(mergeVectorClocks(clockA, empty)).toEqual({ [nodeA]: 1 })
      expect(mergeVectorClocks(empty, clockA)).toEqual({ [nodeA]: 1 })
    })
  })

  describe('compareVectorClocks', () => {
    it('returns -1 when a < b (a happened before b)', () => {
      const earlier: VectorClock = { [nodeA]: 1 }
      const later: VectorClock = { [nodeA]: 2 }
      expect(compareVectorClocks(earlier, later)).toBe(-1)
    })

    it('returns 1 when a > b (a happened after b)', () => {
      const earlier: VectorClock = { [nodeA]: 1 }
      const later: VectorClock = { [nodeA]: 2 }
      expect(compareVectorClocks(later, earlier)).toBe(1)
    })

    it('returns 0 for concurrent clocks', () => {
      const clockA: VectorClock = { [nodeA]: 1 }
      const clockB: VectorClock = { [nodeB]: 1 }
      expect(compareVectorClocks(clockA, clockB)).toBe(0)
    })

    it('returns 0 for equal clocks', () => {
      const clock: VectorClock = { [nodeA]: 1, [nodeB]: 2 }
      expect(compareVectorClocks(clock, { ...clock })).toBe(0)
    })

    it('handles complex concurrent case', () => {
      // A knows about nodeA:2, nodeB:1
      // B knows about nodeA:1, nodeB:2
      // These are concurrent - neither happened before the other
      const clockA: VectorClock = { [nodeA]: 2, [nodeB]: 1 }
      const clockB: VectorClock = { [nodeA]: 1, [nodeB]: 2 }
      expect(compareVectorClocks(clockA, clockB)).toBe(0)
    })
  })

  describe('happenedBefore', () => {
    it('returns true when a < b', () => {
      const earlier: VectorClock = { [nodeA]: 1 }
      const later: VectorClock = { [nodeA]: 1, [nodeB]: 1 }
      expect(happenedBefore(earlier, later)).toBe(true)
    })

    it('returns false when a > b', () => {
      const earlier: VectorClock = { [nodeA]: 1 }
      const later: VectorClock = { [nodeA]: 2 }
      expect(happenedBefore(later, earlier)).toBe(false)
    })

    it('returns false for concurrent', () => {
      const clockA: VectorClock = { [nodeA]: 1 }
      const clockB: VectorClock = { [nodeB]: 1 }
      expect(happenedBefore(clockA, clockB)).toBe(false)
    })
  })

  describe('happenedAfter', () => {
    it('returns true when a > b', () => {
      const earlier: VectorClock = { [nodeA]: 1 }
      const later: VectorClock = { [nodeA]: 2 }
      expect(happenedAfter(later, earlier)).toBe(true)
    })

    it('returns false when a < b', () => {
      const earlier: VectorClock = { [nodeA]: 1 }
      const later: VectorClock = { [nodeA]: 2 }
      expect(happenedAfter(earlier, later)).toBe(false)
    })
  })

  describe('areConcurrent', () => {
    it('returns true for concurrent clocks', () => {
      const clockA: VectorClock = { [nodeA]: 2, [nodeB]: 1 }
      const clockB: VectorClock = { [nodeA]: 1, [nodeB]: 2 }
      expect(areConcurrent(clockA, clockB)).toBe(true)
    })

    it('returns false for causally related clocks', () => {
      const earlier: VectorClock = { [nodeA]: 1 }
      const later: VectorClock = { [nodeA]: 2 }
      expect(areConcurrent(earlier, later)).toBe(false)
    })

    it('returns false for equal clocks', () => {
      const clock: VectorClock = { [nodeA]: 1 }
      expect(areConcurrent(clock, { ...clock })).toBe(false)
    })
  })

  describe('areEqual', () => {
    it('returns true for equal clocks', () => {
      const clock: VectorClock = { [nodeA]: 1, [nodeB]: 2 }
      expect(areEqual(clock, { [nodeA]: 1, [nodeB]: 2 })).toBe(true)
    })

    it('returns false for different clocks', () => {
      const clockA: VectorClock = { [nodeA]: 1 }
      const clockB: VectorClock = { [nodeA]: 2 }
      expect(areEqual(clockA, clockB)).toBe(false)
    })

    it('handles missing keys as 0', () => {
      const clockA: VectorClock = { [nodeA]: 0 }
      const clockB: VectorClock = {}
      expect(areEqual(clockA, clockB)).toBe(true)
    })
  })

  describe('isValidProgression', () => {
    it('returns true for valid progression', () => {
      const prev: VectorClock = { [nodeA]: 1 }
      const next: VectorClock = { [nodeA]: 2 }
      expect(isValidProgression(prev, next, nodeA)).toBe(true)
    })

    it('returns false if author clock increases by more than 1', () => {
      const prev: VectorClock = { [nodeA]: 1 }
      const next: VectorClock = { [nodeA]: 3 }
      expect(isValidProgression(prev, next, nodeA)).toBe(false)
    })

    it('returns false if author clock stays same', () => {
      const prev: VectorClock = { [nodeA]: 1 }
      const next: VectorClock = { [nodeA]: 1 }
      expect(isValidProgression(prev, next, nodeA)).toBe(false)
    })

    it('returns false if other clock decreases', () => {
      const prev: VectorClock = { [nodeA]: 1, [nodeB]: 3 }
      const next: VectorClock = { [nodeA]: 2, [nodeB]: 2 }
      expect(isValidProgression(prev, next, nodeA)).toBe(false)
    })

    it('allows other clocks to increase (from merge)', () => {
      const prev: VectorClock = { [nodeA]: 1, [nodeB]: 1 }
      const next: VectorClock = { [nodeA]: 2, [nodeB]: 5 }
      expect(isValidProgression(prev, next, nodeA)).toBe(true)
    })
  })

  describe('getMaxTime', () => {
    it('returns max value across all nodes', () => {
      const clock: VectorClock = { [nodeA]: 3, [nodeB]: 7, [nodeC]: 2 }
      expect(getMaxTime(clock)).toBe(7)
    })

    it('returns 0 for empty clock', () => {
      expect(getMaxTime({})).toBe(0)
    })
  })

  describe('getNodes', () => {
    it('returns all node IDs in the clock', () => {
      const clock: VectorClock = { [nodeA]: 1, [nodeB]: 2 }
      const nodes = getNodes(clock)
      expect(nodes).toHaveLength(2)
      expect(nodes).toContain(nodeA)
      expect(nodes).toContain(nodeB)
    })

    it('returns empty array for empty clock', () => {
      expect(getNodes({})).toEqual([])
    })
  })
})
