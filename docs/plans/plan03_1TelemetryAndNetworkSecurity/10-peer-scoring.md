# 10: Peer Scoring

> Reputation-based peer scoring inspired by GossipSub v1.1

**Duration:** 2 days  
**Dependencies:** [09-security-logging.md](./09-security-logging.md)

## Overview

Peer scoring tracks behavior over time to identify good and bad actors. Scores influence:

- Connection priorities
- Rate limit allocations
- Automatic blocking decisions

Inspired by [GossipSub v1.1 peer scoring](https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/gossipsub-v1.1.md#peer-scoring).

## Implementation

### Peer Score Types

```typescript
// packages/network/src/security/peer-scorer.ts

import type { PeerId } from '@xnetjs/core'
import { logSecurityEvent } from './logging'

/**
 * Metrics tracked for each peer.
 */
export interface PeerMetrics {
  // ============ Positive Behaviors ============

  /** Successful sync operations */
  syncSuccesses: number

  /** Valid changes received */
  validChanges: number

  /** Time connected (ms) */
  uptime: number

  /** Average response latency (ms) */
  avgLatency: number

  // ============ Negative Behaviors ============

  /** Failed sync operations */
  syncFailures: number

  /** Invalid signatures received */
  invalidSignatures: number

  /** Invalid/malformed data received */
  invalidData: number

  /** Rate limit violations */
  rateLimitViolations: number

  /** Connection attempts after rejection */
  rejectedConnections: number

  // ============ Metadata ============

  /** First seen timestamp */
  firstSeen: number

  /** Last activity timestamp */
  lastSeen: number

  /** IP addresses seen (for colocation detection) */
  ips: Set<string>
}

/**
 * Computed peer score.
 */
export interface PeerScore {
  peerId: PeerId
  score: number // -100 to +100
  metrics: PeerMetrics
  lastUpdated: Date
}

/**
 * Score thresholds for actions.
 */
export interface ScoreThresholds {
  /** Below this: disconnect and temporary ban */
  disconnect: number // default: -50

  /** Below this: reduce resource allocation */
  throttle: number // default: -20

  /** Below this: increase monitoring */
  warn: number // default: 0

  /** Above this: increase resource allocation */
  boost: number // default: 50
}

export const DEFAULT_THRESHOLDS: ScoreThresholds = {
  disconnect: -50,
  throttle: -20,
  warn: 0,
  boost: 50
}

/**
 * Score weights for different behaviors.
 */
export interface ScoreWeights {
  // Positive (add to score)
  syncSuccess: number // +0.5 per success
  validChange: number // +0.1 per valid change
  uptime: number // +0.01 per minute, max +10
  lowLatency: number // +5 if avg < 100ms

  // Negative (subtract from score)
  syncFailure: number // -2 per failure
  invalidSignature: number // -50 per invalid sig (severe)
  invalidData: number // -10 per invalid data
  rateLimitViolation: number // -5 per violation
  ipColocation: number // -2 per extra IP (Sybil indicator)
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  syncSuccess: 0.5,
  validChange: 0.1,
  uptime: 0.01,
  lowLatency: 5,

  syncFailure: -2,
  invalidSignature: -50,
  invalidData: -10,
  rateLimitViolation: -5,
  ipColocation: -2
}
```

### Peer Scorer Class

```typescript
// packages/network/src/security/peer-scorer.ts (continued)

/**
 * Peer scoring system.
 */
export class PeerScorer {
  private scores = new Map<PeerId, PeerScore>()
  private weights: ScoreWeights
  private thresholds: ScoreThresholds
  private decayInterval: NodeJS.Timeout | null = null

  constructor(
    options: {
      weights?: Partial<ScoreWeights>
      thresholds?: Partial<ScoreThresholds>
      /** Score decay interval in ms (default: 60000 = 1 min) */
      decayIntervalMs?: number
      /** Score decay factor per interval (default: 0.99) */
      decayFactor?: number
    } = {}
  ) {
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights }
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds }

    // Start decay timer
    const interval = options.decayIntervalMs ?? 60_000
    const decay = options.decayFactor ?? 0.99

    this.decayInterval = setInterval(() => {
      this.decayScores(decay)
    }, interval)
  }

  /**
   * Clean up timers.
   */
  destroy(): void {
    if (this.decayInterval) {
      clearInterval(this.decayInterval)
      this.decayInterval = null
    }
  }

  // ============ Score Access ============

  /**
   * Get score for a peer.
   */
  getScore(peerId: PeerId): number {
    return this.scores.get(peerId)?.score ?? 0
  }

  /**
   * Get full score data for a peer.
   */
  getScoreData(peerId: PeerId): PeerScore | null {
    return this.scores.get(peerId) ?? null
  }

  /**
   * Get all scores sorted by score (descending).
   */
  getAllScores(): PeerScore[] {
    return Array.from(this.scores.values()).sort((a, b) => b.score - a.score)
  }

  /**
   * Get peers above a threshold.
   */
  getPeersAbove(threshold: number): PeerId[] {
    return Array.from(this.scores.entries())
      .filter(([_, data]) => data.score >= threshold)
      .map(([peerId]) => peerId)
  }

  /**
   * Get peers below a threshold.
   */
  getPeersBelow(threshold: number): PeerId[] {
    return Array.from(this.scores.entries())
      .filter(([_, data]) => data.score < threshold)
      .map(([peerId]) => peerId)
  }

  // ============ Event Recording ============

  /**
   * Record a successful sync.
   */
  recordSyncSuccess(peerId: PeerId): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.syncSuccesses++
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)
  }

  /**
   * Record a failed sync.
   */
  recordSyncFailure(peerId: PeerId): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.syncFailures++
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)
  }

  /**
   * Record valid change received.
   */
  recordValidChange(peerId: PeerId, count: number = 1): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.validChanges += count
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)
  }

  /**
   * Record invalid signature (severe).
   */
  recordInvalidSignature(peerId: PeerId): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.invalidSignatures++
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)

    // Log security event
    logSecurityEvent({
      eventType: 'invalid_signature',
      severity: 'high',
      peerId,
      actionTaken: 'logged'
    })
  }

  /**
   * Record invalid/malformed data.
   */
  recordInvalidData(peerId: PeerId): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.invalidData++
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)
  }

  /**
   * Record rate limit violation.
   */
  recordRateLimitViolation(peerId: PeerId): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.rateLimitViolations++
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)
  }

  /**
   * Record latency observation.
   */
  recordLatency(peerId: PeerId, latencyMs: number): void {
    const metrics = this.getOrCreateMetrics(peerId)
    // Exponential moving average
    const alpha = 0.2
    metrics.avgLatency =
      metrics.avgLatency === 0 ? latencyMs : metrics.avgLatency * (1 - alpha) + latencyMs * alpha
    this.recalculateScore(peerId)
  }

  /**
   * Record IP address seen for peer.
   */
  recordIP(peerId: PeerId, ip: string): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.ips.add(ip)
    this.recalculateScore(peerId)
  }

  // ============ Score Calculation ============

  private recalculateScore(peerId: PeerId): void {
    const data = this.scores.get(peerId)
    if (!data) return

    const m = data.metrics
    const w = this.weights

    let score = 0

    // Positive factors
    score += m.syncSuccesses * w.syncSuccess
    score += m.validChanges * w.validChange
    score += Math.min(10, (m.uptime / 60_000) * w.uptime) // Cap uptime bonus
    if (m.avgLatency > 0 && m.avgLatency < 100) {
      score += w.lowLatency
    }

    // Negative factors
    score += m.syncFailures * w.syncFailure
    score += m.invalidSignatures * w.invalidSignature
    score += m.invalidData * w.invalidData
    score += m.rateLimitViolations * w.rateLimitViolation
    score += Math.max(0, m.ips.size - 1) * w.ipColocation // Multiple IPs is suspicious

    // Clamp to range
    data.score = Math.max(-100, Math.min(100, score))
    data.lastUpdated = new Date()

    // Check thresholds
    this.checkThresholds(peerId, data.score)
  }

  private checkThresholds(peerId: PeerId, score: number): void {
    if (score < this.thresholds.disconnect) {
      logSecurityEvent({
        eventType: 'peer_score_drop',
        severity: 'high',
        peerId,
        details: { score, threshold: 'disconnect' },
        actionTaken: 'blocked'
      })
      // Emit event for auto-blocker to handle
      this.emit('score-below-disconnect', peerId, score)
    } else if (score < this.thresholds.throttle) {
      logSecurityEvent({
        eventType: 'peer_score_drop',
        severity: 'medium',
        peerId,
        details: { score, threshold: 'throttle' },
        actionTaken: 'throttled'
      })
      this.emit('score-below-throttle', peerId, score)
    } else if (score < this.thresholds.warn) {
      this.emit('score-below-warn', peerId, score)
    }
  }

  private decayScores(factor: number): void {
    for (const data of this.scores.values()) {
      // Decay score towards 0
      if (data.score > 0) {
        data.score *= factor
      } else if (data.score < 0) {
        data.score = data.score * factor
      }
    }
  }

  private getOrCreateMetrics(peerId: PeerId): PeerMetrics {
    let data = this.scores.get(peerId)
    if (!data) {
      const now = Date.now()
      data = {
        peerId,
        score: 0,
        metrics: {
          syncSuccesses: 0,
          validChanges: 0,
          uptime: 0,
          avgLatency: 0,
          syncFailures: 0,
          invalidSignatures: 0,
          invalidData: 0,
          rateLimitViolations: 0,
          rejectedConnections: 0,
          firstSeen: now,
          lastSeen: now,
          ips: new Set()
        },
        lastUpdated: new Date()
      }
      this.scores.set(peerId, data)
    }
    return data.metrics
  }

  // Simple event emitter (would use proper EventEmitter in real impl)
  private listeners = new Map<string, Function[]>()

  on(event: string, fn: Function): void {
    const list = this.listeners.get(event) ?? []
    list.push(fn)
    this.listeners.set(event, list)
  }

  private emit(event: string, ...args: any[]): void {
    const list = this.listeners.get(event) ?? []
    for (const fn of list) {
      fn(...args)
    }
  }
}
```

## Usage Example

```typescript
import { PeerScorer } from '@xnetjs/network/security'

const scorer = new PeerScorer({
  thresholds: {
    disconnect: -50,
    throttle: -20
  }
})

// Record events during sync
async function handleSyncResponse(peerId: string, response: SyncResponse) {
  if (response.success) {
    scorer.recordSyncSuccess(peerId)
    scorer.recordValidChange(peerId, response.changes.length)
  } else {
    scorer.recordSyncFailure(peerId)
  }
}

// Use scores for decisions
function shouldPrioritizePeer(peerId: string): boolean {
  return scorer.getScore(peerId) > 50
}

// React to threshold events
scorer.on('score-below-disconnect', (peerId, score) => {
  autoBlocker.blockPeer(peerId, { reason: 'low_score', score })
})
```

## Tests

See `11-auto-blocking.md` for integration tests that use peer scoring.

## Checklist

- [ ] Define PeerMetrics interface
- [ ] Define ScoreWeights and ScoreThresholds
- [ ] Implement PeerScorer class
- [ ] Implement score calculation
- [ ] Implement score decay
- [ ] Implement threshold checking
- [ ] Add event emission for threshold crossing
- [ ] Integrate with sync protocol
- [ ] Write tests
- [ ] Tests pass

---

[Back to README](./README.md) | [Previous: Security Logging](./09-security-logging.md) | [Next: Auto Blocking](./11-auto-blocking.md)
