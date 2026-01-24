/**
 * Telemetry instrumentation
 *
 * Wraps TelemetryCollector methods and ConsentManager events to emit
 * typed DevTools events for the TelemetryPanel.
 *
 * Pattern: intercept collector.report* methods and forward to DevToolsEventBus.
 * ConsentManager uses its native .on() for tier changes.
 */

import type { DevToolsEventBus } from '../core/event-bus'
import type { PeerScoreSnapshot } from '../core/types'

/** Minimal TelemetryCollector interface (avoids hard dep on @xnet/telemetry) */
interface TelemetryCollectorLike {
  report: (schemaId: string, data: Record<string, unknown>, options?: unknown) => string | null
  reportCrash: (error: Error, context?: Record<string, unknown>) => string | null
  reportUsage: (metricName: string, value: number, period?: string) => string | null
  reportPerformance: (
    metricName: string,
    durationMs: number,
    codeNamespace?: string
  ) => string | null
  reportSecurityEvent: (
    eventName: string,
    eventSeverity: string,
    details?: Record<string, unknown>
  ) => string | null
}

/** Minimal ConsentManager interface */
interface ConsentManagerLike {
  tier: string
  on: (event: string, listener: (...args: unknown[]) => void) => unknown
  off: (event: string, listener: (...args: unknown[]) => void) => unknown
}

/** Minimal PeerScorer interface */
interface PeerScorerLike {
  getAllScores: () => Array<{
    peerId: string
    score: number
    metrics: {
      syncSuccesses: number
      syncFailures: number
      invalidSignatures: number
      rateLimitViolations: number
      lastSeen: number
    }
  }>
}

/** Options for telemetry instrumentation */
export interface InstrumentTelemetryOptions {
  /** PeerScorer instance for peer reputation display */
  peerScorer?: PeerScorerLike
  /** Poll interval for peer scores in ms (default: 3000) */
  peerScorePollMs?: number
}

const DEFAULT_PEER_SCORE_POLL_MS = 3000

/**
 * Instrument telemetry collector and consent manager to emit DevTools events.
 *
 * @returns Cleanup function that restores original methods and removes listeners
 */
export function instrumentTelemetry(
  collector: TelemetryCollectorLike,
  consent: ConsentManagerLike,
  bus: DevToolsEventBus,
  options?: InstrumentTelemetryOptions
): () => void {
  // Store original methods for restoration
  const origReportCrash = collector.reportCrash.bind(collector)
  const origReportUsage = collector.reportUsage.bind(collector)
  const origReportPerformance = collector.reportPerformance.bind(collector)
  const origReportSecurityEvent = collector.reportSecurityEvent.bind(collector)

  // Wrap reportCrash - always emit to devtools regardless of consent result
  collector.reportCrash = (error: Error, context?: Record<string, unknown>): string | null => {
    bus.emit({
      type: 'telemetry:crash',
      errorType: error.name,
      errorMessage: error.message,
      component: (context as Record<string, unknown> | undefined)?.codeNamespace as
        | string
        | undefined
    })
    return origReportCrash(error, context)
  }

  // Wrap reportUsage
  collector.reportUsage = (metricName: string, value: number, period?: string): string | null => {
    bus.emit({
      type: 'telemetry:usage',
      metric: metricName,
      bucket: String(value),
      period: period ?? 'daily'
    })
    return origReportUsage(metricName, value, period)
  }

  // Wrap reportPerformance
  collector.reportPerformance = (
    metricName: string,
    durationMs: number,
    codeNamespace?: string
  ): string | null => {
    bus.emit({
      type: 'telemetry:performance',
      metric: metricName,
      bucket: categorizeDuration(durationMs)
    })
    return origReportPerformance(metricName, durationMs, codeNamespace)
  }

  // Wrap reportSecurityEvent
  collector.reportSecurityEvent = (
    eventName: string,
    eventSeverity: string,
    details?: Record<string, unknown>
  ): string | null => {
    bus.emit({
      type: 'telemetry:security',
      eventType: eventName,
      severity: eventSeverity,
      actionTaken: (details?.actionTaken as string) ?? 'logged'
    })
    return origReportSecurityEvent(eventName, eventSeverity, details)
  }

  // Subscribe to consent tier changes
  const tierChangedListener = (oldTier: unknown, newTier: unknown) => {
    bus.emit({
      type: 'telemetry:consent-change',
      tier: String(newTier),
      previousTier: String(oldTier)
    })
  }
  consent.on('tier-changed', tierChangedListener)

  // Emit initial consent state
  bus.emit({
    type: 'telemetry:consent-change',
    tier: consent.tier,
    previousTier: consent.tier
  })

  // Peer score polling
  let peerScoreInterval: ReturnType<typeof setInterval> | null = null
  const peerScorer = options?.peerScorer
  if (peerScorer) {
    const pollMs = options?.peerScorePollMs ?? DEFAULT_PEER_SCORE_POLL_MS

    const emitPeerScores = () => {
      const allScores = peerScorer.getAllScores()
      const scores: PeerScoreSnapshot[] = allScores.map((s) => ({
        peerId: s.peerId,
        score: s.score,
        syncSuccesses: s.metrics.syncSuccesses,
        syncFailures: s.metrics.syncFailures,
        invalidSignatures: s.metrics.invalidSignatures,
        rateLimitViolations: s.metrics.rateLimitViolations,
        lastSeen: s.metrics.lastSeen
      }))
      bus.emit({ type: 'telemetry:peer-scores', scores })
    }

    // Emit initial scores
    emitPeerScores()
    peerScoreInterval = setInterval(emitPeerScores, pollMs)
  }

  // Return cleanup
  return () => {
    collector.reportCrash = origReportCrash
    collector.reportUsage = origReportUsage
    collector.reportPerformance = origReportPerformance
    collector.reportSecurityEvent = origReportSecurityEvent
    consent.off('tier-changed', tierChangedListener)
    if (peerScoreInterval) clearInterval(peerScoreInterval)
  }
}

/**
 * Categorize a duration in ms into a readable bucket label
 */
function categorizeDuration(ms: number): string {
  if (ms < 10) return '<10ms'
  if (ms < 50) return '10-50ms'
  if (ms < 100) return '50-100ms'
  if (ms < 250) return '100-250ms'
  if (ms < 500) return '250-500ms'
  if (ms < 1000) return '500ms-1s'
  if (ms < 5000) return '1-5s'
  return '>5s'
}
