/**
 * @xnetjs/hub - WebSocket rate limiting.
 */

export type RateLimitConfig = {
  perConnectionRate: number
  maxConnections: number
  maxMessageSize: number
  windowMs: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  perConnectionRate: 100,
  maxConnections: 500,
  maxMessageSize: 5 * 1024 * 1024,
  windowMs: 1000
}

type ConnectionState = {
  messageCount: number
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

  checkMessage(connId: string, messageSize: number): { allowed: boolean; reason?: string } {
    if (messageSize > this.config.maxMessageSize) {
      return {
        allowed: false,
        reason: `Message exceeds max size of ${this.config.maxMessageSize} bytes`
      }
    }

    const state = this.connections.get(connId)
    if (!state) return { allowed: true }

    const now = Date.now()
    if (now - state.windowStart >= this.config.windowMs) {
      state.messageCount = 0
      state.windowStart = now
    }

    state.messageCount += 1

    if (state.messageCount > this.config.perConnectionRate) {
      state.violations += 1
      if (state.violations >= 3) {
        return {
          allowed: false,
          reason: 'Rate limit exceeded repeatedly — connection will be closed'
        }
      }
      return {
        allowed: false,
        reason: `Rate limit: max ${this.config.perConnectionRate} messages per ${this.config.windowMs}ms`
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
