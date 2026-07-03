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
  // The span sqlite:schema → identity:ready used to be one opaque "identity"
  // bucket (9.1 s in the 0249 capture) that actually wraps a cold COUNT(*)
  // probe, the storage-adapter open, and only then identity unlock. These three
  // marks split it so the dominant sub-phase is attributable (exploration 0249).
  | 'sqlite:probe'
  | 'storage:open'
  | 'identity:checked'
  | 'identity:ready'
  | 'store:ready'
  | 'docwarm:ready'
  | 'hub:connected'
  // First time a landing query's LIVE result crosses the bridge to a surface.
  // Distinct from query:first-rows (which the instant-shell can satisfy from a
  // localStorage snapshot in <1s): this brackets the real cold-read latency and
  // localizes the previously-untraced ~5s secondary gap (exploration 0249).
  | 'bridge:first-result'
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
  // The first landing data has rendered — release anyone waiting on bootSettled()
  // so worker-bound background work can run OFF the cold-open path (exploration 0260).
  if (phase === 'query:first-rows') resolveBootSettled()
  // performance.mark gives the phase a marker in the DevTools timeline /
  // PerformanceObserver too, but must never throw on unsupported engines.
  try {
    performance?.mark?.(`xnet:${phase}`)
  } catch {
    // no-op: instrumentation must never break boot
  }
}

// ─── Boot-settled gate (exploration 0260) ────────────────────────────────────
// The single SQLite worker serves reads and writes strictly serially, so any
// heavy background work (compaction, VACUUM) scheduled during boot ADDS to the
// cold-open wall-clock — it can never overlap the cold landing reads. And
// `requestIdleCallback` is the wrong idle signal: it measures MAIN-thread idle,
// which is idle exactly while the worker is saturated (a landing query is an
// async round-trip), so it fires straight into the busy window. The fix is to
// wait for first paint (`query:first-rows`) plus a real idle gap before starting.

let resolveBootSettled: () => void = () => {}
let bootSettledPromise = new Promise<void>((resolve) => {
  resolveBootSettled = resolve
})

/**
 * Resolves the moment `query:first-rows` is marked — i.e. the first landing data
 * has rendered. Await this before scheduling worker-bound background work so it
 * never competes with the cold-open read burst on the single SQLite worker.
 */
export function bootSettled(): Promise<void> {
  return bootSettledPromise
}

/**
 * Run `task` once the cold-open has settled AND the main thread is next idle —
 * the correct gate for worker-bound background work (exploration 0260). Waits for
 * `query:first-rows`, then a short post-paint delay (so the secondary prewarm wave
 * drains), then a `requestIdleCallback` slot. Falls back to a timeout if
 * `query:first-rows` never fires (e.g. an empty/error boot) so the work is never
 * stranded, and never runs `task` twice. No-op outside the browser.
 */
export function runWhenBootSettled(
  task: () => void,
  opts?: { settleDelayMs?: number; fallbackMs?: number }
): void {
  if (typeof window === 'undefined') return
  const settleDelayMs = opts?.settleDelayMs ?? 3000
  const fallbackMs = opts?.fallbackMs ?? 45000
  let started = false
  const start = (): void => {
    if (started) return
    started = true
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
    }
    if (typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(() => task(), { timeout: 10000 })
    } else {
      setTimeout(task, 1000)
    }
  }
  void bootSettledPromise.then(() => setTimeout(start, settleDelayMs))
  // Safety net: run even if first paint never fires.
  setTimeout(start, fallbackMs)
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
  'sqlite:probe',
  'storage:open',
  'identity:checked',
  'identity:ready',
  'store:ready',
  'docwarm:ready',
  'hub:connected',
  'bridge:first-result',
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
  /**
   * Identity check + unlock/resume — the FULL sqlite:schema → identity:ready
   * span, kept for back-compat. The 0249 split below attributes it: the bucket
   * was a 9.1 s catch-all that also held a cold COUNT(*) probe and storage open.
   */
  identity?: number
  /** Cold-start `SELECT COUNT(*) FROM nodes` probe (sqlite:schema → sqlite:probe). */
  probe?: number
  /** Storage-adapter open + node-storage construction (sqlite:probe → storage:open). */
  storageOpen?: number
  /** Blob services + data-worker port + hasIdentity() (storage:open → identity:checked). */
  identityCheck?: number
  /** Session unlock/resume crypto (identity:checked → identity:ready). */
  identityResume?: number
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
  /**
   * Store-ready → first LIVE landing result across the bridge (exploration
   * 0249). With the instant-shell paint satisfied from a snapshot, this is the
   * number that still carries the real cold-read cost + the ~5s secondary gap,
   * so it stays visible even though `firstPaint` no longer does.
   */
  bridgeFirst?: number
  /** First sync round-trip after connect. */
  firstSync?: number
  /** Wall-clock from boot start to first rows painted. */
  firstPaint?: number
}

