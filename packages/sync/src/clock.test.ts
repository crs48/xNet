import { describe, it, expect } from 'vitest'
import type { DID } from '@xnet/core'
import {
  createLamportClock,
  tick,
  receive,
  compareLamportTimestamps,
  isBefore,
  isAfter,
  serializeTimestamp,
  parseTimestamp,
  maxTime
} from './clock'
import type { LamportTimestamp } from './clock'

describe('LamportClock', () => {
  const authorA = 'did:key:z6MkAuthorA' as DID
  const authorB = 'did:key:z6MkAuthorB' as DID

  describe('createLamportClock', () => {
    it('creates a clock starting at time 0', () => {
      const clock = createLamportClock(authorA)
      expect(clock.time).toBe(0)
      expect(clock.author).toBe(authorA)
    })
  })

  describe('tick', () => {
    it('increments the clock and returns a timestamp', () => {
      const clock = createLamportClock(authorA)
      const [newClock, ts] = tick(clock)

      expect(newClock.time).toBe(1)
      expect(ts.time).toBe(1)
      expect(ts.author).toBe(authorA)
    })

    it('does not mutate the original clock', () => {
      const clock = createLamportClock(authorA)
      tick(clock)
      expect(clock.time).toBe(0)
    })

    it('increments sequentially', () => {
      let clock = createLamportClock(authorA)
      let ts: LamportTimestamp
      ;[clock, ts] = tick(clock)
      expect(ts.time).toBe(1)
      ;[clock, ts] = tick(clock)
      expect(ts.time).toBe(2)
      ;[clock, ts] = tick(clock)
      expect(ts.time).toBe(3)
    })
  })

  describe('receive', () => {
    it('updates clock to max of local and received time', () => {
      const clock = createLamportClock(authorA)
      const updated = receive(clock, 10)

      expect(updated.time).toBe(10)
      expect(updated.author).toBe(authorA)
    })

    it('keeps local time if greater', () => {
      let clock = createLamportClock(authorA)
      ;[clock] = tick(clock) // time = 1
      ;[clock] = tick(clock) // time = 2
      ;[clock] = tick(clock) // time = 3

      const updated = receive(clock, 2)
      expect(updated.time).toBe(3)
    })

    it('does not mutate the original clock', () => {
      const clock = createLamportClock(authorA)
      receive(clock, 10)
      expect(clock.time).toBe(0)
    })
  })

  describe('compareLamportTimestamps', () => {
    it('returns -1 when a.time < b.time', () => {
      const a: LamportTimestamp = { time: 1, author: authorA }
      const b: LamportTimestamp = { time: 2, author: authorA }
      expect(compareLamportTimestamps(a, b)).toBe(-1)
    })

    it('returns 1 when a.time > b.time', () => {
      const a: LamportTimestamp = { time: 3, author: authorA }
      const b: LamportTimestamp = { time: 2, author: authorA }
      expect(compareLamportTimestamps(a, b)).toBe(1)
    })

    it('uses author as tie-breaker when times are equal', () => {
      const a: LamportTimestamp = { time: 5, author: authorA }
      const b: LamportTimestamp = { time: 5, author: authorB }

      // authorA < authorB lexicographically
      expect(compareLamportTimestamps(a, b)).toBe(-1)
      expect(compareLamportTimestamps(b, a)).toBe(1)
    })

    it('returns 0 for identical timestamps', () => {
      const a: LamportTimestamp = { time: 5, author: authorA }
      const b: LamportTimestamp = { time: 5, author: authorA }
      expect(compareLamportTimestamps(a, b)).toBe(0)
    })
  })

  describe('isBefore', () => {
    it('returns true when a < b', () => {
      const a: LamportTimestamp = { time: 1, author: authorA }
      const b: LamportTimestamp = { time: 2, author: authorA }
      expect(isBefore(a, b)).toBe(true)
    })

    it('returns false when a >= b', () => {
      const a: LamportTimestamp = { time: 2, author: authorA }
      const b: LamportTimestamp = { time: 1, author: authorA }
      expect(isBefore(a, b)).toBe(false)
    })
  })

  describe('isAfter', () => {
    it('returns true when a > b', () => {
      const a: LamportTimestamp = { time: 3, author: authorA }
      const b: LamportTimestamp = { time: 2, author: authorA }
      expect(isAfter(a, b)).toBe(true)
    })

    it('returns false when a <= b', () => {
      const a: LamportTimestamp = { time: 1, author: authorA }
      const b: LamportTimestamp = { time: 2, author: authorA }
      expect(isAfter(a, b)).toBe(false)
    })
  })

  describe('serializeTimestamp', () => {
    it('serializes with zero-padded time', () => {
      const ts: LamportTimestamp = { time: 42, author: authorA }
      const serialized = serializeTimestamp(ts)
      expect(serialized).toBe(`0000000000000042-${authorA}`)
    })

    it('produces lexicographically sortable strings', () => {
      const ts1: LamportTimestamp = { time: 1, author: authorA }
      const ts2: LamportTimestamp = { time: 10, author: authorA }
      const ts3: LamportTimestamp = { time: 100, author: authorA }

      const s1 = serializeTimestamp(ts1)
      const s2 = serializeTimestamp(ts2)
      const s3 = serializeTimestamp(ts3)

      expect(s1 < s2).toBe(true)
      expect(s2 < s3).toBe(true)
    })
  })

  describe('parseTimestamp', () => {
    it('parses a serialized timestamp', () => {
      const original: LamportTimestamp = { time: 12345, author: authorA }
      const serialized = serializeTimestamp(original)
      const parsed = parseTimestamp(serialized)

      expect(parsed.time).toBe(12345)
      expect(parsed.author).toBe(authorA)
    })

    it('throws on invalid format', () => {
      expect(() => parseTimestamp('invalid')).toThrow()
    })

    it('roundtrips correctly', () => {
      const ts: LamportTimestamp = { time: 999999, author: authorB }
      expect(parseTimestamp(serializeTimestamp(ts))).toEqual(ts)
    })
  })

  describe('maxTime', () => {
    it('returns the maximum time from timestamps', () => {
      const timestamps: LamportTimestamp[] = [
        { time: 5, author: authorA },
        { time: 10, author: authorB },
        { time: 3, author: authorA }
      ]
      expect(maxTime(timestamps)).toBe(10)
    })

    it('returns 0 for empty array', () => {
      expect(maxTime([])).toBe(0)
    })
  })

  describe('distributed scenario', () => {
    it('maintains total ordering across two authors', () => {
      // Author A creates some changes
      let clockA = createLamportClock(authorA)
      let tsA1: LamportTimestamp
      let tsA2: LamportTimestamp
      ;[clockA, tsA1] = tick(clockA) // time=1
      ;[clockA, tsA2] = tick(clockA) // time=2

      // Author B receives A's changes and creates their own
      let clockB = createLamportClock(authorB)
      clockB = receive(clockB, tsA2.time) // sync to A's time
      let tsB1: LamportTimestamp
      ;[clockB, tsB1] = tick(clockB) // time=3 (after A's changes)

      // All timestamps are totally ordered
      expect(isBefore(tsA1, tsA2)).toBe(true)
      expect(isBefore(tsA2, tsB1)).toBe(true)
      expect(isBefore(tsA1, tsB1)).toBe(true)
    })

    it('handles concurrent changes with deterministic tie-breaking', () => {
      // Both authors create changes at the "same" logical time
      // (they haven't synced yet)
      let clockA = createLamportClock(authorA)
      let clockB = createLamportClock(authorB)

      let tsA: LamportTimestamp
      let tsB: LamportTimestamp
      ;[clockA, tsA] = tick(clockA) // time=1
      ;[clockB, tsB] = tick(clockB) // time=1

      // Same time, but author provides deterministic ordering
      expect(tsA.time).toBe(tsB.time)

      // authorA < authorB lexicographically, so tsA < tsB
      expect(isBefore(tsA, tsB)).toBe(true)
      expect(isAfter(tsB, tsA)).toBe(true)
    })
  })
})
