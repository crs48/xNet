import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { SyncRateLimiter, TokenBucket, ProtocolRateLimiter } from './rate-limiter'

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tracks lastActivity on tryConsume', () => {
    const bucket = new TokenBucket(10, 1)
    const initialActivity = bucket.lastActivity

    // Small delay to ensure time passes
    vi.advanceTimersByTime(10)
    bucket.tryConsume(1)

    expect(bucket.lastActivity).toBeGreaterThanOrEqual(initialActivity)
  })

  it('tracks lastActivity on hasTokens', () => {
    const bucket = new TokenBucket(10, 1)
    const initialActivity = bucket.lastActivity

    vi.advanceTimersByTime(10)
    bucket.hasTokens(1)

    expect(bucket.lastActivity).toBeGreaterThanOrEqual(initialActivity)
  })
})

describe('SyncRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates buckets for peers on first access', () => {
    const limiter = new SyncRateLimiter({ cleanupIntervalMs: 0 })
    expect(limiter.peerCount).toBe(0)

    limiter.canSync('peer1')
    expect(limiter.peerCount).toBe(1)

    limiter.canSync('peer2')
    expect(limiter.peerCount).toBe(2)

    // Same peer doesn't create another bucket
    limiter.canSync('peer1')
    expect(limiter.peerCount).toBe(2)

    limiter.stopCleanup()
  })

  it('cleanupStale removes inactive peers', () => {
    const limiter = new SyncRateLimiter({
      cleanupIntervalMs: 0, // Disable auto-cleanup for this test
      staleThresholdMs: 1000 // 1 second
    })

    // Create some peers
    limiter.canSync('peer1')
    limiter.canSync('peer2')
    limiter.canSync('peer3')
    expect(limiter.peerCount).toBe(3)

    // Advance time past threshold
    vi.advanceTimersByTime(1500)

    // Access peer1 to keep it fresh
    limiter.canSync('peer1')

    // Cleanup should remove peer2 and peer3
    const removed = limiter.cleanupStale()
    expect(removed).toBe(2)
    expect(limiter.peerCount).toBe(1)

    // peer1 should still exist
    expect(limiter.checkSync('peer1')).toBe(true)
  })

  it('manual remove removes specific peer', () => {
    const limiter = new SyncRateLimiter({ cleanupIntervalMs: 0 })

    limiter.canSync('peer1')
    limiter.canSync('peer2')
    expect(limiter.peerCount).toBe(2)

    limiter.remove('peer1')
    expect(limiter.peerCount).toBe(1)

    limiter.stopCleanup()
  })

  it('auto-cleanup runs on interval', () => {
    const limiter = new SyncRateLimiter({
      cleanupIntervalMs: 100,
      staleThresholdMs: 50
    })

    limiter.canSync('peer1')
    expect(limiter.peerCount).toBe(1)

    // Advance past stale threshold and past cleanup interval
    vi.advanceTimersByTime(150)

    // Cleanup should have run
    expect(limiter.peerCount).toBe(0)

    limiter.stopCleanup()
  })

  it('stopCleanup stops the interval', () => {
    const limiter = new SyncRateLimiter({
      cleanupIntervalMs: 100,
      staleThresholdMs: 50
    })

    limiter.canSync('peer1')
    limiter.stopCleanup()

    // Advance past cleanup interval
    vi.advanceTimersByTime(200)

    // Peer should still exist because cleanup was stopped
    expect(limiter.peerCount).toBe(1)
  })

  it('startCleanup can restart cleanup', () => {
    const limiter = new SyncRateLimiter({
      cleanupIntervalMs: 0, // Start with no auto-cleanup
      staleThresholdMs: 50
    })

    limiter.canSync('peer1')
    expect(limiter.peerCount).toBe(1)

    // Start cleanup
    limiter.startCleanup(100)

    // Advance past threshold and interval
    vi.advanceTimersByTime(150)

    expect(limiter.peerCount).toBe(0)

    limiter.stopCleanup()
  })
})

describe('ProtocolRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('cleanupStale cleans all protocol limiters', () => {
    const limiter = new ProtocolRateLimiter(undefined, {
      cleanupIntervalMs: 0,
      staleThresholdMs: 100
    })

    // Access multiple protocols
    limiter.canRequest('/xnet/sync/1.0.0', 'peer1')
    limiter.canRequest('/xnet/changes/1.0.0', 'peer2')

    // Advance time
    vi.advanceTimersByTime(200)

    const removed = limiter.cleanupStale()
    expect(removed).toBe(2)

    limiter.stopCleanup()
  })

  it('removePeer removes from all protocols', () => {
    const limiter = new ProtocolRateLimiter(undefined, {
      cleanupIntervalMs: 0
    })

    // Same peer accesses multiple protocols
    limiter.canRequest('/xnet/sync/1.0.0', 'peer1')
    limiter.canRequest('/xnet/changes/1.0.0', 'peer1')

    limiter.removePeer('peer1')

    // Accessing again should work (creates new bucket)
    expect(limiter.canRequest('/xnet/sync/1.0.0', 'peer1')).toBe(true)

    limiter.stopCleanup()
  })

  it('auto-cleanup works for protocol limiters', () => {
    const limiter = new ProtocolRateLimiter(undefined, {
      cleanupIntervalMs: 100,
      staleThresholdMs: 50
    })

    limiter.canRequest('/xnet/sync/1.0.0', 'peer1')

    // Advance past threshold and interval
    vi.advanceTimersByTime(150)

    // Manual cleanup should return 0 since auto-cleanup already ran
    const removed = limiter.cleanupStale()
    expect(removed).toBe(0)

    limiter.stopCleanup()
  })
})
