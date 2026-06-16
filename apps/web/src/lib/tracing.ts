/**
 * Web app tracing setup (exploration 0190).
 *
 * Constructs a TraceCollector only when the user opts in via
 * `localStorage['xnet:trace'] === '1'`, so the read/write hot path pays nothing
 * by default. The same collector is handed to both XNetProvider (config.tracing,
 * so hooks record spans) and XNetDevToolsProvider (traceCollector, so the Traces
 * panel renders waterfalls).
 */

import { TraceCollector } from '@xnetjs/telemetry'

const TRACE_FLAG_KEY = 'xnet:trace'

/** Whether tracing is enabled for this session (opt-in via localStorage). */
export function isTracingEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(TRACE_FLAG_KEY) === '1'
}

/**
 * Create the session TraceCollector, or `undefined` when tracing is off.
 * Captures full traces (sampleRate 1) since this is an explicit dev opt-in, and
 * keeps slow traces (≥200ms) even if sampling were lowered later.
 */
export function createWebTraceCollector(): TraceCollector | undefined {
  if (!isTracingEnabled()) return undefined
  return new TraceCollector({ sampleRate: 1, slowMs: 200, capacity: 200 })
}
