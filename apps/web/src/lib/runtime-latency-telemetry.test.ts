/**
 * Tests for per-runtime input-latency telemetry (exploration 0264).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  readRuntimeLatencyHistory,
  summarizeRuntimeLatency,
  startRuntimeLatencyTelemetry
} from './runtime-latency-telemetry'

describe('runtime latency telemetry (0264)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('reads an empty history when nothing is stored', () => {
    expect(readRuntimeLatencyHistory()).toEqual({ main: [], worker: [] })
  })

  it('tolerates corrupted storage', () => {
    localStorage.setItem('xnet:runtime-latency:v1', '{not json')
    expect(readRuntimeLatencyHistory()).toEqual({ main: [], worker: [] })
  })

  it('summarizes sessions with event-weighted p95', () => {
    const summary = summarizeRuntimeLatency([
      { at: 1, events: 10, p50: 20, p95: 40, max: 60 },
      { at: 2, events: 30, p50: 30, p95: 80, max: 120 },
      { at: 3, events: 0, p50: 0, p95: 0, max: 0 }
    ])
    expect(summary.sessions).toBe(3)
    expect(summary.events).toBe(40)
    // (40×10 + 80×30) / 40 = 70
    expect(summary.p95).toBe(70)
  })

  it('is a safe no-op where the Event Timing API is unavailable (jsdom)', () => {
    // jsdom has no PerformanceObserver 'event' type — must not throw.
    const stop = startRuntimeLatencyTelemetry('main')
    expect(typeof stop).toBe('function')
    stop()
  })
})