/**
 * Absolute offset (ms from `init:start`) of every phase reached so far. Unlike
 * {@link getBootTimeline}'s segment durations, this shows the raw sequence, so a
 * single dominant gap is obvious at a glance (e.g. `identity:ready:2500,
 * store:ready:20500` localizes ~18 s to the bring-up segment). Phases not yet
 * reached are omitted. (exploration 0253 follow-up — the stall kept hopping into
 * whichever segment wasn't yet split; the offset dump makes the live one visible
 * without needing to pre-guess which segment to instrument.)
 */
export function bootMarksDump(): Partial<Record<BootPhase, number>> {
  const base = marks.get('init:start')
  const out: Partial<Record<BootPhase, number>> = {}
  for (const phase of BOOT_PHASE_ORDER) {
    const at = marks.get(phase)
    if (at != null) out[phase] = base != null ? Math.round(at - base) : 0
  }
  return out
}

/** Derive all segment durations from whatever phases have been marked. */
export function getBootTimeline(): BootTimeline {
  return {
    wasm: bootMeasure('init:start', 'sqlite:open'),
    schema: bootMeasure('sqlite:open', 'sqlite:schema'),
    identity: bootMeasure('sqlite:schema', 'identity:ready'),
    probe: bootMeasure('sqlite:schema', 'sqlite:probe'),
    storageOpen: bootMeasure('sqlite:probe', 'storage:open'),
    identityCheck: bootMeasure('storage:open', 'identity:checked'),
    identityResume: bootMeasure('identity:checked', 'identity:ready'),
    store: bootMeasure('identity:ready', 'store:ready'),
    docwarm: bootMeasure('store:ready', 'docwarm:ready'),
    connect: bootMeasure('store:ready', 'hub:connected'),
    bridgeFirst: bootMeasure('store:ready', 'bridge:first-result'),
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

const loggedReasons = new Set<string>()

/**
 * Log the boot timeline once **per reason**. Emits in dev builds, or whenever
 * the `xnet:boot:debug` flag is set in any build, so production cold-start
 * regressions can be diagnosed in the field without a rebuild.
 *
 * Logging at more than one reason matters since 0229: the hub now connects
 * early (it's no longer serialized behind local storage), so a log only at
 * `hub:connected` would miss the residual time-to-first-paint. Logging again at
 * `query:first-rows` keeps the real felt-latency (`firstPaint`) in the capture.
 */
export function logBootTimeline(reason = 'hub:connected'): void {
  if (loggedReasons.has(reason)) return
  loggedReasons.add(reason)
  const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
  if (!isDev && !debugEnabled()) return
  // eslint-disable-next-line no-console
  console.info(`[xNet] boot timeline (ms) @ ${reason}:`, getBootTimeline())
  // Also persist it where a truncated log can't hide it (see persistBootTimeline).
  persistBootTimeline(reason)
}

/** localStorage key holding the most recent boot timeline (read it after a stall). */
export const BOOT_TIMELINE_STORAGE_KEY = 'xnet:boot:last'
/** localStorage key holding a short ring of recent boot timelines. */
export const BOOT_TIMELINE_HISTORY_KEY = 'xnet:boot:history'

/**
 * Persist the boot timeline to `localStorage` so it survives a truncated console
 * capture. Every cold-open capture the user pasted started mid-stream (id ~109+),
 * which dropped exactly the `[xNet] boot timeline` line that names the slow
 * segment — so the stall went unlocalized across explorations 0204→0253 not for
 * lack of the measurement but because the line scrolled out of the buffer. With
 * this, the answer is one assignment away regardless of the log window:
 *
 *   JSON.parse(localStorage.getItem('xnet:boot:last'))
 *
 * Stores both the segment durations ({@link getBootTimeline}) and the absolute
 * offsets ({@link bootMarksDump}) so a single dominant gap is obvious. Keeps the
 * last 5 boots in a ring. Gated behind the same dev/`xnet:boot:debug` flag as the
 * console log; tiny, best-effort, never throws.
 */
let settledPersistScheduled = false
let settledPersistTimer: ReturnType<typeof setTimeout> | null = null

export function persistBootTimeline(reason = 'hub:connected'): void {
  const isDev = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV)
  if (!isDev && !debugEnabled()) return
  // The first persist usually fires at `hub:connected` (~0.6 s) — BEFORE a stall
  // that lives in the post-connect landing-read/first-paint tail, and on a doc
  // route no later phase marks, so the snapshot would look fast even on an 18 s
  // open. Schedule ONE delayed re-capture so the *settled* timeline (whatever the
  // furthest phase is once the stall clears) always lands in localStorage — even
  // a synchronous main-thread block only delays this timer, it can't cancel it
  // (exploration 0253 follow-up: the captured boots were all fast; the stalled
  // one was never recorded because nothing re-persisted after the stall).
  if (!settledPersistScheduled && reason !== 'settled' && typeof setTimeout === 'function') {
    settledPersistScheduled = true
    settledPersistTimer = setTimeout(() => persistBootTimeline('settled'), 20000)
  }
  try {
    if (typeof localStorage === 'undefined') return
    const entry = {
      reason,
      furthest: lastBootPhase(),
      timeline: getBootTimeline(),
      offsetsMs: bootMarksDump()
    }
    const json = JSON.stringify(entry)
    localStorage.setItem(BOOT_TIMELINE_STORAGE_KEY, json)
    let history: unknown[] = []
    try {
      const raw = localStorage.getItem(BOOT_TIMELINE_HISTORY_KEY)
      if (raw) history = JSON.parse(raw) as unknown[]
    } catch {
      history = []
    }
    if (!Array.isArray(history)) history = []
    history.push(entry)
    // Keep only the last 5 boots so the key stays small.
    localStorage.setItem(BOOT_TIMELINE_HISTORY_KEY, JSON.stringify(history.slice(-5)))
  } catch {
    // instrumentation must never break boot
  }
}

/**
 * Record that the first LIVE landing result has crossed the bridge to a surface
 * (exploration 0249). Idempotent via `bootMark`'s first-write-wins, so the
 * caller can fire it from every landing query's resolution without guarding.
 */
export function markBridgeFirstResult(): void {
  bootMark('bridge:first-result')
}

/** Test-only: clear all recorded marks and the one-shot log latch. */
export function __resetBootTimeline(): void {
  marks.clear()
  loggedReasons.clear()
  bootSettledPromise = new Promise<void>((resolve) => {
    resolveBootSettled = resolve
  })
  try {
    syncFirstObserver?.disconnect()
    docWarmObserver?.disconnect()
  } catch {
    // ignore
  }
  syncFirstObserver = null
  docWarmObserver = null
  if (settledPersistTimer != null) {
    try {
      clearTimeout(settledPersistTimer)
    } catch {
      // ignore
    }
  }
  settledPersistTimer = null
  settledPersistScheduled = false
}
