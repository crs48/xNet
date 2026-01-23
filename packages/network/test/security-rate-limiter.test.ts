import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TokenBucket, SyncRateLimiter, ProtocolRateLimiter } from '../src/security/rate-limiter'

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should allow bursts up to capacity', () => {
    const bucket = new TokenBucket(10, 1)
    for (let i = 0; i < 10; i++) {
      expect(bucket.tryConsume()).toBe(true)
    }
    expect(bucket.tryConsume()).toBe(false)
  })

  it('should refill over time', () => {
    const bucket = new TokenBucket(10, 2)
    for (let i = 0; i < 10; i++) bucket.tryConsume()
    expect(bucket.getTokens()).toBeCloseTo(0, 0)

    vi.advanceTimersByTime(1000)
    expect(bucket.getTokens()).toBeCloseTo(2, 1)
  })

  it('should not exceed capacity on refill', () => {
    const bucket = new TokenBucket(10, 100)
    vi.advanceTimersByTime(10_000) // Would add 1000 tokens if uncapped

    expect(bucket.getTokens()).toBe(10)
  })

  it('should consume multiple tokens', () => {
    const bucket = new TokenBucket(10, 1)
    expect(bucket.tryConsume(5)).toBe(true)
    expect(bucket.tryConsume(5)).toBe(true)
    expect(bucket.tryConsume(1)).toBe(false)
  })

  it('should calculate time until tokens', () => {
    const bucket = new TokenBucket(10, 1)
    for (let i = 0; i < 10; i++) bucket.tryConsume()

    expect(bucket.timeUntilTokens(1)).toBeCloseTo(1000, -2)
    expect(bucket.timeUntilTokens(5)).toBeCloseTo(5000, -2)
  })

  it('should return 0 when tokens available', () => {
    const bucket = new TokenBucket(10, 1)
    expect(bucket.timeUntilTokens(1)).toBe(0)
  })

  it('should check tokens without consuming', () => {
    const bucket = new TokenBucket(10, 1)
    expect(bucket.hasTokens(10)).toBe(true)
    expect(bucket.hasTokens(11)).toBe(false)
    // Tokens not consumed
    expect(bucket.getTokens()).toBe(10)
  })

  it('should adjust rate', () => {
    const bucket = new TokenBucket(10, 1)
    for (let i = 0; i < 10; i++) bucket.tryConsume()

    bucket.setRate(10) // 10x faster
    vi.advanceTimersByTime(1000)
    expect(bucket.getTokens()).toBeCloseTo(10, 0)
  })

  it('should enforce minimum rate', () => {
    const bucket = new TokenBucket(10, 1)
    bucket.setRate(0) // Try to set 0
    expect(bucket.getRate()).toBe(0.01)
  })
})

