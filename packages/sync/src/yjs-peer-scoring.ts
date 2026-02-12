/**
 * Yjs Peer Scoring - Track Yjs-specific misbehavior and auto-block repeat offenders
 *
 * Extends the concept of peer scoring with Yjs-specific metrics.
 * Peers that repeatedly send invalid signatures, oversized updates, or exceed
 * rate limits accumulate negative scores and are eventually auto-blocked.
 */

/**
 * Yjs-specific peer metrics for tracking violations.
 */
export interface YjsPeerMetrics {
  /** Invalid Ed25519 signatures on Yjs envelopes */
  invalidSignatures: number
  /** Updates exceeding size limit */
  oversizedUpdates: number
  /** Updates exceeding rate limit */
  rateExceeded: number
  /** Unsigned updates when signing required */
  unsignedUpdates: number
  /** Updates from unattested clientIDs (Tier 3) */
  unattestedClientIds: number
  /** Updates rejected by authorization policy */
  unauthorizedUpdates: number
  /** Total valid updates (for ratio calculations) */
  validUpdates: number
  /** First seen timestamp */
  firstSeen: number
  /** Last violation timestamp */
  lastViolation: number
}

/**
 * Violation types for peer scoring.
 */
export type YjsViolationType =
  | 'invalidSignature'
  | 'oversizedUpdate'
  | 'rateExceeded'
  | 'unsignedUpdate'
  | 'unattestedClientId'
  | 'unauthorizedUpdate'

/**
 * Action to take based on peer score.
 */
export type PeerAction = 'allow' | 'warn' | 'throttle' | 'block'

/**
 * Optional telemetry collector interface for sync operations.
 * Compatible with @xnet/telemetry TelemetryCollector.
 */
export interface SyncTelemetry {
  reportPerformance(metricName: string, durationMs: number, codeNamespace?: string): void
  reportUsage(metricName: string, value: number): void
  reportCrash(error: Error, context?: { codeNamespace?: string }): void
  reportSecurityEvent(eventName: string, severity: 'low' | 'medium' | 'high' | 'critical'): void
}

/**
 * Configuration for Yjs peer scoring.
 */
export interface YjsScoringConfig {
  /** Points deducted per violation type */
  penalties: {
    invalidSignature: number
    oversizedUpdate: number
    rateExceeded: number
    unsignedUpdate: number
    unattestedClientId: number
    unauthorizedUpdate: number
  }
  /** Score thresholds */
  thresholds: {
    warn: number
    throttle: number
    block: number
  }
  /** Score recovery rate (points per tick of good behavior) */
  recoveryRate: number
  /** Immediate block after N invalid signatures */
  instantBlockAfter: number
  /**
   * Optional telemetry collector for security events.
   * When provided, YjsPeerScorer will report:
   * - Security events for violations (invalid signatures, rate limits, etc.)
   * - Usage metrics for peer actions (block, throttle, warn)
   * - Performance metrics for score calculations
   */
  telemetry?: SyncTelemetry
}

/**
 * Default scoring configuration.
 */
export const DEFAULT_YJS_SCORING_CONFIG: YjsScoringConfig = {
  penalties: {
    invalidSignature: 30,
    oversizedUpdate: 10,
    rateExceeded: 5,
    unsignedUpdate: 20,
    unattestedClientId: 15,
    unauthorizedUpdate: 20
  },
  thresholds: {
    warn: 50,
    throttle: 30,
    block: 10
  },
  recoveryRate: 1,
  instantBlockAfter: 3
}

/**
 * Peer scorer for Yjs-specific violations.
 *
 * Peers start at score 100. Violations deduct points based on severity.
 * Score thresholds trigger different actions (warn, throttle, block).
 *
 * @example
 * ```typescript
 * const scorer = new YjsPeerScorer()
 *
 * // On violation:
 * const action = scorer.penalize(peerId, 'invalidSignature')
 * if (action === 'block') {
 *   ws.close(4403, 'Blocked due to repeated violations')
 * }
 *
 * // On valid update:
 * scorer.recordValid(peerId)
 *
 * // Periodic recovery:
 * setInterval(() => scorer.tick(), 60_000)
 * ```
 */
export class YjsPeerScorer {
  private metrics = new Map<string, YjsPeerMetrics>()
  private scores = new Map<string, number>()
  readonly config: YjsScoringConfig
  private telemetry?: SyncTelemetry

  constructor(config?: Partial<YjsScoringConfig>) {
    this.config = {
      penalties: { ...DEFAULT_YJS_SCORING_CONFIG.penalties, ...config?.penalties },
      thresholds: { ...DEFAULT_YJS_SCORING_CONFIG.thresholds, ...config?.thresholds },
      recoveryRate: config?.recoveryRate ?? DEFAULT_YJS_SCORING_CONFIG.recoveryRate,
      instantBlockAfter: config?.instantBlockAfter ?? DEFAULT_YJS_SCORING_CONFIG.instantBlockAfter,
      telemetry: config?.telemetry
    }
    this.telemetry = config?.telemetry
  }

