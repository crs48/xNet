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
}
