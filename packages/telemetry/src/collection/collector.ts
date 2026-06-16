/**
 * TelemetryCollector - consent-gated telemetry recording.
 *
 * Collects telemetry events locally, applies scrubbing and bucketing,
 * and stores them using the schema system.
 */

import type { TelemetryBufferStore } from './persistence'
import type { ConsentManager } from '../consent/manager'
import type { TelemetryTier } from '../consent/types'
import { TelemetrySchemaIRIs } from '../schemas'
import { bucketCount, bucketLatency, bucketTimestamp } from './bucketing'
import { scrubTelemetryData, type ScrubOptions, DEFAULT_SCRUB_OPTIONS } from './scrubbing'

export interface TelemetryCollectorOptions {
  /** ConsentManager instance */
  consent: ConsentManager
  /** Scrubbing options */
  scrubOptions?: Partial<ScrubOptions>
  /** Default minimum tier for generic reports */
  defaultMinTier?: TelemetryTier
  /**
   * Optional durable buffer. When supplied, every collected record is mirrored
   * to it and status changes are written through, so un-synced records survive
   * a reload (exploration 0187). The in-memory list stays the live working set;
   * the buffer is the durability layer.
   */
  buffer?: TelemetryBufferStore
  /**
   * How long to keep terminal (shared/dismissed) records in the buffer before
   * pruning. Default: 7 days.
   */
  bufferKeepMs?: number
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
  private buffer?: TelemetryBufferStore
  private bufferKeepMs: number

  constructor(options: TelemetryCollectorOptions) {
    this.consent = options.consent
    this.scrubOptions = { ...DEFAULT_SCRUB_OPTIONS, ...options.scrubOptions }
    this.defaultMinTier = options.defaultMinTier ?? 'local'
    this.buffer = options.buffer
    this.bufferKeepMs = options.bufferKeepMs ?? 7 * 24 * 60 * 60 * 1000
  }

  /**
   * Load any durably-buffered records into the live working set. Call once at
   * startup (after constructing the collector with a `buffer`) so records that
   * survived a reload are picked back up and can finish syncing. Records already
   * present in memory are not duplicated. No-op when there is no buffer.
   */
  async hydrate(): Promise<void> {
    if (!this.buffer) return
    await this.buffer.prune(this.bufferKeepMs)
    const persisted = await this.buffer.all()
    const known = new Set(this.records.map((r) => r.id))
    let maxCounter = this.idCounter
    for (const record of persisted) {
      if (known.has(record.id)) continue
      this.records.push(record)
      // Keep idCounter ahead of any restored id so new ids never collide.
      const seq = parseSeq(record.id)
      if (seq > maxCounter) maxCounter = seq
    }
    this.idCounter = maxCounter
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
    const record: TelemetryRecord = {
      id,
      schemaId,
      data: processed,
      createdAt: Date.now(),
      status: 'local'
    }
    this.records.push(record)
    // Mirror to the durable buffer (fire-and-forget; the in-memory list is the
    // source of truth for the synchronous return value).
    void this.buffer?.append(record).catch(() => {})
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
    void this.buffer?.remove(ids).catch(() => {})
  }

  /** Delete all telemetry records */
  deleteAllTelemetry(): void {
    this.records = []
    void this.buffer?.clear().catch(() => {})
  }

  /** Mark records as approved for sharing */
  approveForSharing(nodeIds: string | string[]): void {
    this.setStatus(nodeIds, 'pending')
  }

  /** Dismiss records (won't be shared) */
  dismiss(nodeIds: string | string[]): void {
    this.setStatus(nodeIds, 'dismissed')
  }

  /**
   * Mark records as successfully shared. Wired to TelemetrySyncProvider's
   * `markSynced` callback so the durable buffer learns which records left the
   * device and can prune them later.
   */
  markShared(nodeIds: string | string[]): void {
    this.setStatus(nodeIds, 'shared')
  }

  private setStatus(nodeIds: string | string[], status: TelemetryRecord['status']): void {
    const ids = Array.isArray(nodeIds) ? nodeIds : [nodeIds]
    const idSet = new Set(ids)
    for (const record of this.records) {
      if (idSet.has(record.id)) record.status = status
    }
    void this.buffer?.setStatus(ids, status).catch(() => {})
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

/** Extract the numeric sequence from an id like `tel_<seq>_<ts>` (0 if absent). */
function parseSeq(id: string): number {
  const match = /^tel_(\d+)_/.exec(id)
  return match ? Number(match[1]) : 0
}
