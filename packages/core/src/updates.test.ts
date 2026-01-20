import { describe, it, expect } from 'vitest'
import {
  compareVectorClocks,
  isValidProgression,
  mergeVectorClocks,
  incrementVectorClock
} from './updates'

describe('Vector Clocks', () => {
  describe('compareVectorClocks', () => {
    it('should detect a < b (happened before)', () => {
      const a = { peer1: 1, peer2: 2 }
      const b = { peer1: 2, peer2: 3 }
      expect(compareVectorClocks(a, b)).toBe(-1)
    })

    it('should detect a > b (happened after)', () => {
      const a = { peer1: 3, peer2: 4 }
      const b = { peer1: 2, peer2: 3 }
      expect(compareVectorClocks(a, b)).toBe(1)
    })

    it('should detect concurrent events', () => {
      const a = { peer1: 2, peer2: 1 }
      const b = { peer1: 1, peer2: 2 }
      expect(compareVectorClocks(a, b)).toBe(0)
    })

    it('should handle missing keys', () => {
      const a = { peer1: 1 }
      const b = { peer1: 1, peer2: 1 }
      expect(compareVectorClocks(a, b)).toBe(-1)
    })

    it('should detect equal clocks as concurrent', () => {
      const a = { peer1: 1, peer2: 2 }
      const b = { peer1: 1, peer2: 2 }
      expect(compareVectorClocks(a, b)).toBe(0)
    })
  })

  describe('isValidProgression', () => {
    it('should accept valid progression', () => {
      const prev = { peer1: 1, peer2: 2 }
      const next = { peer1: 2, peer2: 2 }
      expect(isValidProgression(prev, next, 'peer1')).toBe(true)
    })

    it('should reject if author clock does not increment', () => {
      const prev = { peer1: 1 }
      const next = { peer1: 1 } // Should be 2
      expect(isValidProgression(prev, next, 'peer1')).toBe(false)
    })

    it('should reject if author clock increments by more than 1', () => {
      const prev = { peer1: 1 }
      const next = { peer1: 3 } // Should be 2
      expect(isValidProgression(prev, next, 'peer1')).toBe(false)
    })

    it('should reject if other clocks decrease', () => {
      const prev = { peer1: 1, peer2: 3 }
      const next = { peer1: 2, peer2: 2 } // peer2 decreased
      expect(isValidProgression(prev, next, 'peer1')).toBe(false)
    })

    it('should handle new author', () => {
      const prev = { peer1: 1 }
      const next = { peer1: 1, peer2: 1 }
      expect(isValidProgression(prev, next, 'peer2')).toBe(true)
    })
  })

  describe('mergeVectorClocks', () => {
    it('should take max of each component', () => {
      const a = { peer1: 2, peer2: 1 }
      const b = { peer1: 1, peer2: 3 }
      const merged = mergeVectorClocks(a, b)
      expect(merged).toEqual({ peer1: 2, peer2: 3 })
    })

    it('should include all keys', () => {
      const a = { peer1: 1 }
      const b = { peer2: 1 }
      const merged = mergeVectorClocks(a, b)
      expect(merged).toEqual({ peer1: 1, peer2: 1 })
    })
  })

  describe('incrementVectorClock', () => {
    it('should increment specified peer', () => {
      const clock = { peer1: 1, peer2: 2 }
      const result = incrementVectorClock(clock, 'peer1')
      expect(result).toEqual({ peer1: 2, peer2: 2 })
    })

    it('should add new peer', () => {
      const clock = { peer1: 1 }
      const result = incrementVectorClock(clock, 'peer2')
      expect(result).toEqual({ peer1: 1, peer2: 1 })
    })

    it('should not mutate original', () => {
      const clock = { peer1: 1 }
      incrementVectorClock(clock, 'peer1')
      expect(clock).toEqual({ peer1: 1 })
    })
  })
})
