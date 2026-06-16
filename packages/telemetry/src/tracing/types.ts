/**
 * Span / trace model for full-stack performance tracing (exploration 0190).
 *
 * A `Trace` is a single self-measured operation — one `useQuery` or `useMutate`
 * call — broken into `Span`s for each stage of the read or write path (worker
 * hop, SQLite, decrypt, auth, flatten, render, queue, encrypt, persist, sync).
 *
 * Exact timings live only on-device (the devtools waterfall). The egress adapter
 * folds a completed trace into the existing bucketed `PerformanceMetric` pipeline
 * before anything leaves the device, so the hub only ever sees coarse buckets.
 */

/** What kind of root operation a trace measures. Kept low-cardinality for egress. */
export type TraceRootKind = 'query' | 'mutate' | 'sync' | 'other'

/** Per-span context. Exact on-device; bucketed on egress. */
export interface SpanAttributes {
  /** Rows produced by storage before auth/decrypt filtering. */
  candidateRows?: number
  /** Rows returned to the caller after pagination. */
  returnedRows?: number
  /** Whether the underlying SQL did a full table scan. */
  fullTableScan?: boolean
  /** Index the query used, if any. */
  usedIndex?: string
  /** Payload / snapshot size in bytes. */
  bytes?: number
  /** Which thread the span executed on. */
  thread?: 'main' | 'worker'
  /** Free-form low-cardinality tags (never user content). */
  [key: string]: string | number | boolean | undefined
}

/** A single timed stage within a trace. */
export interface Span {
  spanId: string
  parentSpanId?: string
  /** Static stage name, e.g. `data.sqlite.exec`. Never user content. */
  name: string
  /** Start time relative to the trace start, in milliseconds. */
  startOffsetMs: number
  /** Duration in milliseconds. */
  durationMs: number
  attributes?: SpanAttributes
}

/** Input shape for adding a span with an explicit offset (e.g. worker spans). */
export interface SpanInput {
  name: string
  startOffsetMs: number
  durationMs: number
  parentSpanId?: string
  attributes?: SpanAttributes
}

/** A completed (or in-progress) trace of one operation. */
export interface Trace {
  traceId: string
  /** Low-cardinality kind used for hub egress metric names. */
  rootKind: TraceRootKind
  /** Human label for the devtools view, e.g. `query:Task.list`. Local only. */
  rootName: string
  /** Wall-clock start (ms since epoch). Local only — never egressed. */
  startedAt: number
  /** Total wall-clock duration once ended. */
  totalMs: number
  spans: Span[]
  /** True once `end()` has run. */
  ended: boolean
  /** Chosen for egress (head-sampled or kept-because-slow). */
  sampled: boolean
}
