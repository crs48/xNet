# 11: Auto Blocking

> Automatic peer blocking based on security events and peer scores

**Duration:** 1-2 days  
**Dependencies:** [10-peer-scoring.md](./10-peer-scoring.md)

## Overview

AutoBlocker automatically blocks peers based on:

1. Security event thresholds (e.g., 3 invalid signatures = block)
2. Peer score thresholds (e.g., score < -50 = block)
3. Manual blocks from allowlist/denylist

## Implementation

```typescript
// packages/network/src/security/auto-blocker.ts

import type { PeerId } from '@xnetjs/core'
import type { PeerScorer } from './peer-scorer'
import type { ConnectionGater } from './gater'
import { logSecurityEvent, type SecurityEventType } from './logging'

/**
 * Block reason and metadata.
 */
export interface BlockInfo {
  reason: string
  evidence?: string
  blockedAt: Date
  expiresAt?: Date
  autoBlock: boolean
}

/**
 * Auto-blocking thresholds per event type.
 */
export interface BlockThresholds {
  /** Events in window to trigger block */
  count: number
  /** Time window in ms */
  window: number
  /** Block duration in ms */
  duration: number
}

/**
 * Default thresholds for auto-blocking.
 */
export const DEFAULT_BLOCK_THRESHOLDS: Record<SecurityEventType, BlockThresholds> = {
  invalid_signature: { count: 3, window: 60_000, duration: 24 * 60 * 60_000 }, // 3 in 1 min = 24h
  rate_limit_exceeded: { count: 10, window: 60_000, duration: 60 * 60_000 }, // 10 in 1 min = 1h
  connection_flood: { count: 20, window: 60_000, duration: 60 * 60_000 }, // 20 in 1 min = 1h
  stream_exhaustion: { count: 10, window: 60_000, duration: 30 * 60_000 }, // 10 in 1 min = 30m
  invalid_data: { count: 5, window: 5 * 60_000, duration: 12 * 60 * 60_000 }, // 5 in 5 min = 12h
  peer_score_drop: { count: 1, window: 60_000, duration: 60 * 60_000 }, // 1 = 1h (score already low)
  peer_blocked: { count: Infinity, window: 0, duration: 0 }, // N/A
  peer_unblocked: { count: Infinity, window: 0, duration: 0 }, // N/A
  anomaly_detected: { count: 3, window: 5 * 60_000, duration: 2 * 60 * 60_000 } // 3 in 5 min = 2h
}

/**
 * Auto-blocker that responds to security events.
 */
export class AutoBlocker {
  private blocks = new Map<PeerId, BlockInfo>()
  private eventCounts = new Map<PeerId, Map<SecurityEventType, number[]>>() // timestamps
  private thresholds: Record<SecurityEventType, BlockThresholds>
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(
    private gater: ConnectionGater,
    private scorer?: PeerScorer,
    options: {
      thresholds?: Partial<Record<SecurityEventType, Partial<BlockThresholds>>>
    } = {}
  ) {
    // Merge thresholds
    this.thresholds = { ...DEFAULT_BLOCK_THRESHOLDS }
    if (options.thresholds) {
      for (const [event, config] of Object.entries(options.thresholds)) {
        this.thresholds[event as SecurityEventType] = {
          ...this.thresholds[event as SecurityEventType],
          ...config
        }
      }
    }

    // Listen to peer scorer events
    if (scorer) {
      scorer.on('score-below-disconnect', this.handleScoreThreshold.bind(this))
    }

    // Cleanup expired blocks every minute
    this.cleanupInterval = setInterval(() => this.cleanupExpiredBlocks(), 60_000)
  }

  /**
   * Clean up.
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  // ============ Event Handling ============

  /**
   * Record a security event and check if block needed.
   */
  recordEvent(peerId: PeerId, eventType: SecurityEventType, details?: string): void {
    // Skip if already blocked
    if (this.isBlocked(peerId)) return

    // Record event timestamp
    this.recordEventTimestamp(peerId, eventType)

    // Check threshold
    const threshold = this.thresholds[eventType]
    if (!threshold || threshold.count === Infinity) return

    const count = this.getRecentEventCount(peerId, eventType, threshold.window)

    if (count >= threshold.count) {
      this.blockPeer(peerId, {
        reason: eventType,
        evidence: `${count} events in ${threshold.window}ms. ${details ?? ''}`,
        duration: threshold.duration,
        autoBlock: true
      })
    }
  }

  private handleScoreThreshold(peerId: PeerId, score: number): void {
    this.blockPeer(peerId, {
      reason: 'low_peer_score',
      evidence: `Score dropped to ${score}`,
      duration: 60 * 60_000, // 1 hour
      autoBlock: true
    })
  }

  // ============ Block Management ============

  /**
   * Block a peer.
   */
  blockPeer(
    peerId: PeerId,
    options: {
      reason: string
      evidence?: string
      duration?: number
      autoBlock?: boolean
    }
  ): void {
    const now = new Date()
    const expiresAt = options.duration ? new Date(now.getTime() + options.duration) : undefined

    this.blocks.set(peerId, {
      reason: options.reason,
      evidence: options.evidence,
      blockedAt: now,
      expiresAt,
      autoBlock: options.autoBlock ?? false
    })

    // Add to connection gater denylist
    this.gater.addToDenylist(peerId, { duration: options.duration })

    // Log event
    logSecurityEvent({
      eventType: 'peer_blocked',
      severity: 'high',
      peerId,
      details: {
        reason: options.reason,
        duration: options.duration,
        autoBlock: options.autoBlock
      },
      actionTaken: 'blocked'
    })
  }

  /**
   * Unblock a peer.
   */
  unblockPeer(peerId: PeerId): void {
    const block = this.blocks.get(peerId)
    if (!block) return

    this.blocks.delete(peerId)
    this.gater.removeFromDenylist(peerId)

    // Clear event history
    this.eventCounts.delete(peerId)

    logSecurityEvent({
      eventType: 'peer_unblocked',
      severity: 'low',
      peerId,
      details: { wasAutoBlocked: block.autoBlock },
      actionTaken: 'none'
    })
  }

  /**
   * Check if peer is blocked.
   */
  isBlocked(peerId: PeerId): boolean {
    const block = this.blocks.get(peerId)
    if (!block) return false

    // Check expiry
    if (block.expiresAt && block.expiresAt < new Date()) {
      this.unblockPeer(peerId)
      return false
    }

    return true
  }

  /**
   * Get block info for a peer.
   */
  getBlockInfo(peerId: PeerId): BlockInfo | null {
    return this.blocks.get(peerId) ?? null
  }

  /**
   * Get all blocked peers.
   */
  getBlockedPeers(): Array<{ peerId: PeerId; info: BlockInfo }> {
    return Array.from(this.blocks.entries())
      .filter(([peerId]) => this.isBlocked(peerId))
      .map(([peerId, info]) => ({ peerId, info }))
  }

  // ============ Stats ============

  /**
   * Get blocking statistics.
   */
  getStats(): {
    totalBlocked: number
    autoBlocked: number
    manualBlocked: number
    recentBlocks: number // Last hour
  } {
    const blocked = this.getBlockedPeers()
    const oneHourAgo = new Date(Date.now() - 60 * 60_000)

    return {
      totalBlocked: blocked.length,
      autoBlocked: blocked.filter((b) => b.info.autoBlock).length,
      manualBlocked: blocked.filter((b) => !b.info.autoBlock).length,
      recentBlocks: blocked.filter((b) => b.info.blockedAt > oneHourAgo).length
    }
  }

  // ============ Private ============

  private recordEventTimestamp(peerId: PeerId, eventType: SecurityEventType): void {
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

    // Keep only recent timestamps (last hour)
    const oneHourAgo = Date.now() - 60 * 60_000
    peerEvents.set(
      eventType,
      timestamps.filter((t) => t > oneHourAgo)
    )
  }

  private getRecentEventCount(
    peerId: PeerId,
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
    const now = new Date()
    for (const [peerId, block] of this.blocks) {
      if (block.expiresAt && block.expiresAt < now) {
        this.unblockPeer(peerId)
      }
    }
  }
}
```

