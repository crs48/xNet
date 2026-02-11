import type { DID } from '@xnet/core'

export interface GrantRateLimiterOptions {
  limitPerMinute?: number
  windowMs?: number
  now?: () => number
}

/**
 * Per-peer rate limiter for grant operations.
 *
 * Default policy: max 10 grant attempts per peer per minute.
 */
export class GrantRateLimiter {
  private readonly limitPerMinute: number
  private readonly windowMs: number
  private readonly now: () => number
  private readonly attemptsByPeer = new Map<DID, number[]>()

  constructor(options: GrantRateLimiterOptions = {}) {
    this.limitPerMinute = options.limitPerMinute ?? 10
    this.windowMs = options.windowMs ?? 60_000
    this.now = options.now ?? Date.now
  }

  allow(peerDid: DID): boolean {
    const cutoff = this.now() - this.windowMs
    const attempts = this.attemptsByPeer.get(peerDid) ?? []

    const recent = attempts.filter((timestamp) => timestamp > cutoff)
    if (recent.length >= this.limitPerMinute) {
      this.attemptsByPeer.set(peerDid, recent)
      return false
    }

    recent.push(this.now())
    this.attemptsByPeer.set(peerDid, recent)
    return true
  }

  reset(peerDid?: DID): void {
    if (peerDid) {
      this.attemptsByPeer.delete(peerDid)
      return
    }

    this.attemptsByPeer.clear()
  }
}
