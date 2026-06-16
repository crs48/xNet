/**
 * Tracing context for @xnetjs/react (exploration 0190).
 *
 * Provides an optional duck-typed TracingReporter to the React tree. When
 * present, useQuery/useMutate open a per-call trace and record main-thread
 * stage spans. Mirrors the telemetry-context duck-typing so @xnetjs/react
 * never has to depend on @xnetjs/telemetry (which would be circular).
 *
 * The reporter is satisfied by @xnetjs/telemetry's `TraceCollector`. When no
 * reporter is supplied the hooks pay nothing — `tracing?.startTrace(...)` is a
 * no-op and the optional chaining short-circuits.
 */

import { createContext, useContext } from 'react'

// ─── Stage name constants (mirror @xnetjs/telemetry's stages.ts) ─────────────
// Kept as plain strings so react avoids a dependency on @xnetjs/telemetry. The
// canonical source is packages/telemetry/src/tracing/stages.ts — keep in sync.
export const TRACE_STAGES = {
  queryDescriptor: 'data.query.descriptor',
  queryBridge: 'data.query.bridge',
  queryFlatten: 'data.query.flatten',
  queryCommit: 'data.query.commit',
  mutateBridge: 'data.mutate.bridge'
} as const

// ─── Duck-typed reporter surface ─────────────────────────────────────────────

export type TracingRootKind = 'query' | 'mutate' | 'sync' | 'other'

export type TracingAttributes = Record<string, string | number | boolean | undefined>

export interface TracingSpanInput {
  name: string
  startOffsetMs: number
  durationMs: number
  parentSpanId?: string
  attributes?: TracingAttributes
}

/** A handle to an in-progress trace. Inert when the trace is not being captured. */
export interface TracingHandle {
  readonly traceId: string
  readonly active: boolean
  /** Start timing a stage; the returned fn records the span when called. */
  mark(name: string, parentSpanId?: string): (attributes?: TracingAttributes) => string
  addSpan(span: TracingSpanInput): string
  end(): unknown
}

/**
 * Duck-typed interface for opening traces. Satisfied by @xnetjs/telemetry's
 * `TraceCollector` (structurally — `startTrace` returns a compatible handle).
 */
export interface TracingReporter {
  startTrace(rootKind: TracingRootKind, rootName: string, traceId?: string): TracingHandle
}

// ─── Context ─────────────────────────────────────────────────────────────────

export const TracingContext = createContext<TracingReporter | null>(null)

/**
 * Hook to access the tracing reporter (null if no tracing configured).
 * @internal Used by useQuery/useMutate — not part of the public hook API.
 */
export function useTracingReporter(): TracingReporter | null {
  return useContext(TracingContext)
}
