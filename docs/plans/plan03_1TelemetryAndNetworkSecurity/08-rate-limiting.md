# 08: Rate Limiting

> Token bucket rate limiting for sync protocol protection

**Duration:** 1-2 days  
**Dependencies:** [07-connection-limits.md](./07-connection-limits.md)

## Overview

Rate limiting complements connection limits by controlling the _rate_ of operations, not just total counts. Uses token bucket algorithm for smooth rate limiting with burst tolerance.

## Implementation

### Token Bucket Rate Limiter

```typescript
// packages/network/src/security/rate-limiter.ts

/**
 * Token bucket rate limiter.
 * Allows bursts up to bucket size, then enforces steady rate.
 */
export class TokenBucket {
  private tokens: number
  private lastRefill: number

  constructor(
    /** Bucket capacity (max burst size) */
    private capacity: number,
    /** Tokens added per second */
    private refillRate: number
  ) {
    this.tokens = capacity
    this.lastRefill = Date.now()
  }

  /**
   * Try to consume tokens. Returns true if allowed.
   */
  tryConsume(count: number = 1): boolean {
    this.refill()

    if (this.tokens >= count) {
      this.tokens -= count
      return true
    }

    return false
  }

  /**
   * Get current token count.
   */
  getTokens(): number {
    this.refill()
    return this.tokens
  }

  /**
   * Check if bucket has tokens without consuming.
   */
  hasTokens(count: number = 1): boolean {
    this.refill()
    return this.tokens >= count
  }

  /**
   * Time until tokens available (ms).
   */
  timeUntilTokens(count: number = 1): number {
    this.refill()

    if (this.tokens >= count) {
      return 0
    }

    const needed = count - this.tokens
    return (needed / this.refillRate) * 1000
  }

  /**
   * Adjust rate (for penalties/rewards).
   */
  setRate(rate: number): void {
    this.refillRate = Math.max(0.01, rate) // Min 1 token per 100s
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000 // seconds
    const newTokens = elapsed * this.refillRate

    this.tokens = Math.min(this.capacity, this.tokens + newTokens)
    this.lastRefill = now
  }
}

/**
 * Rate limiter for sync requests.
 */
export class SyncRateLimiter {
  private buckets = new Map<string, TokenBucket>()
  private defaultRate: number
  private defaultCapacity: number

  constructor(
    options: {
      /** Default tokens per second */
      defaultRate?: number
      /** Default bucket capacity */
      defaultCapacity?: number
    } = {}
  ) {
    this.defaultRate = options.defaultRate ?? 10 // 10 requests/sec
    this.defaultCapacity = options.defaultCapacity ?? 50 // Burst of 50
  }

  /**
   * Check if sync request is allowed for peer.
   */
  canSync(peerId: string): boolean {
    const bucket = this.getOrCreateBucket(peerId)
    return bucket.tryConsume(1)
  }

  /**
   * Check without consuming.
   */
  checkSync(peerId: string): boolean {
    const bucket = this.getOrCreateBucket(peerId)
    return bucket.hasTokens(1)
  }

  /**
   * Time until next sync allowed (ms).
   */
  timeUntilSync(peerId: string): number {
    const bucket = this.getOrCreateBucket(peerId)
    return bucket.timeUntilTokens(1)
  }

  /**
   * Penalize a misbehaving peer by reducing their rate.
   */
  penalize(peerId: string, severity: 'minor' | 'major' | 'severe'): void {
    const bucket = this.getOrCreateBucket(peerId)
    const multipliers = { minor: 0.75, major: 0.5, severe: 0.1 }
    const currentRate = this.defaultRate // Would track per-peer rate in full impl
    bucket.setRate(currentRate * multipliers[severity])
  }

  /**
   * Restore normal rate for a peer.
   */
  restore(peerId: string): void {
    const bucket = this.getOrCreateBucket(peerId)
    bucket.setRate(this.defaultRate)
  }

  /**
   * Increase rate for trusted peer.
   */
  boost(peerId: string, multiplier: number): void {
    const bucket = this.getOrCreateBucket(peerId)
    bucket.setRate(this.defaultRate * Math.min(multiplier, 5)) // Max 5x
  }

  /**
   * Remove peer from tracking (cleanup).
   */
  remove(peerId: string): void {
    this.buckets.delete(peerId)
  }

  /**
   * Get stats for all tracked peers.
   */
  getStats(): Map<string, { tokens: number }> {
    const stats = new Map<string, { tokens: number }>()
    for (const [peerId, bucket] of this.buckets) {
      stats.set(peerId, { tokens: bucket.getTokens() })
    }
    return stats
  }

  private getOrCreateBucket(peerId: string): TokenBucket {
    let bucket = this.buckets.get(peerId)
    if (!bucket) {
      bucket = new TokenBucket(this.defaultCapacity, this.defaultRate)
      this.buckets.set(peerId, bucket)
    }
    return bucket
  }
}
```

### Protocol-Level Rate Limiter

