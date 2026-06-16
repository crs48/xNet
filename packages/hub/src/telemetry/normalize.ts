/**
 * @xnetjs/hub - Telemetry ingest normalization (exploration 0187).
 *
 * Pure helpers that turn an incoming, client-shaped telemetry record into a
 * flat, OTel-aligned row for the hub telemetry store — and enforce privacy
 * server-side as defense-in-depth around the client scrubber: DIDs are hashed
 * with a salt, strings are clipped, and the payload JSON is bounded.
 */

import { createHash } from 'node:crypto'

/** A flat telemetry row ready to insert into telemetry_events. */
export interface TelemetryEventInput {
  /** Event timestamp (client/server ms; already bucketed by the collector). */
  ts: number
  /** Where the event came from. */
  producer: 'client' | 'hub' | 'federation'
  /** sha256(did + salt) base64url, or null when anonymous / unauthenticated. */
  didHash: string | null
  /** Source telemetry schema IRI. */
  schemaId: string
  /** Coarse class derived from the schema. */
  kind: TelemetryKind
  /** Metric / event name (metricName, eventName, exceptionType). */
  name: string | null
  /** Severity for security/log events. */
  severity: string | null
  /** Pre-bucketed value label (metricBucket / durationBucket). */
  valueBucket: string | null
  serviceName: string | null
  serviceVersion: string | null
  osType: string | null
  traceId: string | null
  spanId: string | null
  /** Scrubbed + clipped payload JSON, or null. */
  attributes: string | null
}

export type TelemetryKind = 'crash' | 'usage' | 'performance' | 'security' | 'event'

/** Map a telemetry schema IRI to its coarse kind. */
export function classifyKind(schemaId: string): TelemetryKind {
  if (schemaId.includes('CrashReport')) return 'crash'
  if (schemaId.includes('UsageMetric')) return 'usage'
  if (schemaId.includes('PerformanceMetric')) return 'performance'
  if (schemaId.includes('SecurityEvent')) return 'security'
  return 'event'
}

/** Clip a value to a string of at most `max` chars, or null if absent. */
export function clip(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null
  const str = typeof value === 'string' ? value : String(value)
  return str.length > max ? str.slice(0, max) : str
}

/** Serialize an object to bounded JSON (defense-in-depth payload clip). */
export function clipJson(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null
  let json: string
  try {
    json = JSON.stringify(value)
  } catch {
    return null
  }
  if (!json || json === '{}' || json === 'null') return null
  return json.length > max ? json.slice(0, max) : json
}

/** Hash a DID with a salt so the dashboard never sees a raw identity. */
export function hashDid(did: string, salt: string): string {
  return createHash('sha256').update(`${did}:${salt}`).digest('base64url')
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

export interface NormalizeOptions {
  /** Pre-computed DID hash for the authenticated sender (null = anonymous). */
  didHash: string | null
  producer?: TelemetryEventInput['producer']
  /** Max length for the attributes JSON blob. Default 2000. */
  maxAttributesLen?: number
  now: number
}

/**
 * Normalize one incoming batch record into a storable row. The record shape is
 * `{ schemaId, data, createdAt }` (the sanitized TelemetryBatchRecord the client
 * sends). Returns null when the record is unusable (missing schema).
 */
export function normalizeRecord(
  record: { schemaId?: unknown; data?: unknown; createdAt?: unknown },
  opts: NormalizeOptions
): TelemetryEventInput | null {
  const schemaId = clip(record.schemaId, 256)
  if (!schemaId) return null

  const data = (record.data && typeof record.data === 'object' ? record.data : {}) as Record<
    string,
    unknown
  >
  const ts = Number(record.createdAt)
  const kind = classifyKind(schemaId)

  return {
    ts: Number.isFinite(ts) ? ts : opts.now,
    producer: opts.producer ?? 'client',
    didHash: opts.didHash,
    schemaId,
    kind,
    name: clip(data.metricName ?? data.eventName ?? data.exceptionType, 128),
    severity: clip(data.eventSeverity ?? data.severity, 16),
    valueBucket: clip(data.metricBucket ?? data.durationBucket, 32),
    serviceName: clip(data.serviceName, 128),
    serviceVersion: clip(data.serviceVersion, 64),
    osType: clip(data.osType, 32),
    traceId: clip(str(data.traceId), 64),
    spanId: clip(str(data.spanId), 64),
    attributes: clipJson(data, opts.maxAttributesLen ?? 2000)
  }
}
