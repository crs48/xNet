/**
 * TraceCollector — a bounded, local-only ring buffer of operation traces.
 *
 * The read path runs on every keystroke, so the collector is built to be cheap:
 * - no-op fast path when disabled (returns a shared inert handle),
 * - head sampling (full span capture only for ~1-in-N traces),
 * - tail "keep-if-slow" (a non-sampled trace is kept anyway if it ran long —
 *   free, because the whole trace is already in memory before we decide),
 * - allocation-light span recording via `mark()` closures.
 *
 * Exact timings never leave the device. `onComplete` fires for sampled/slow
 * traces so the devtools waterfall and the bucketed egress adapter can consume
 * them; everything else is dropped after the ring evicts it.
 */

import type { Span, SpanAttributes, SpanInput, Trace, TraceRootKind } from './types'
import { hashToUnit } from './hash'

export interface TraceCollectorOptions {
  /** Head sampling rate in [0, 1]. Default 1 (capture everything). */
  sampleRate?: number
  /** Keep a non-sampled trace anyway if it ran at least this long (ms). Default 200. */
  slowMs?: number
  /** Ring buffer capacity. Default 200. */
  capacity?: number
  /** Master gate. When it returns false, tracing is a no-op. Default always on. */
  enabled?: () => boolean
  /** Injectable monotonic clock (ms). Defaults to performance.now / Date.now. */
  now?: () => number
  /** Called once per completed trace that is sampled or slow. */
  onComplete?: (trace: Trace) => void
}

/** Handle for an in-progress trace. Cheap to create; inert when not sampled. */
export interface TraceHandle {
  readonly traceId: string
  /** True when this trace is being fully captured (head-sampled). */
  readonly active: boolean
  /**
   * Start timing a stage. Returns a function that, when called, records the span
   * with its measured duration. The returned function yields the new span id (or
   * empty string when inert) so children can reference it as a parent.
   */
  mark(name: string, parentSpanId?: string): (attributes?: SpanAttributes) => string
  /** Record a fully-formed span with an explicit offset (e.g. worker spans). */
  addSpan(span: SpanInput): string
  /** Record several pre-formed spans at once. */
  addSpans(spans: SpanInput[]): void
  /** Finish the trace. Returns it when kept (sampled/slow), else null. */
  end(): Trace | null
}

interface ActiveTrace {
  trace: Trace
  startedPerf: number
  headSampled: boolean
  spanSeq: number
}

const INERT_END = (): string => ''

function defaultNow(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance
  return perf ? perf.now() : Date.now()
}

let traceSeq = 0

export class TraceCollector {
  private readonly sampleRate: number
  private readonly slowMs: number
  private readonly capacity: number
  private readonly enabled: () => boolean
  private readonly now: () => number
  private readonly onComplete?: (trace: Trace) => void

  private ring: Trace[] = []
  private active = new Map<string, ActiveTrace>()
  private listeners = new Set<(traces: readonly Trace[]) => void>()

  constructor(options: TraceCollectorOptions = {}) {
    this.sampleRate = clamp01(options.sampleRate ?? 1)
    this.slowMs = options.slowMs ?? 200
    this.capacity = Math.max(1, options.capacity ?? 200)
    this.enabled = options.enabled ?? (() => true)
    this.now = options.now ?? defaultNow
    this.onComplete = options.onComplete
  }

  /** Begin a trace. `rootName` is a local label; `rootKind` drives egress names. */
  startTrace(rootKind: TraceRootKind, rootName: string, traceId?: string): TraceHandle {
    if (!this.enabled()) return INERT_HANDLE
    const id = traceId ?? `t${++traceSeq}`
    const headSampled = hashToUnit(id) < this.sampleRate
    const entry: ActiveTrace = {
      trace: {
        traceId: id,
        rootKind,
        rootName,
        startedAt: Date.now(),
        totalMs: 0,
        spans: [],
        ended: false,
        sampled: headSampled
      },
      startedPerf: this.now(),
      headSampled,
      spanSeq: 0
    }
    this.active.set(id, entry)
    return this.makeHandle(entry)
  }

  /**
   * Attach spans to an already-active trace by id. Used when spans are produced
   * out-of-band — e.g. the worker reporting its internal timings back to the main
   * thread after the RPC returns. No-op if the trace is unknown or not sampled.
   */
  addSpansById(traceId: string, spans: SpanInput[]): void {
    const entry = this.active.get(traceId)
    if (!entry || !entry.headSampled) return
    for (const s of spans) entry.trace.spans.push(this.toSpan(entry, s))
  }

  /** The most-recent completed traces, newest last. */
  recent(): readonly Trace[] {
    return this.ring
  }

  /** Subscribe to ring changes (for live devtools views). Returns an unsubscribe. */
  subscribe(listener: (traces: readonly Trace[]) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Drop all retained traces. */
  clear(): void {
    this.ring = []
    this.emitChange()
  }

  private makeHandle(entry: ActiveTrace): TraceHandle {
    // Arrow functions capture the instance's `this` lexically (no `self` alias).
    return {
      traceId: entry.trace.traceId,
      active: entry.headSampled,
      mark: (name, parentSpanId) => {
        if (!entry.headSampled) return INERT_END
        const startPerf = this.now()
        return (attributes?: SpanAttributes) => {
          const end = this.now()
          return this.pushSpan(entry, {
            name,
            startOffsetMs: startPerf - entry.startedPerf,
            durationMs: end - startPerf,
            parentSpanId,
            attributes
          })
        }
      },
      addSpan: (span) => {
        if (!entry.headSampled) return ''
        return this.pushSpan(entry, span)
      },
      addSpans: (spans) => {
        if (!entry.headSampled) return
        for (const s of spans) this.pushSpan(entry, s)
      },
      end: () => this.endTrace(entry)
    }
  }

  private toSpan(entry: ActiveTrace, input: SpanInput): Span {
    return {
      spanId: `${entry.trace.traceId}-${++entry.spanSeq}`,
      parentSpanId: input.parentSpanId,
      name: input.name,
      startOffsetMs: Math.max(0, input.startOffsetMs),
      durationMs: Math.max(0, input.durationMs),
      attributes: input.attributes
    }
  }

  private pushSpan(entry: ActiveTrace, input: SpanInput): string {
    const span = this.toSpan(entry, input)
    entry.trace.spans.push(span)
    return span.spanId
  }

  private endTrace(entry: ActiveTrace): Trace | null {
    if (entry.trace.ended) return entry.trace.sampled ? entry.trace : null
    this.active.delete(entry.trace.traceId)
    entry.trace.ended = true
    entry.trace.totalMs = this.now() - entry.startedPerf
    // Tail rule: keep-if-slow even when not head-sampled (cheap — already in memory).
    const keep = entry.headSampled || entry.trace.totalMs >= this.slowMs
    entry.trace.sampled = keep
    if (!keep) return null
    // Slow-but-not-head-sampled traces have no spans; that's fine — the total is
    // still useful, and the devtools view degrades to a single bar.
    this.ring.push(entry.trace)
    if (this.ring.length > this.capacity) this.ring.shift()
    this.emitChange()
    this.onComplete?.(entry.trace)
    return entry.trace
  }

  private emitChange(): void {
    if (this.listeners.size === 0) return
    for (const l of this.listeners) l(this.ring)
  }
}

const INERT_HANDLE: TraceHandle = {
  traceId: '',
  active: false,
  mark: () => INERT_END,
  addSpan: () => '',
  addSpans: () => {},
  end: () => null
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 1
  return Math.min(1, Math.max(0, n))
}