```typescript
// packages/network/src/security/protocol-limiter.ts

import { SyncRateLimiter } from './rate-limiter'
import { logSecurityEvent } from './logging'

/**
 * Rate limiter for specific protocols.
 */
export class ProtocolRateLimiter {
  private limiters = new Map<string, SyncRateLimiter>()

  /** Default rate configs per protocol */
  private configs: Record<string, { rate: number; capacity: number }> = {
    '/xnet/sync/1.0.0': { rate: 10, capacity: 50 },
    '/xnet/changes/1.0.0': { rate: 20, capacity: 100 },
    '/xnet/query/1.0.0': { rate: 5, capacity: 20 }
  }

  /**
   * Check if protocol request is allowed.
   */
  canRequest(protocol: string, peerId: string): boolean {
    const limiter = this.getLimiter(protocol)
    const allowed = limiter.canSync(peerId)

    if (!allowed) {
      logSecurityEvent({
        eventType: 'rate_limit_exceeded',
        severity: 'low',
        peerIdHash: peerId.slice(0, 16),
        details: JSON.stringify({ protocol }),
        actionTaken: 'throttled'
      })
    }

    return allowed
  }

  /**
   * Set rate config for a protocol.
   */
  setConfig(protocol: string, config: { rate: number; capacity: number }): void {
    this.configs[protocol] = config
    // Reset limiter to apply new config
    this.limiters.delete(protocol)
  }

  /**
   * Penalize peer for all protocols.
   */
  penalizePeer(peerId: string, severity: 'minor' | 'major' | 'severe'): void {
    for (const limiter of this.limiters.values()) {
      limiter.penalize(peerId, severity)
    }
  }

  private getLimiter(protocol: string): SyncRateLimiter {
    let limiter = this.limiters.get(protocol)
    if (!limiter) {
      const config = this.configs[protocol] ?? { rate: 10, capacity: 50 }
      limiter = new SyncRateLimiter({
        defaultRate: config.rate,
        defaultCapacity: config.capacity
      })
      this.limiters.set(protocol, limiter)
    }
    return limiter
  }
}
```

## Usage Example

```typescript
// In sync protocol handler
import { SyncRateLimiter } from '@xnet/network/security'

const rateLimiter = new SyncRateLimiter({
  defaultRate: 10, // 10 sync requests per second
  defaultCapacity: 50 // Allow burst of 50
})

async function handleSyncRequest(peerId: string, request: SyncRequest) {
  // Check rate limit
  if (!rateLimiter.canSync(peerId)) {
    const waitTime = rateLimiter.timeUntilSync(peerId)
    throw new RateLimitError(`Rate limit exceeded. Retry in ${waitTime}ms`)
  }

  // Process sync request...
  try {
    const result = await processSync(request)
    return result
  } catch (error) {
    // Penalize if peer sends bad data
    if (error instanceof InvalidDataError) {
      rateLimiter.penalize(peerId, 'major')
    }
    throw error
  }
}
```

## Tests

```typescript
// packages/network/test/rate-limiter.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TokenBucket, SyncRateLimiter } from '../src/security/rate-limiter'

describe('TokenBucket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should allow bursts up to capacity', () => {
    const bucket = new TokenBucket(10, 1) // 10 capacity, 1/sec

    // Should allow 10 quick requests
    for (let i = 0; i < 10; i++) {
      expect(bucket.tryConsume()).toBe(true)
    }

    // 11th should fail
    expect(bucket.tryConsume()).toBe(false)
  })

  it('should refill over time', () => {
    const bucket = new TokenBucket(10, 2) // 2 tokens/sec

    // Drain bucket
    for (let i = 0; i < 10; i++) {
      bucket.tryConsume()
    }
    expect(bucket.getTokens()).toBe(0)

    // Wait 1 second
    vi.advanceTimersByTime(1000)

    // Should have ~2 tokens
    expect(bucket.getTokens()).toBeCloseTo(2, 1)
  })

  it('should calculate time until tokens available', () => {
    const bucket = new TokenBucket(10, 1) // 1 token/sec

    // Drain bucket
    for (let i = 0; i < 10; i++) {
      bucket.tryConsume()
    }

    // Should need 1 second for 1 token
    expect(bucket.timeUntilTokens(1)).toBeCloseTo(1000, -2)
  })
})

describe('SyncRateLimiter', () => {
  let limiter: SyncRateLimiter

  beforeEach(() => {
    vi.useFakeTimers()
    limiter = new SyncRateLimiter({
      defaultRate: 10,
      defaultCapacity: 20
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should track per-peer rate limits', () => {
    // Peer 1 uses their quota
    for (let i = 0; i < 20; i++) {
      limiter.canSync('peer1')
    }

    // Peer 1 is limited
    expect(limiter.canSync('peer1')).toBe(false)

    // Peer 2 is not affected
    expect(limiter.canSync('peer2')).toBe(true)
  })

  it('should penalize misbehaving peers', () => {
    // Use some tokens
    for (let i = 0; i < 10; i++) {
      limiter.canSync('bad-peer')
    }

    // Penalize (reduces rate)
    limiter.penalize('bad-peer', 'severe') // 0.1x rate

    // Wait 1 second - should only get ~1 token instead of ~10
    vi.advanceTimersByTime(1000)

    // Should have very few tokens
    expect(limiter.checkSync('bad-peer')).toBe(true)
    limiter.canSync('bad-peer')
    expect(limiter.checkSync('bad-peer')).toBe(false)
  })
})
```

## Checklist

- [ ] Implement TokenBucket class
- [ ] Implement SyncRateLimiter with per-peer tracking
- [ ] Add penalty/restore/boost methods
- [ ] Implement ProtocolRateLimiter
- [ ] Integrate with sync protocol handler
- [ ] Write comprehensive tests
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Connection Limits](./07-connection-limits.md) | [Next: Security Logging](./09-security-logging.md)
