import { describe, it, expect } from 'vitest'
import {
  bucketCount,
  bucketLatency,
  bucketSize,
  bucketScore,
  bucketTimestamp,
  bucketToApproximate
} from '../src/collection/bucketing'

describe('bucketCount', () => {
  it('buckets 0 as none', () => {
    expect(bucketCount(0)).toBe('none')
    expect(bucketCount(-1)).toBe('none')
  })

  it('buckets 1-5', () => {
    expect(bucketCount(1)).toBe('1-5')
    expect(bucketCount(3)).toBe('1-5')
    expect(bucketCount(5)).toBe('1-5')
  })

  it('buckets 6-20', () => {
    expect(bucketCount(6)).toBe('6-20')
    expect(bucketCount(15)).toBe('6-20')
    expect(bucketCount(20)).toBe('6-20')
  })

  it('buckets 21-100', () => {
    expect(bucketCount(21)).toBe('21-100')
    expect(bucketCount(42)).toBe('21-100')
    expect(bucketCount(100)).toBe('21-100')
  })

  it('buckets 100+', () => {
    expect(bucketCount(101)).toBe('100+')
    expect(bucketCount(999)).toBe('100+')
  })
})

describe('bucketLatency', () => {
  it('buckets <10ms', () => {
    expect(bucketLatency(0)).toBe('<10ms')
    expect(bucketLatency(9)).toBe('<10ms')
  })

  it('buckets 10-50ms', () => {
    expect(bucketLatency(10)).toBe('10-50ms')
    expect(bucketLatency(49)).toBe('10-50ms')
  })

  it('buckets 50-200ms', () => {
    expect(bucketLatency(50)).toBe('50-200ms')
    expect(bucketLatency(199)).toBe('50-200ms')
  })

  it('buckets 200-1000ms', () => {
    expect(bucketLatency(200)).toBe('200-1000ms')
    expect(bucketLatency(999)).toBe('200-1000ms')
  })

  it('buckets >1000ms', () => {
    expect(bucketLatency(1000)).toBe('>1000ms')
    expect(bucketLatency(5000)).toBe('>1000ms')
  })
})

describe('bucketSize', () => {
  it('buckets <1KB', () => {
    expect(bucketSize(0)).toBe('<1KB')
    expect(bucketSize(1023)).toBe('<1KB')
  })

  it('buckets 1-10KB', () => {
    expect(bucketSize(1024)).toBe('1-10KB')
    expect(bucketSize(10239)).toBe('1-10KB')
  })

  it('buckets >1MB', () => {
    expect(bucketSize(1048576)).toBe('>1MB')
  })
})

describe('bucketScore', () => {
  it('buckets very_low (<-50)', () => {
    expect(bucketScore(-100)).toBe('very_low')
    expect(bucketScore(-51)).toBe('very_low')
  })

  it('buckets low (-50 to -10)', () => {
    expect(bucketScore(-50)).toBe('low')
    expect(bucketScore(-11)).toBe('low')
  })

  it('buckets neutral (-10 to 20)', () => {
    expect(bucketScore(-10)).toBe('neutral')
    expect(bucketScore(0)).toBe('neutral')
    expect(bucketScore(19)).toBe('neutral')
  })

  it('buckets good (20 to 50)', () => {
    expect(bucketScore(20)).toBe('good')
    expect(bucketScore(49)).toBe('good')
  })

  it('buckets excellent (>=50)', () => {
    expect(bucketScore(50)).toBe('excellent')
    expect(bucketScore(100)).toBe('excellent')
  })
})

describe('bucketTimestamp', () => {
  it('rounds to minute', () => {
    const date = new Date('2024-06-15T10:35:42.123Z')
    const result = bucketTimestamp(date, 'minute')
    expect(result.getSeconds()).toBe(0)
    expect(result.getMilliseconds()).toBe(0)
    expect(result.getMinutes()).toBe(35)
  })

  it('rounds to hour', () => {
    const date = new Date('2024-06-15T10:35:42.123Z')
    const result = bucketTimestamp(date, 'hour')
    expect(result.getMinutes()).toBe(0)
    expect(result.getSeconds()).toBe(0)
  })

  it('rounds to day', () => {
    const date = new Date('2024-06-15T10:35:42.123Z')
    const result = bucketTimestamp(date, 'day')
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
  })

  it('rounds to week (Sunday)', () => {
    // June 15 2024 is a Saturday
    const date = new Date('2024-06-15T10:35:42.123Z')
    const result = bucketTimestamp(date, 'week')
    expect(result.getDay()).toBe(0) // Sunday
    expect(result.getHours()).toBe(0)
  })
})

describe('bucketToApproximate', () => {
  it('returns range for known buckets', () => {
    expect(bucketToApproximate('1-5')).toEqual({ min: 1, max: 5 })
    expect(bucketToApproximate('100+')).toEqual({ min: 101, max: Infinity })
    expect(bucketToApproximate('<10ms')).toEqual({ min: 0, max: 9 })
  })

  it('returns null for unknown buckets', () => {
    expect(bucketToApproximate('unknown')).toBeNull()
  })
})