describe('SyncRateLimiter', () => {
  let limiter: SyncRateLimiter

  beforeEach(() => {
    vi.useFakeTimers()
    limiter = new SyncRateLimiter({ defaultRate: 10, defaultCapacity: 20 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should track per-peer rate limits', () => {
    for (let i = 0; i < 20; i++) limiter.canSync('peer1')

    expect(limiter.canSync('peer1')).toBe(false)
    expect(limiter.canSync('peer2')).toBe(true) // Separate bucket
  })

  it('should refill per-peer tokens', () => {
    for (let i = 0; i < 20; i++) limiter.canSync('peer1')
    expect(limiter.canSync('peer1')).toBe(false)

    vi.advanceTimersByTime(1000) // Should get ~10 tokens back
    expect(limiter.canSync('peer1')).toBe(true)
  })

  it('should check without consuming', () => {
    expect(limiter.checkSync('peer1')).toBe(true)
    // Still has all tokens
    for (let i = 0; i < 20; i++) expect(limiter.canSync('peer1')).toBe(true)
    expect(limiter.canSync('peer1')).toBe(false)
  })

  it('should calculate wait time', () => {
    for (let i = 0; i < 20; i++) limiter.canSync('peer1')
    expect(limiter.timeUntilSync('peer1')).toBeCloseTo(100, -2) // 1/10 sec = 100ms
  })

  it('should penalize misbehaving peers', () => {
    for (let i = 0; i < 20; i++) limiter.canSync('bad-peer')
    limiter.penalize('bad-peer', 'severe') // 0.1x rate = 1 token/sec

    vi.advanceTimersByTime(1000)
    expect(limiter.canSync('bad-peer')).toBe(true)
    expect(limiter.canSync('bad-peer')).toBe(false) // Only ~1 token refilled
  })

  it('should restore penalized peers', () => {
    limiter.penalize('peer1', 'severe')
    for (let i = 0; i < 20; i++) limiter.canSync('peer1')

    limiter.restore('peer1')
    vi.advanceTimersByTime(1000)
    // Should get ~10 tokens now
    for (let i = 0; i < 10; i++) {
      expect(limiter.canSync('peer1')).toBe(true)
    }
  })

  it('should boost trusted peers', () => {
    limiter.boost('trusted', 3) // 3x rate = 30 tokens/sec

    for (let i = 0; i < 20; i++) limiter.canSync('trusted')
    vi.advanceTimersByTime(1000)
    // Should get ~30 tokens (capped at capacity 20)
    expect(limiter.checkSync('trusted')).toBe(true)
  })

  it('should remove peer from tracking', () => {
    limiter.canSync('peer1') // Create bucket
    const statsBefore = limiter.getStats()
    expect(statsBefore.has('peer1')).toBe(true)

    limiter.remove('peer1')
    const statsAfter = limiter.getStats()
    expect(statsAfter.has('peer1')).toBe(false)
  })

  it('should return stats for tracked peers', () => {
    limiter.canSync('peer1')
    limiter.canSync('peer2')

    const stats = limiter.getStats()
    expect(stats.size).toBe(2)
    expect(stats.get('peer1')!.tokens).toBeLessThan(20)
    expect(stats.get('peer1')!.rate).toBe(10)
  })
})

describe('ProtocolRateLimiter', () => {
  let limiter: ProtocolRateLimiter

  beforeEach(() => {
    vi.useFakeTimers()
    limiter = new ProtocolRateLimiter({
      '/xnet/sync/1.0.0': { rate: 5, capacity: 10 },
      '/xnet/query/1.0.0': { rate: 2, capacity: 5 }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should rate limit per protocol', () => {
    // Exhaust sync protocol
    for (let i = 0; i < 10; i++) limiter.canRequest('/xnet/sync/1.0.0', 'peer1')
    expect(limiter.canRequest('/xnet/sync/1.0.0', 'peer1')).toBe(false)

    // Query protocol still works
    expect(limiter.canRequest('/xnet/query/1.0.0', 'peer1')).toBe(true)
  })

  it('should use default config for unknown protocols', () => {
    // Unknown protocol gets default (10 rate, 50 capacity)
    for (let i = 0; i < 50; i++) {
      expect(limiter.canRequest('/unknown/1.0.0', 'peer1')).toBe(true)
    }
    expect(limiter.canRequest('/unknown/1.0.0', 'peer1')).toBe(false)
  })

  it('should penalize peer across all protocols', () => {
    limiter.canRequest('/xnet/sync/1.0.0', 'peer1')
    limiter.canRequest('/xnet/query/1.0.0', 'peer1')

    limiter.penalizePeer('peer1', 'severe')

    // Drain remaining tokens
    for (let i = 0; i < 10; i++) limiter.canRequest('/xnet/sync/1.0.0', 'peer1')
    for (let i = 0; i < 5; i++) limiter.canRequest('/xnet/query/1.0.0', 'peer1')

    // After 1 second, both should have minimal recovery
    vi.advanceTimersByTime(1000)
    // severe = 0.1x, so sync gets 0.5 tokens, query gets 0.2 tokens
    expect(limiter.canRequest('/xnet/sync/1.0.0', 'peer1')).toBe(false)
    expect(limiter.canRequest('/xnet/query/1.0.0', 'peer1')).toBe(false)
  })

  it('should allow setting new config', () => {
    limiter.setConfig('/xnet/sync/1.0.0', { rate: 100, capacity: 100 })

    // Now sync is very permissive
    for (let i = 0; i < 100; i++) {
      expect(limiter.canRequest('/xnet/sync/1.0.0', 'peer1')).toBe(true)
    }
  })
})