## Usage Example

```typescript
import { AutoBlocker, PeerScorer, DefaultConnectionGater } from '@xnetjs/network/security'

const gater = new DefaultConnectionGater(limits)
const scorer = new PeerScorer()
const blocker = new AutoBlocker(gater, scorer, {
  thresholds: {
    // Stricter threshold for invalid signatures
    invalid_signature: { count: 2, window: 60_000, duration: 48 * 60 * 60_000 }
  }
})

// When handling sync messages
function handleSyncMessage(peerId: string, message: SyncMessage) {
  if (!verifySignature(message)) {
    scorer.recordInvalidSignature(peerId)
    blocker.recordEvent(peerId, 'invalid_signature', `changeId: ${message.changeId}`)
    throw new InvalidSignatureError()
  }

  // Process valid message...
}

// Check block status
function canSyncWith(peerId: string): boolean {
  return !blocker.isBlocked(peerId)
}
```

## Tests

```typescript
// packages/network/test/auto-blocker.test.ts

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AutoBlocker } from '../src/security/auto-blocker'
import { DefaultConnectionGater } from '../src/security/gater'
import { DEFAULT_LIMITS } from '../src/security/limits'

describe('AutoBlocker', () => {
  let gater: DefaultConnectionGater
  let blocker: AutoBlocker

  beforeEach(() => {
    vi.useFakeTimers()
    gater = new DefaultConnectionGater(DEFAULT_LIMITS)
    blocker = new AutoBlocker(gater)
  })

  afterEach(() => {
    blocker.destroy()
    vi.useRealTimers()
  })

  describe('recordEvent', () => {
    it('should block after threshold exceeded', () => {
      const peerId = 'peer1'

      // Record events up to threshold
      blocker.recordEvent(peerId, 'invalid_signature')
      blocker.recordEvent(peerId, 'invalid_signature')
      expect(blocker.isBlocked(peerId)).toBe(false)

      // Third event triggers block
      blocker.recordEvent(peerId, 'invalid_signature')
      expect(blocker.isBlocked(peerId)).toBe(true)
    })

    it('should respect time window', () => {
      const peerId = 'peer1'

      // Record 2 events
      blocker.recordEvent(peerId, 'invalid_signature')
      blocker.recordEvent(peerId, 'invalid_signature')

      // Wait for window to pass
      vi.advanceTimersByTime(70_000) // > 60s window

      // Third event doesn't trigger (first two expired)
      blocker.recordEvent(peerId, 'invalid_signature')
      expect(blocker.isBlocked(peerId)).toBe(false)
    })
  })

  describe('blockPeer', () => {
    it('should block peer with duration', () => {
      const peerId = 'peer1'

      blocker.blockPeer(peerId, {
        reason: 'test',
        duration: 60_000 // 1 minute
      })

      expect(blocker.isBlocked(peerId)).toBe(true)

      // After expiry
      vi.advanceTimersByTime(61_000)
      expect(blocker.isBlocked(peerId)).toBe(false)
    })

    it('should add to gater denylist', () => {
      const peerId = 'peer1'

      blocker.blockPeer(peerId, { reason: 'test' })

      // Gater should reject this peer
      // (Would need to mock gater.interceptSecured to verify)
    })
  })

  describe('unblockPeer', () => {
    it('should unblock and clear history', () => {
      const peerId = 'peer1'

      // Block
      blocker.blockPeer(peerId, { reason: 'test' })
      expect(blocker.isBlocked(peerId)).toBe(true)

      // Unblock
      blocker.unblockPeer(peerId)
      expect(blocker.isBlocked(peerId)).toBe(false)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      blocker.blockPeer('peer1', { reason: 'auto', autoBlock: true })
      blocker.blockPeer('peer2', { reason: 'manual', autoBlock: false })

      const stats = blocker.getStats()

      expect(stats.totalBlocked).toBe(2)
      expect(stats.autoBlocked).toBe(1)
      expect(stats.manualBlocked).toBe(1)
    })
  })
})
```

## Checklist

- [ ] Define BlockThresholds and defaults
- [ ] Implement AutoBlocker class
- [ ] Implement event recording with time windows
- [ ] Implement threshold checking
- [ ] Implement block/unblock methods
- [ ] Integrate with ConnectionGater
- [ ] Integrate with PeerScorer
- [ ] Implement block expiry cleanup
- [ ] Add statistics
- [ ] Write comprehensive tests
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Peer Scoring](./10-peer-scoring.md) | [Next: Allowlist/Denylist](./12-allowlist-denylist.md)
