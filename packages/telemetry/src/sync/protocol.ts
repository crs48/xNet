/**
 * Telemetry aggregator protocol definition.
 *
 * Simple push-only protocol: clients send telemetry batches to aggregators.
 */

export const TELEMETRY_PROTOCOL = '/xnet/telemetry/1.0.0'

/** Telemetry batch message (sent to aggregator). */
export interface TelemetryBatch {
  /** Batch ID for deduplication */
  batchId: string
  /** Timestamp of batch creation */
  timestamp: number
  /** Sanitized telemetry records */
  records: TelemetryBatchRecord[]
  /** Optional app identifier for routing */
  appId?: string
}

/** A single record within a batch (stripped of local identifiers). */
export interface TelemetryBatchRecord {
  schemaId: string
  data: Record<string, unknown>
  createdAt: number
}

/** Aggregator response. */
export interface AggregatorResponse {
  accepted: boolean
  processed: number
  error?: string
}
