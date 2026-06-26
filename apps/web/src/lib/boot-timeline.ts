/**
 * Boot timeline instrumentation (exploration 0204).
 *
 * The cold-start path — SQLite WASM init, schema, identity unlock,
 * NodeStore/bridge creation, hub connect, first sync, first rows on
 * screen — had ZERO timing instrumentation, so a reported 10–20s
 * "connecting" phase could not be attributed to any single phase.
 *
 * This records a monotonic timestamp per named phase (first write wins,
 * so a reconnect can't clobber the first `hub:connected`) and derives
 * per-segment durations. It is intentionally dependency-free and safe
 * to call before/without a `performance` global (older WebViews, tests).
 */

/** Named boot phases, in the order they normally occur. */
export type BootPhase =
  | 'init:start'
  | 'sqlite:open'
  | 'sqlite:schema'
  | 'identity:ready'
  | 'store:ready'
  | 'docwarm:ready'
  | 'hub:connected'
  | 'sync:first'
  | 'query:first-rows'

const marks = new Map<BootPhase, number>()

function now(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

/**
 * Record the time a boot phase was reached. First write wins — later
 * calls for the same phase are ignored so a reconnect (a second
 * `hub:connected`) doesn't overwrite the cold-start measurement. Pass
 * `{ override: true }` only when re-measuring is intended.
 */
export function bootMark(phase: BootPhase, options?: { override?: boolean }): void {
  if (marks.has(phase) && !options?.override) return
  marks.set(phase, now())
  // performance.mark gives the phase a marker in the DevTools timeline /
  // PerformanceObserver too, but must never throw on unsupported engines.
  try {
    performance?.mark?.(`xnet:${phase}`)
  } catch {
    // no-op: instrumentation must never break boot
  }
}

/** Raw timestamp for a phase, or undefined if it hasn't happened yet. */
export function bootMarkAt(phase: BootPhase): number | undefined {
  return marks.get(phase)
}

/** The phases in canonical occurrence order — the source of truth for "furthest". */
const BOOT_PHASE_ORDER: readonly BootPhase[] = [
  'init:start',
  'sqlite:open',
  'sqlite:schema',
  'identity:ready',
  'store:ready',
  'docwarm:ready',
  'hub:connected',
  'sync:first',
  'query:first-rows'
]

/**
 * The furthest boot phase reached so far, or undefined before `init:start`,
 * useful as the `stage` on a boot failure report ("it died at `sqlite:open`")
 * (exploration 0210). Resolved by the canonical phase ORDER rather than Map
 * insertion order: phases are marked by independent observers, so on a warm
 * local-first load `query:first-rows` can land before `hub:connected` — using
 * insertion order would mislabel the furthest phase in that window.
 */
export function lastBootPhase(): BootPhase | undefined {
  let last: BootPhase | undefined
  for (const phase of BOOT_PHASE_ORDER) {
    if (marks.has(phase)) last = phase
  }
  return last
}

/**
 * Milliseconds between two phases, or undefined if either is missing.
 * Rounded to the nearest millisecond.
 */
export function bootMeasure(from: BootPhase, to: BootPhase): number | undefined {
  const a = marks.get(from)
  const b = marks.get(to)
  if (a == null || b == null) return undefined
  return Math.round(b - a)
}

export interface BootTimeline {
  /** SQLite WASM download + instantiate + OPFS pool. */
  wasm?: number
  /** Schema apply / migration. */
  schema?: number
  /** Identity check + unlock/resume. */
  identity?: number
  /** NodeStore init + data-bridge creation. */
  store?: number
  /**
   * First Y.Doc warm (store-ready → first doc acquired). Surfaces document
   * I/O that contends with landing reads on the single SQLite worker, so the
   * boot stall is no longer hidden inside `connect` (exploration 0227).
   */
  docwarm?: number
  /** Hub WebSocket handshake (store-ready → connected). */
  connect?: number
  /** First sync round-trip after connect. */
  firstSync?: number
  /** Wall-clock from boot start to first rows painted. */
  firstPaint?: number
}

/** Derive all segment durations from whatever phases have been marked. */
export function getBootTimeline(): BootTimeline {
  return {
    wasm: bootMeasure('init:start', 'sqlite:open'),
    schema: bootMeasure('sqlite:open', 'sqlite:schema'),
    identity: bootMeasure('sqlite:schema', 'identity:ready'),
    store: bootMeasure('identity:ready', 'store:ready'),
    docwarm: bootMeasure('store:ready', 'docwarm:ready'),
    connect: bootMeasure('store:ready', 'hub:connected'),
    firstSync: bootMeasure('hub:connected', 'sync:first'),
    firstPaint: bootMeasure('init:start', 'query:first-rows')
  }
}

/** True when the `xnet:boot:debug` localStorage flag is set. */
function debugEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('xnet:boot:debug') === 'true'
  } catch {
    return false
  }
}

