/**
 * Input-latency telemetry per data runtime (exploration 0264, Wave 2).
 *
 * This is the measurement the worker-runtime default flip has been waiting on
 * (data-runtime.ts: "flip once real-browser input-latency telemetry confirms
 * no regression"). It observes the Event Timing API (`PerformanceObserver`
 * type 'event' — the INP building block) for the session, aggregates input
 * event durations, and persists a per-runtime rolling summary in
 * localStorage — so sessions running `'main'` and sessions running `'worker'`
 * accumulate directly comparable numbers on the same device.
 *
 * Read the comparison in the console via
 * `JSON.parse(localStorage.getItem('xnet:runtime-latency:v1'))` or the boot
 * log line this module emits once the boot settles. The flip criterion:
 * worker-runtime p95 ≤ main-runtime p95 on reload-heavy screens.
 */
import { runWhenBootSettled } from './boot-timeline'

const STORAGE_KEY = 'xnet:runtime-latency:v1'
/** Cap stored sessions per runtime so the summary stays a rolling window. */
const MAX_SESSIONS_PER_RUNTIME = 20
/** Ignore ultra-short events; Event Timing only reports ≥16ms anyway. */
const MIN_DURATION_MS = 16

export interface RuntimeLatencySessionSummary {
  /** Epoch ms the session was recorded. */
  at: number
  /** Input events observed (duration ≥ {@link MIN_DURATION_MS}). */
  events: number
  p50: number
  p95: number
  max: number
}

export interface RuntimeLatencyHistory {
  main: RuntimeLatencySessionSummary[]
  worker: RuntimeLatencySessionSummary[]
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return Math.round(sorted[rank])
}

/** Read the persisted per-runtime history (tolerating restricted storage). */
export function readRuntimeLatencyHistory(): RuntimeLatencyHistory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { main: [], worker: [] }
    const parsed = JSON.parse(raw) as Partial<RuntimeLatencyHistory>
    return {
      main: Array.isArray(parsed.main) ? parsed.main : [],
      worker: Array.isArray(parsed.worker) ? parsed.worker : []
    }
  } catch {
    return { main: [], worker: [] }
  }
}

function persistSession(runtime: 'main' | 'worker', summary: RuntimeLatencySessionSummary): void {
  try {
    const history = readRuntimeLatencyHistory()
    history[runtime] = [...history[runtime], summary].slice(-MAX_SESSIONS_PER_RUNTIME)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch {
    // Storage unavailable — the console line below still carries the numbers.
  }
}

/** Aggregate a runtime's rolling history into one comparable line. */
export function summarizeRuntimeLatency(sessions: readonly RuntimeLatencySessionSummary[]): {
  sessions: number
  events: number
  p95: number
} {
  const events = sessions.reduce((total, s) => total + s.events, 0)
  const weighted = sessions.filter((s) => s.events > 0)
  const p95 =
    weighted.length === 0
      ? 0
      : Math.round(
          weighted.reduce((total, s) => total + s.p95 * s.events, 0) /
            Math.max(
              1,
              weighted.reduce((total, s) => total + s.events, 0)
            )
        )
  return { sessions: sessions.length, events, p95 }
}

/**
 * Start observing input-event latency for this session, attributed to
 * `runtime`. Returns a stop function. Safe no-op where the Event Timing API
 * is unavailable.
 */
export function startRuntimeLatencyTelemetry(runtime: 'main' | 'worker'): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {}
  const supported = (PerformanceObserver.supportedEntryTypes ?? []).includes('event')
  if (!supported) return () => {}

  const durations: number[] = []
  let observer: PerformanceObserver | null = null
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= MIN_DURATION_MS) {
          durations.push(entry.duration)
        }
      }
    })
    // durationThreshold floors at 16ms in the spec.
    observer.observe({ type: 'event', buffered: true, durationThreshold: MIN_DURATION_MS } as never)
  } catch {
    return () => {}
  }

  let flushed = false
  const flush = (): void => {
    if (flushed) return
    flushed = true
    observer?.disconnect()
    const sorted = [...durations].sort((a, b) => a - b)
    const summary: RuntimeLatencySessionSummary = {
      at: Date.now(),
      events: sorted.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      max: sorted.length > 0 ? Math.round(sorted[sorted.length - 1]) : 0
    }
    persistSession(runtime, summary)

    const history = readRuntimeLatencyHistory()
    // eslint-disable-next-line no-console
    console.info('[xNet] runtime input latency', {
      runtime,
      session: summary,
      main: summarizeRuntimeLatency(history.main),
      worker: summarizeRuntimeLatency(history.worker)
    })
  }

  // Summarize once the boot settles — the reload-heavy window is exactly
  // what the flip decision compares, so it is the session's record.
  runWhenBootSettled(flush)

  return flush
}
