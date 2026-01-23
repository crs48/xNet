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

const SCHEMA_IRI_TO_TYPE: Record<string, string> = {
  'xnet://xnet.dev/telemetry/CrashReport': 'crash',
  'xnet://xnet.dev/telemetry/UsageMetric': 'usage',
  'xnet://xnet.dev/telemetry/SecurityEvent': 'security',
  'xnet://xnet.dev/telemetry/PerformanceMetric': 'performance'
}

/**
 * Instrument telemetry collector and consent manager to emit DevTools events.
 *
 * @returns Cleanup function that restores original methods and removes listeners
 */
export function instrumentTelemetry(
  collector: TelemetryCollectorLike,
  consent: ConsentManagerLike,
  bus: DevToolsEventBus
): () => void {
  // Store original methods for restoration
  const origReportCrash = collector.reportCrash.bind(collector)
  const origReportUsage = collector.reportUsage.bind(collector)
  const origReportPerformance = collector.reportPerformance.bind(collector)
  const origReportSecurityEvent = collector.reportSecurityEvent.bind(collector)

  // Wrap reportCrash
  collector.reportCrash = (error: Error, context?: Record<string, unknown>): string | null => {
    const result = origReportCrash(error, context)
    if (result !== null) {
      bus.emit({
        type: 'telemetry:crash',
        errorType: error.name,
        errorMessage: error.message,
        component: (context as Record<string, unknown> | undefined)?.codeNamespace as
          | string
          | undefined
      })
    }
    return result
  }

  // Wrap reportUsage
  collector.reportUsage = (metricName: string, value: number, period?: string): string | null => {
    const result = origReportUsage(metricName, value, period)
    if (result !== null) {
      bus.emit({
        type: 'telemetry:usage',
        metric: metricName,
        bucket: String(value),
        period: period ?? 'daily'
      })
    }
    return result
  }

  // Wrap reportPerformance
  collector.reportPerformance = (
    metricName: string,
    durationMs: number,
    codeNamespace?: string
  ): string | null => {
    const result = origReportPerformance(metricName, durationMs, codeNamespace)
    if (result !== null) {
      bus.emit({
        type: 'telemetry:performance',
        metric: metricName,
        bucket: categorizeDuration(durationMs)
      })
    }
    return result
  }

  // Wrap reportSecurityEvent
  collector.reportSecurityEvent = (
    eventName: string,
    eventSeverity: string,
    details?: Record<string, unknown>
  ): string | null => {
    const result = origReportSecurityEvent(eventName, eventSeverity, details)
    if (result !== null) {
      bus.emit({
        type: 'telemetry:security',
        eventType: eventName,
        severity: eventSeverity,
        actionTaken: (details?.actionTaken as string) ?? 'logged'
      })
    }
    return result
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

  // Return cleanup
  return () => {
    collector.reportCrash = origReportCrash
    collector.reportUsage = origReportUsage
    collector.reportPerformance = origReportPerformance
    collector.reportSecurityEvent = origReportSecurityEvent
    consent.off('tier-changed', tierChangedListener)
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
