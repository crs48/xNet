/**
 * PeerScorer - reputation-based peer scoring inspired by GossipSub v1.1.
 *
 * Tracks behavior over time. Scores influence connection priorities,
 * rate limit allocations, and automatic blocking decisions.
 */

import { logSecurityEvent } from './logging'

export interface PeerMetrics {
  syncSuccesses: number
  validChanges: number
  uptime: number
  avgLatency: number

  syncFailures: number
  invalidSignatures: number
  invalidData: number
  rateLimitViolations: number
  rejectedConnections: number

  firstSeen: number
  lastSeen: number
  ips: Set<string>
}

export interface PeerScore {
  peerId: string
  score: number // -100 to +100
  metrics: PeerMetrics
  lastUpdated: number
}

export interface ScoreThresholds {
  /** Below this: disconnect and temporary ban (default: -50) */
  disconnect: number
  /** Below this: reduce resource allocation (default: -20) */
  throttle: number
  /** Below this: increase monitoring (default: 0) */
  warn: number
  /** Above this: increase resource allocation (default: 50) */
  boost: number
}

export const DEFAULT_THRESHOLDS: ScoreThresholds = {
  disconnect: -50,
  throttle: -20,
  warn: 0,
  boost: 50
}

export interface ScoreWeights {
  syncSuccess: number
  validChange: number
  uptime: number
  lowLatency: number

  syncFailure: number
  invalidSignature: number
  invalidData: number
  rateLimitViolation: number
  ipColocation: number
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

type ScorerEventType = 'score-below-disconnect' | 'score-below-throttle' | 'score-below-warn'
type ScorerListener = (peerId: string, score: number) => void

export class PeerScorer {
  private scores = new Map<string, PeerScore>()
  private weights: ScoreWeights
  private thresholds: ScoreThresholds
  private decayTimer: ReturnType<typeof setInterval> | null = null
  private listeners = new Map<ScorerEventType, ScorerListener[]>()

  constructor(
    options: {
      weights?: Partial<ScoreWeights>
      thresholds?: Partial<ScoreThresholds>
      /** Score decay interval in ms (default: 60000) */
      decayIntervalMs?: number
      /** Score decay factor per interval (default: 0.99) */
      decayFactor?: number
    } = {}
  ) {
    this.weights = { ...DEFAULT_WEIGHTS, ...options.weights }
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds }

    const interval = options.decayIntervalMs ?? 60_000
    const decay = options.decayFactor ?? 0.99

    this.decayTimer = setInterval(() => this.decayScores(decay), interval)
  }

  destroy(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer)
      this.decayTimer = null
    }
  }

  // ============ Score Access ============

  getScore(peerId: string): number {
    return this.scores.get(peerId)?.score ?? 0
  }

  getScoreData(peerId: string): PeerScore | null {
    return this.scores.get(peerId) ?? null
  }

  getAllScores(): PeerScore[] {
    return Array.from(this.scores.values()).sort((a, b) => b.score - a.score)
  }

  getPeersAbove(threshold: number): string[] {
    return Array.from(this.scores.entries())
      .filter(([, data]) => data.score >= threshold)
      .map(([peerId]) => peerId)
  }

  getPeersBelow(threshold: number): string[] {
    return Array.from(this.scores.entries())
      .filter(([, data]) => data.score < threshold)
      .map(([peerId]) => peerId)
  }

  // ============ Event Recording ============

  recordSyncSuccess(peerId: string): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.syncSuccesses++
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)
  }

  recordSyncFailure(peerId: string): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.syncFailures++
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)
  }

  recordValidChange(peerId: string, count: number = 1): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.validChanges += count
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)
  }

  recordInvalidSignature(peerId: string): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.invalidSignatures++
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)

    logSecurityEvent({
      eventType: 'invalid_signature',
      severity: 'high',
      peerId,
      actionTaken: 'logged'
    })
  }

  recordInvalidData(peerId: string): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.invalidData++
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)
  }

  recordRateLimitViolation(peerId: string): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.rateLimitViolations++
    metrics.lastSeen = Date.now()
    this.recalculateScore(peerId)
  }

  recordLatency(peerId: string, latencyMs: number): void {
    const metrics = this.getOrCreateMetrics(peerId)
    const alpha = 0.2
    metrics.avgLatency =
      metrics.avgLatency === 0 ? latencyMs : metrics.avgLatency * (1 - alpha) + latencyMs * alpha
    this.recalculateScore(peerId)
  }

  recordIP(peerId: string, ip: string): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.ips.add(ip)
    this.recalculateScore(peerId)
  }

  recordUptime(peerId: string, uptimeMs: number): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.uptime = uptimeMs
    this.recalculateScore(peerId)
  }

  // ============ Events ============

  on(event: ScorerEventType, fn: ScorerListener): void {
    const list = this.listeners.get(event) ?? []
    list.push(fn)
    this.listeners.set(event, list)
  }

  off(event: ScorerEventType, fn: ScorerListener): void {
    const list = this.listeners.get(event)
    if (list) {
      this.listeners.set(
        event,
        list.filter((f) => f !== fn)
      )
    }
  }

  // ============ Internal ============

  /** Force score recalculation (for testing). */
  forceDecay(factor: number): void {
    this.decayScores(factor)
  }

  private emit(event: ScorerEventType, peerId: string, score: number): void {
    const list = this.listeners.get(event) ?? []
    for (const fn of list) {
      try {
        fn(peerId, score)
      } catch {
        /* listener errors don't break scorer */
      }
    }
  }

  private recalculateScore(peerId: string): void {
    const data = this.scores.get(peerId)
    if (!data) return

    const m = data.metrics
    const w = this.weights

    let score = 0

    // Positive
    score += m.syncSuccesses * w.syncSuccess
    score += m.validChanges * w.validChange
    score += Math.min(10, (m.uptime / 60_000) * w.uptime)
    if (m.avgLatency > 0 && m.avgLatency < 100) score += w.lowLatency

    // Negative
    score += m.syncFailures * w.syncFailure
    score += m.invalidSignatures * w.invalidSignature
    score += m.invalidData * w.invalidData
    score += m.rateLimitViolations * w.rateLimitViolation
    score += Math.max(0, m.ips.size - 1) * w.ipColocation

    data.score = Math.max(-100, Math.min(100, score))
    data.lastUpdated = Date.now()

    this.checkThresholds(peerId, data.score)
  }

  private checkThresholds(peerId: string, score: number): void {
    if (score < this.thresholds.disconnect) {
      logSecurityEvent({
        eventType: 'peer_score_drop',
        severity: 'high',
        peerId,
        details: { score, threshold: 'disconnect' },
        actionTaken: 'blocked'
      })
      this.emit('score-below-disconnect', peerId, score)
    } else if (score < this.thresholds.throttle) {
      this.emit('score-below-throttle', peerId, score)
    } else if (score < this.thresholds.warn) {
      this.emit('score-below-warn', peerId, score)
    }
  }

  private decayScores(factor: number): void {
    for (const data of this.scores.values()) {
      data.score *= factor
    }
  }

  private getOrCreateMetrics(peerId: string): PeerMetrics {
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
        lastUpdated: now
      }
      this.scores.set(peerId, data)
    }
    return data.metrics
  }
}
