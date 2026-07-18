/**
 * @xnetjs/hub - WebSocket rate limiting.
 */

export type RateLimitConfig = {
  perConnectionRate: number
  /**
   * Max node-changes accepted per window per connection, counted across BOTH
   * single and batched pushes (exploration 0357).
   *
   * This is a second, independent budget rather than a multiplier on
   * `perConnectionRate`, because frames and changes bound different costs. A
   * frame costs parse + dispatch; a change costs verify + authorize + store.
   * Batching legitimately removes the former, so charging a 1000-change batch
   * as 1000 *messages* would make batching pointless — but leaving changes
   * uncounted entirely would make a batch frame an unlimited bypass. Counting
   * them separately is the honest model: one frame, N changes, each against
   * the budget that actually reflects its cost.
   *
   * Sized against measured hub throughput: native Ed25519 verify runs ~11k
   * changes/s, so 5000/s per connection leaves real headroom while still
   * bounding a hostile client.
   */
  perConnectionChangeRate: number
  maxConnections: number
  maxMessageSize: number
  windowMs: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  perConnectionRate: 100,
  perConnectionChangeRate: 5000,
  maxConnections: 500,
  maxMessageSize: 5 * 1024 * 1024,
  windowMs: 1000
}

type ConnectionState = {
  messageCount: number
  changeCount: number
  windowStart: number
  violations: number
}

export class RateLimiter {
  private connections = new Map<string, ConnectionState>()
  private config: RateLimitConfig
  private totalConnections = 0

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  canAcceptConnection(): boolean {
    return this.totalConnections < this.config.maxConnections
  }

  addConnection(connId: string): void {
    this.connections.set(connId, {
      messageCount: 0,
      changeCount: 0,
      windowStart: Date.now(),
      violations: 0
    })
    this.totalConnections += 1
  }

  removeConnection(connId: string): void {
    if (this.connections.delete(connId)) {
      this.totalConnections = Math.max(0, this.totalConnections - 1)
    }
  }

  /**
   * Size-only guard, safe to run BEFORE parsing. Kept separate so the caller
   * can reject an oversized frame without first parsing it, then charge the
   * rate budget once it knows how much work the frame actually represents.
   */
  checkSize(messageSize: number): { allowed: boolean; reason?: string } {
    if (messageSize > this.config.maxMessageSize) {
      return {
        allowed: false,
        reason: `Message exceeds max size of ${this.config.maxMessageSize} bytes`
      }
    }
    return { allowed: true }
  }

  /**
   * @param changeCount How many node-changes this frame carries (0 for frames
   * that carry none, 1 for a single push, N for a batched push). Charged
   * against the separate change budget — see `perConnectionChangeRate`.
   */
  checkMessage(
    connId: string,
    messageSize: number,
    changeCount = 0
  ): { allowed: boolean; reason?: string } {
    const sizeCheck = this.checkSize(messageSize)
    if (!sizeCheck.allowed) return sizeCheck

    const state = this.connections.get(connId)
    if (!state) return { allowed: true }

    const now = Date.now()
    if (now - state.windowStart >= this.config.windowMs) {
      state.messageCount = 0
      state.changeCount = 0
      state.windowStart = now
    }

    state.messageCount += 1
    state.changeCount += Math.max(0, changeCount)

    const overMessages = state.messageCount > this.config.perConnectionRate
    const overChanges = state.changeCount > this.config.perConnectionChangeRate

    if (overMessages || overChanges) {
      state.violations += 1
      if (state.violations >= 3) {
        return {
          allowed: false,
          reason: 'Rate limit exceeded repeatedly — connection will be closed'
        }
      }
      return {
        allowed: false,
        reason: overChanges
          ? `Rate limit: max ${this.config.perConnectionChangeRate} changes per ${this.config.windowMs}ms`
          : `Rate limit: max ${this.config.perConnectionRate} messages per ${this.config.windowMs}ms`
      }
    }

    state.violations = 0
    return { allowed: true }
  }

  getStats(): { totalConnections: number; maxConnections: number } {
    return {
      totalConnections: this.totalConnections,
      maxConnections: this.config.maxConnections
    }
  }
}
