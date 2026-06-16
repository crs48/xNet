/**
 * Egress adapter — folds a completed, exact-timing `Trace` into the existing
 * bucketed telemetry pipeline (exploration 0190).
 *
 * This is the privacy boundary. Exact milliseconds and exact row counts never
 * leave the device: they are converted to coarse buckets by the collector's
 * `reportPerformance` / `reportUsage` (which apply `bucketLatency` / `bucketCount`)
 * before anything is queued for the hub. The stage names are static constants,
 * and the per-trace `traceId` / `spanId` are opaque session-scoped ids — enough
 * to reconstruct a representative waterfall on the hub without revealing content.
 */

import type { Span, Trace } from './types'

/** Duck-typed sink — satisfied by `TelemetryCollector`. Keeps egress decoupled. */
export interface BucketReporter {
  reportPerformance(metricName: string, durationMs: number, codeNamespace?: string): unknown
  reportUsage(metricName: string, value: number): unknown
}

export interface TraceEgressOptions {
  /** Code namespace stamped on emitted performance metrics. Default 'tracing'. */
  codeNamespace?: string
  /** Also emit per-span row-count usage metrics. Default true. */
  emitRowCounts?: boolean
}

/**
 * Emit one bucketed performance metric per span plus a total for the trace.
 * Safe to call on any trace; the collector's consent gate decides what is kept.
 */
export function emitTraceAsBuckets(
  trace: Trace,
  reporter: BucketReporter,
  options: TraceEgressOptions = {}
): void {
  const ns = options.codeNamespace ?? 'tracing'
  const emitRows = options.emitRowCounts ?? true

  reporter.reportPerformance(`${trace.rootKind}.total`, trace.totalMs, ns)

  for (const span of trace.spans) {
    reporter.reportPerformance(span.name, span.durationMs, ns)
    if (emitRows) emitSpanRowCount(span, reporter)
  }
}

function emitSpanRowCount(span: Span, reporter: BucketReporter): void {
  const rows = span.attributes?.returnedRows
  if (typeof rows === 'number') reporter.reportUsage(`${span.name}.rows`, rows)
}
