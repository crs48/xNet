/**
 * Token bucket rate limiting for sync protocol protection.
 *
 * Allows bursts up to bucket capacity, then enforces steady rate.
 */

/** Token bucket rate limiter. */
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

  /** Try to consume tokens. Returns true if allowed. */
  tryConsume(count: number = 1): boolean {
    this.refill()
    if (this.tokens >= count) {
      this.tokens -= count
      return true
    }
    return false
  }

  /** Get current token count. */
  getTokens(): number {
    this.refill()
    return this.tokens
  }

  /** Check if bucket has tokens without consuming. */
  hasTokens(count: number = 1): boolean {
    this.refill()
    return this.tokens >= count
  }

  /** Time until tokens available (ms). */
  timeUntilTokens(count: number = 1): number {
    this.refill()
    if (this.tokens >= count) return 0
    const needed = count - this.tokens
    return (needed / this.refillRate) * 1000
  }

  /** Adjust rate (for penalties/rewards). */
  setRate(rate: number): void {
    this.refill() // Settle current tokens before changing rate
    this.refillRate = Math.max(0.01, rate)
  }

  /** Get current refill rate. */
  getRate(): number {
    return this.refillRate
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = (now - this.lastRefill) / 1000
    const newTokens = elapsed * this.refillRate
    this.tokens = Math.min(this.capacity, this.tokens + newTokens)
    this.lastRefill = now
  }
}

/** Per-peer sync rate limiter. */
export class SyncRateLimiter {
  private buckets = new Map<string, TokenBucket>()
  private defaultRate: number
  private defaultCapacity: number

  constructor(
    options: {
      /** Default tokens per second (default: 10) */
      defaultRate?: number
      /** Default bucket capacity (default: 50) */
      defaultCapacity?: number
    } = {}
  ) {
    this.defaultRate = options.defaultRate ?? 10
    this.defaultCapacity = options.defaultCapacity ?? 50
  }

  /** Check if sync request is allowed for peer (consumes a token). */
  canSync(peerId: string): boolean {
    return this.getOrCreateBucket(peerId).tryConsume(1)
  }

  /** Check without consuming. */
  checkSync(peerId: string): boolean {
    return this.getOrCreateBucket(peerId).hasTokens(1)
  }

  /** Time until next sync allowed (ms). */
  timeUntilSync(peerId: string): number {
    return this.getOrCreateBucket(peerId).timeUntilTokens(1)
  }

  /** Penalize a misbehaving peer by reducing their rate. */
  penalize(peerId: string, severity: 'minor' | 'major' | 'severe'): void {
    const multipliers = { minor: 0.75, major: 0.5, severe: 0.1 }
    this.getOrCreateBucket(peerId).setRate(this.defaultRate * multipliers[severity])
  }

  /** Restore normal rate for a peer. */
  restore(peerId: string): void {
    this.getOrCreateBucket(peerId).setRate(this.defaultRate)
  }

  /** Increase rate for trusted peer. */
  boost(peerId: string, multiplier: number): void {
    this.getOrCreateBucket(peerId).setRate(this.defaultRate * Math.min(multiplier, 5))
  }

  /** Remove peer from tracking (cleanup). */
  remove(peerId: string): void {
    this.buckets.delete(peerId)
  }

  /** Get stats for all tracked peers. */
  getStats(): Map<string, { tokens: number; rate: number }> {
    const stats = new Map<string, { tokens: number; rate: number }>()
    for (const [peerId, bucket] of this.buckets) {
      stats.set(peerId, { tokens: bucket.getTokens(), rate: bucket.getRate() })
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

/** Protocol-level rate limiter with per-protocol configs. */
export class ProtocolRateLimiter {
  private limiters = new Map<string, SyncRateLimiter>()

  constructor(
    private configs: Record<string, { rate: number; capacity: number }> = {
      '/xnet/sync/1.0.0': { rate: 10, capacity: 50 },
      '/xnet/changes/1.0.0': { rate: 20, capacity: 100 },
      '/xnet/query/1.0.0': { rate: 5, capacity: 20 }
    }
  ) {}

  /** Check if protocol request is allowed for peer. */
  canRequest(protocol: string, peerId: string): boolean {
    return this.getLimiter(protocol).canSync(peerId)
  }

  /** Set rate config for a protocol. */
  setConfig(protocol: string, config: { rate: number; capacity: number }): void {
    this.configs[protocol] = config
    this.limiters.delete(protocol) // Reset to apply new config
  }

  /** Penalize peer for all protocols. */
  penalizePeer(peerId: string, severity: 'minor' | 'major' | 'severe'): void {
    for (const limiter of this.limiters.values()) {
      limiter.penalize(peerId, severity)
    }
  }

  /** Restore peer rate for all protocols. */
  restorePeer(peerId: string): void {
    for (const limiter of this.limiters.values()) {
      limiter.restore(peerId)
    }
  }

  private getLimiter(protocol: string): SyncRateLimiter {
    let limiter = this.limiters.get(protocol)
    if (!limiter) {
      const config = this.configs[protocol] ?? { rate: 10, capacity: 50 }
      limiter = new SyncRateLimiter({ defaultRate: config.rate, defaultCapacity: config.capacity })
      this.limiters.set(protocol, limiter)
    }
    return limiter
  }
}