  /**
   * Record a violation for a peer.
   *
   * @param peerId - Peer identifier
   * @param reason - Type of violation
   * @returns Action to take based on new score
   */
  penalize(peerId: string, reason: YjsViolationType): PeerAction {
    const metrics = this.getOrCreateMetrics(peerId)
    const penalty = this.config.penalties[reason]

    // Update violation-specific counter
    switch (reason) {
      case 'invalidSignature':
        metrics.invalidSignatures++
        this.telemetry?.reportSecurityEvent('sync.yjs.invalid_signature', 'high')
        // Instant block after N invalid signatures
        if (metrics.invalidSignatures >= this.config.instantBlockAfter) {
          this.scores.set(peerId, 0)
          this.telemetry?.reportSecurityEvent('sync.yjs.peer_auto_blocked', 'critical')
          this.telemetry?.reportUsage('sync.yjs.peer_action.block', 1)
          return 'block'
        }
        break
      case 'oversizedUpdate':
        metrics.oversizedUpdates++
        this.telemetry?.reportSecurityEvent('sync.yjs.oversized_update', 'medium')
        break
      case 'rateExceeded':
        metrics.rateExceeded++
        this.telemetry?.reportSecurityEvent('sync.yjs.rate_exceeded', 'medium')
        break
      case 'unsignedUpdate':
        metrics.unsignedUpdates++
        this.telemetry?.reportSecurityEvent('sync.yjs.unsigned_update', 'high')
        break
      case 'unattestedClientId':
        metrics.unattestedClientIds++
        this.telemetry?.reportSecurityEvent('sync.yjs.unattested_client_id', 'medium')
        break
      case 'unauthorizedUpdate':
        metrics.unauthorizedUpdates++
        this.telemetry?.reportSecurityEvent('sync.yjs.unauthorized_update', 'high')
        break
    }

    metrics.lastViolation = Date.now()

    // Apply penalty
    const currentScore = this.scores.get(peerId) ?? 100
    const newScore = Math.max(0, currentScore - penalty)
    this.scores.set(peerId, newScore)

    const action = this.getAction(newScore)

    // Report action taken
    if (action !== 'allow') {
      this.telemetry?.reportUsage(`sync.yjs.peer_action.${action}`, 1)
    }

    return action
  }

  /**
   * Record a valid update (for ratio tracking + score recovery consideration).
   */
  recordValid(peerId: string): void {
    const metrics = this.getOrCreateMetrics(peerId)
    metrics.validUpdates++
    this.telemetry?.reportUsage('sync.yjs.valid_update', 1)
  }

  /**
   * Get current score for a peer.
   * New peers start at 100.
   */
  getScore(peerId: string): number {
    return this.scores.get(peerId) ?? 100
  }

  /**
   * Get action for a given score.
   */
  getAction(score: number): PeerAction {
    if (score <= this.config.thresholds.block) return 'block'
    if (score <= this.config.thresholds.throttle) return 'throttle'
    if (score <= this.config.thresholds.warn) return 'warn'
    return 'allow'
  }

  /**
   * Get current action for a peer.
   */
  getPeerAction(peerId: string): PeerAction {
    return this.getAction(this.getScore(peerId))
  }

  /**
   * Recover scores over time (called periodically).
   * Only recovers if no recent violations.
   *
   * @param recoveryWindow - Time in ms that must pass without violations (default: 60s)
   */
  tick(recoveryWindow = 60_000): void {
    const now = Date.now()
    for (const [peerId, score] of this.scores) {
      if (score >= 100) continue

      const metrics = this.metrics.get(peerId)
      if (!metrics) continue

      // Only recover if no recent violations
      if (now - metrics.lastViolation > recoveryWindow) {
        const newScore = Math.min(100, score + this.config.recoveryRate)
        this.scores.set(peerId, newScore)
      }
    }
  }

  /**
   * Get metrics for a peer (for debugging/monitoring).
   */
  getMetrics(peerId: string): YjsPeerMetrics | undefined {
    return this.metrics.get(peerId)
  }

  /**
   * Get all peer IDs with metrics.
   */
  getAllPeerIds(): string[] {
    return Array.from(this.metrics.keys())
  }

  /**
   * Get all metrics (for monitoring endpoint).
   */
  getAllMetrics(): Map<string, YjsPeerMetrics> {
    return new Map(this.metrics)
  }

  /**
   * Remove all state for a disconnected peer.
   */
  remove(peerId: string): void {
    this.metrics.delete(peerId)
    this.scores.delete(peerId)
  }

  /**
   * Clear all state.
   */
  clear(): void {
    this.metrics.clear()
    this.scores.clear()
  }

  /**
   * Get violation ratio for a peer.
   * Returns the ratio of violations to total operations.
   */
  getViolationRatio(peerId: string): number {
    const metrics = this.metrics.get(peerId)
    if (!metrics) return 0

    const violations =
      metrics.invalidSignatures +
      metrics.oversizedUpdates +
      metrics.rateExceeded +
      metrics.unsignedUpdates +
      metrics.unattestedClientIds +
      metrics.unauthorizedUpdates

    const total = violations + metrics.validUpdates
    if (total === 0) return 0

    return violations / total
  }

  private getOrCreateMetrics(peerId: string): YjsPeerMetrics {
    let m = this.metrics.get(peerId)
    if (!m) {
      m = {
        invalidSignatures: 0,
        oversizedUpdates: 0,
        rateExceeded: 0,
        unsignedUpdates: 0,
        unattestedClientIds: 0,
        unauthorizedUpdates: 0,
        validUpdates: 0,
        firstSeen: Date.now(),
        lastViolation: 0
      }
      this.metrics.set(peerId, m)
    }
    return m
  }
}