/**
 * Whether boot/read-path diagnostics should emit: always in dev, or whenever
 * the `xnet:boot:debug` flag is set in any build (so a production cold-start
 * regression can be captured in the field without a rebuild). Shared by the
 * read-path probe (exploration 0212) so all boot instrumentation toggles
 * together off one flag.
 */
export function isBootDebugEnabled(): boolean {
  const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
  return isDev || debugEnabled()
}

/**
 * Wire the runtime's `xnet:sync:first-remote-apply` performance mark — emitted
 * the first time a remote change is applied to the local store — into the boot
 * timeline's `sync:first` phase (exploration 0212). The runtime sync layer is
 * platform-agnostic and can't import this module, so it emits a `performance`
 * mark and we observe it here. Idempotent and defensive: a missing
 * PerformanceObserver, or an environment without `performance`, is a no-op and
 * never throws — instrumentation must not break boot.
 */
let syncFirstObserver: PerformanceObserver | null = null
export function observeSyncFirstMark(): void {
  if (syncFirstObserver) return
  if (typeof PerformanceObserver === 'undefined') return
  // If the mark already fired before this ran, pick it up from the buffer.
  try {
    if (
      typeof performance !== 'undefined' &&
      typeof performance.getEntriesByName === 'function' &&
      performance.getEntriesByName('xnet:sync:first-remote-apply', 'mark').length > 0
    ) {
      bootMark('sync:first')
      return
    }
  } catch {
    // ignore — fall through to the live observer
  }
  try {
    syncFirstObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'xnet:sync:first-remote-apply') {
          bootMark('sync:first')
          syncFirstObserver?.disconnect()
          syncFirstObserver = null
          return
        }
      }
    })
    syncFirstObserver.observe({ entryTypes: ['mark'] })
  } catch {
    syncFirstObserver = null
  }
}

/**
 * Wire the runtime's `xnet:docpool:first-acquire` mark — emitted when the first
 * Y.Doc acquire completes — into the boot timeline's `docwarm:ready` phase. That
 * first doc-warm is the document I/O that contended with landing reads on the
 * single SQLite worker (exploration 0227). Same observe-a-mark pattern as
 * {@link observeSyncFirstMark}: the runtime can't import this module, so it
 * emits a `performance` mark we observe here. Idempotent and defensive.
 */
let docWarmObserver: PerformanceObserver | null = null
export function observeDocWarmMark(): void {
  if (docWarmObserver) return
  if (typeof PerformanceObserver === 'undefined') return
  try {
    if (
      typeof performance !== 'undefined' &&
      typeof performance.getEntriesByName === 'function' &&
      performance.getEntriesByName('xnet:docpool:first-acquire', 'mark').length > 0
    ) {
      bootMark('docwarm:ready')
      return
    }
  } catch {
    // ignore — fall through to the live observer
  }
  try {
    docWarmObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'xnet:docpool:first-acquire') {
          bootMark('docwarm:ready')
          docWarmObserver?.disconnect()
          docWarmObserver = null
          return
        }
      }
    })
    docWarmObserver.observe({ entryTypes: ['mark'] })
  } catch {
    docWarmObserver = null
  }
}

let logged = false

/**
 * Log the boot timeline once. Emits in dev builds, or whenever the
 * `xnet:boot:debug` flag is set in any build, so production cold-start
 * regressions can be diagnosed in the field without a rebuild.
 */
export function logBootTimeline(reason = 'hub:connected'): void {
  if (logged) return
  logged = true
  const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
  if (!isDev && !debugEnabled()) return
  // eslint-disable-next-line no-console
  console.info(`[xNet] boot timeline (ms) @ ${reason}:`, getBootTimeline())
}

/** Test-only: clear all recorded marks and the one-shot log latch. */
export function __resetBootTimeline(): void {
  marks.clear()
  logged = false
  try {
    syncFirstObserver?.disconnect()
    docWarmObserver?.disconnect()
  } catch {
    // ignore
  }
  syncFirstObserver = null
  docWarmObserver = null
}
