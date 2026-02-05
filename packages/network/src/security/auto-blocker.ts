/**
 * AutoBlocker - automatic peer blocking based on security events and scores.
 *
 * Blocks peers when they exceed configurable thresholds for different event types.
 */

import type { DefaultConnectionGater } from './gater'
import type { PeerScorer } from './peer-scorer'
import { logSecurityEvent, type SecurityEventType } from './logging'

export interface BlockInfo {
  reason: string
  evidence?: string
  blockedAt: number
  expiresAt?: number
  autoBlock: boolean
}

export interface BlockThresholds {
  /** Events in window to trigger block */
  count: number
  /** Time window in ms */
  window: number
  /** Block duration in ms */
  duration: number
}

export const DEFAULT_BLOCK_THRESHOLDS: Record<SecurityEventType, BlockThresholds> = {
  invalid_signature: { count: 3, window: 60_000, duration: 24 * 60 * 60_000 },
  rate_limit_exceeded: { count: 10, window: 60_000, duration: 60 * 60_000 },
  connection_flood: { count: 20, window: 60_000, duration: 60 * 60_000 },
  stream_exhaustion: { count: 10, window: 60_000, duration: 30 * 60_000 },
  invalid_data: { count: 5, window: 5 * 60_000, duration: 12 * 60 * 60_000 },
  peer_score_drop: { count: 1, window: 60_000, duration: 60 * 60_000 },
  peer_blocked: { count: Infinity, window: 0, duration: 0 },
  peer_unblocked: { count: Infinity, window: 0, duration: 0 },
  anomaly_detected: { count: 3, window: 5 * 60_000, duration: 2 * 60 * 60_000 }
}

export class AutoBlocker {
  private blocks = new Map<string, BlockInfo>()
  private eventCounts = new Map<string, Map<SecurityEventType, number[]>>()
  private thresholds: Record<SecurityEventType, BlockThresholds>
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor(
    private gater: DefaultConnectionGater,
    private scorer?: PeerScorer,
    options: {
      thresholds?: Partial<Record<SecurityEventType, Partial<BlockThresholds>>>
    } = {}
  ) {
    this.thresholds = { ...DEFAULT_BLOCK_THRESHOLDS }
    if (options.thresholds) {
      for (const [event, config] of Object.entries(options.thresholds)) {
        this.thresholds[event as SecurityEventType] = {
          ...this.thresholds[event as SecurityEventType],
          ...config
        }
      }
    }

    if (scorer) {
      scorer.on('score-below-disconnect', (peerId: string, score: number) => {
        this.handleScoreThreshold(peerId, score)
      })
    }

    this.cleanupTimer = setInterval(() => this.cleanupExpiredBlocks(), 60_000)
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  // ============ Event Handling ============

  /** Record a security event and check if block threshold is reached. */
  recordEvent(peerId: string, eventType: SecurityEventType, details?: string): void {
    if (this.isBlocked(peerId)) return

    this.recordEventTimestamp(peerId, eventType)

    const threshold = this.thresholds[eventType]
    if (!threshold || threshold.count === Infinity) return

    const count = this.getRecentEventCount(peerId, eventType, threshold.window)
    if (count >= threshold.count) {
      this.blockPeer(peerId, {
        reason: eventType,
        evidence: `${count} events in ${threshold.window}ms. ${details ?? ''}`.trim(),
        duration: threshold.duration,
        autoBlock: true
      })
    }
  }

  // ============ Block Management ============

  /** Block a peer. */
  blockPeer(
    peerId: string,
    options: {
      reason: string
      evidence?: string
      duration?: number
      autoBlock?: boolean
    }
  ): void {
    const now = Date.now()
    const expiresAt = options.duration ? now + options.duration : undefined

    this.blocks.set(peerId, {
      reason: options.reason,
      evidence: options.evidence,
      blockedAt: now,
      expiresAt,
      autoBlock: options.autoBlock ?? false
    })

    this.gater.addToDenylist(peerId, options.duration ? { duration: options.duration } : undefined)

    logSecurityEvent({
      eventType: 'peer_blocked',
      severity: 'high',
      peerId,
      details: { reason: options.reason, duration: options.duration, autoBlock: options.autoBlock },
      actionTaken: 'blocked'
    })
  }

  /** Unblock a peer. */
  unblockPeer(peerId: string): void {
    const block = this.blocks.get(peerId)
    if (!block) return

    this.blocks.delete(peerId)
    this.gater.removeFromDenylist(peerId)
    this.eventCounts.delete(peerId)

    logSecurityEvent({
      eventType: 'peer_unblocked',
      severity: 'low',
      peerId,
      details: { wasAutoBlocked: block.autoBlock },
      actionTaken: 'none'
    })
  }

  /** Check if peer is blocked (also handles expiry). */
  isBlocked(peerId: string): boolean {
    const block = this.blocks.get(peerId)
    if (!block) return false

    if (block.expiresAt && block.expiresAt < Date.now()) {
      this.unblockPeer(peerId)
      return false
    }

    return true
  }

  getBlockInfo(peerId: string): BlockInfo | null {
    if (!this.isBlocked(peerId)) return null
    return this.blocks.get(peerId) ?? null
  }

  getBlockedPeers(): Array<{ peerId: string; info: BlockInfo }> {
    const result: Array<{ peerId: string; info: BlockInfo }> = []
    for (const [peerId, info] of this.blocks) {
      if (this.isBlocked(peerId)) {
        result.push({ peerId, info })
      }
    }
    return result
  }

  // ============ Stats ============

  getStats(): {
    totalBlocked: number
    autoBlocked: number
    manualBlocked: number
  } {
    const blocked = this.getBlockedPeers()
    return {
      totalBlocked: blocked.length,
      autoBlocked: blocked.filter((b) => b.info.autoBlock).length,
      manualBlocked: blocked.filter((b) => !b.info.autoBlock).length
    }
  }

  // ============ Private ============

  private handleScoreThreshold(peerId: string, score: number): void {
    this.blockPeer(peerId, {
      reason: 'low_peer_score',
      evidence: `Score dropped to ${score}`,
      duration: 60 * 60_000,
      autoBlock: true
    })
  }

  private recordEventTimestamp(peerId: string, eventType: SecurityEventType): void {
    let peerEvents = this.eventCounts.get(peerId)
    if (!peerEvents) {
      peerEvents = new Map()
      this.eventCounts.set(peerId, peerEvents)
    }

    let timestamps = peerEvents.get(eventType)
    if (!timestamps) {
      timestamps = []
      peerEvents.set(eventType, timestamps)
    }

    timestamps.push(Date.now())

    // Prune old timestamps (keep last hour)
    const oneHourAgo = Date.now() - 60 * 60_000
    peerEvents.set(
      eventType,
      timestamps.filter((t) => t > oneHourAgo)
    )
  }

  private getRecentEventCount(
    peerId: string,
    eventType: SecurityEventType,
    windowMs: number
  ): number {
    const peerEvents = this.eventCounts.get(peerId)
    if (!peerEvents) return 0

    const timestamps = peerEvents.get(eventType)
    if (!timestamps) return 0

    const cutoff = Date.now() - windowMs
    return timestamps.filter((t) => t > cutoff).length
  }

  private cleanupExpiredBlocks(): void {
    const now = Date.now()
    for (const [peerId, block] of this.blocks) {
      if (block.expiresAt && block.expiresAt < now) {
        this.unblockPeer(peerId)
      }
    }
  }
}
