/**
 * TelemetryCollector - consent-gated telemetry recording.
 *
 * Collects telemetry events locally, applies scrubbing and bucketing,
 * and stores them using the schema system.
 */

import type { ConsentManager } from '../consent/manager'
import type { TelemetryTier } from '../consent/types'
import { scrubTelemetryData, type ScrubOptions, DEFAULT_SCRUB_OPTIONS } from './scrubbing'
import { bucketCount, bucketLatency, bucketTimestamp } from './bucketing'
import { TelemetrySchemaIRIs } from '../schemas'

export interface TelemetryCollectorOptions {
  /** ConsentManager instance */
  consent: ConsentManager
  /** Scrubbing options */
  scrubOptions?: Partial<ScrubOptions>
  /** Default minimum tier for generic reports */
  defaultMinTier?: TelemetryTier
}

export interface ReportOptions {
  /** Minimum consent tier required */
  minTier?: TelemetryTier
  /** Whether to scrub PII (default: use consent.autoScrub) */
  scrub?: boolean
  /** Additional scrub patterns */
  scrubPatterns?: RegExp[]
}

/** Stored telemetry record */
export interface TelemetryRecord {
  id: string
  schemaId: string
  data: Record<string, unknown>
  createdAt: number
  status: 'local' | 'pending' | 'shared' | 'dismissed'
}

export class TelemetryCollector {
  private consent: ConsentManager
  private scrubOptions: ScrubOptions
  private defaultMinTier: TelemetryTier
  private records: TelemetryRecord[] = []
  private idCounter = 0

  constructor(options: TelemetryCollectorOptions) {
    this.consent = options.consent
    this.scrubOptions = { ...DEFAULT_SCRUB_OPTIONS, ...options.scrubOptions }
    this.defaultMinTier = options.defaultMinTier ?? 'local'
  }

  /**
   * Report a generic telemetry event.
   * Returns the record ID if stored, null if blocked by consent.
   */
  report<T extends Record<string, unknown>>(
    schemaId: string,
    data: T,
    options?: ReportOptions
  ): string | null {
    const minTier = options?.minTier ?? this.defaultMinTier
    if (!this.consent.allowsTier(minTier)) return null
    if (!this.consent.allowsSchema(schemaId)) return null

    let processed: Record<string, unknown> = { ...data }
    const shouldScrub = options?.scrub ?? this.consent.current.autoScrub
    if (shouldScrub) {
      const scrubOpts = options?.scrubPatterns
        ? { ...this.scrubOptions, scrubCustom: options.scrubPatterns }
        : this.scrubOptions
      processed = scrubTelemetryData(processed, scrubOpts)
    }

    const id = `tel_${++this.idCounter}_${Date.now()}`
    this.records.push({
      id,
      schemaId,
      data: processed,
      createdAt: Date.now(),
      status: 'local'
    })
    return id
  }

  /**
   * Report a crash/error.
   * Requires 'crashes' tier.
   */
  reportCrash(
    error: Error,
    context?: {
      codeNamespace?: string
      codeFunction?: string
      userAction?: string
      serviceVersion?: string
      osType?: string
    }
  ): string | null {
    return this.report(
      TelemetrySchemaIRIs.CrashReport,
      {
        exceptionType: error.name,
        exceptionMessage: error.message,
        exceptionStacktrace: error.stack,
        occurredAt: bucketTimestamp(new Date(), 'hour').getTime(),
        status: 'local',
        ...context
      },
      { minTier: 'crashes' }
    )
  }

  /**
   * Report a usage metric.
   * Requires 'anonymous' tier. Values are automatically bucketed.
   */
  reportUsage(
    metricName: string,
    value: number,
    period: 'daily' | 'weekly' | 'monthly' = 'daily'
  ): string | null {
    return this.report(
      TelemetrySchemaIRIs.UsageMetric,
      {
        metricName,
        metricBucket: bucketCount(value),
        period,
        measuredAt: bucketTimestamp(new Date(), 'day').getTime(),
        status: 'local'
      },
      { minTier: 'anonymous' }
    )
  }

  /**
   * Report a performance metric.
   * Requires 'anonymous' tier. Duration is bucketed.
   */
  reportPerformance(metricName: string, durationMs: number, codeNamespace?: string): string | null {
    return this.report(
      TelemetrySchemaIRIs.PerformanceMetric,
      {
        metricName,
        durationBucket: bucketLatency(durationMs),
        codeNamespace,
        measuredAt: bucketTimestamp(new Date(), 'hour').getTime(),
        status: 'local'
      },
      { minTier: 'anonymous' }
    )
  }

  /**
   * Report a security event.
   * Only requires 'local' tier (security events are important even without sharing).
   */
  reportSecurityEvent(
    eventName: string,
    eventSeverity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, unknown> = {}
  ): string | null {
    return this.report(
      TelemetrySchemaIRIs.SecurityEvent,
      {
        eventName,
        eventSeverity,
        eventDetails: JSON.stringify(details).slice(0, 200),
        occurredAt: bucketTimestamp(new Date(), 'minute').getTime(),
        status: 'local'
      },
      { minTier: 'local' }
    )
  }

  /** Get locally stored telemetry records */
  getLocalTelemetry(options?: {
    schemaId?: string
    status?: TelemetryRecord['status']
    limit?: number
  }): TelemetryRecord[] {
    let results = this.records
    if (options?.schemaId) {
      results = results.filter((r) => r.schemaId === options.schemaId)
    }
    if (options?.status) {
      results = results.filter((r) => r.status === options.status)
    }
    if (options?.limit) {
      results = results.slice(0, options.limit)
    }
    return results
  }

  /** Delete specific telemetry records */
  deleteTelemetry(nodeIds: string | string[]): void {
    const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds]
    const idSet = new Set(ids)
    this.records = this.records.filter((r) => !idSet.has(r.id))
  }

  /** Delete all telemetry records */
  deleteAllTelemetry(): void {
    this.records = []
  }

  /** Mark records as approved for sharing */
  approveForSharing(nodeIds: string | string[]): void {
    const ids = Array.isArray(nodeIds) ? new Set(nodeIds) : new Set([nodeIds])
    for (const record of this.records) {
      if (ids.has(record.id)) {
        record.status = 'pending'
      }
    }
  }

  /** Dismiss records (won't be shared) */
  dismiss(nodeIds: string | string[]): void {
    const ids = Array.isArray(nodeIds) ? new Set(nodeIds) : new Set([nodeIds])
    for (const record of this.records) {
      if (ids.has(record.id)) {
        record.status = 'dismissed'
      }
    }
  }

  /** Get count of records by status */
  getStats(): { local: number; pending: number; shared: number; dismissed: number; total: number } {
    const stats = { local: 0, pending: 0, shared: 0, dismissed: 0, total: this.records.length }
    for (const r of this.records) {
      stats[r.status]++
    }
    return stats
  }
}
