/**
 * Main-thread stall detector (exploration 0253 follow-up).
 *
 * The cold-open stall is provably NOT the SQLite open — every persisted boot
 * reaches `hub:connected` in ~0.6–2.2 s (`sqlite:open` ≈ 292 ms). The ~18 s is a
 * main-thread occupation AFTER `hub:connected`, in the post-ready landing-read /
 * first-paint path, which no `bootMark` covers and which a truncated console log
 * hides. Eight explorations chased it with per-op timers that all measure the
 * wrong thing (caller-side wall-clock that can't tell "op slow" from "main thread
 * couldn't process the result").
 *
 * A heartbeat localizes it with zero reproduction ritual: a `setInterval` callback
 * cannot run while the event loop is frozen, so the gap between two ticks IS the
 * length of the freeze. We record the WORST block, the offset from `init:start`
 * when it began, and the furthest boot phase reached just before it — so a stalled
 * boot self-reports e.g. `{ blockMs: 17900, atOffsetMs: 640, phaseBefore:
 * 'hub:connected' }`, pinning the ~18 s to the exact post-connect window. Persisted
 * to localStorage so it survives any log truncation; also surfaced via the Long
 * Tasks API (with attribution) when available. Gated behind `xnet:boot:debug`/dev.
 */
import { bootMarkAt, isBootDebugEnabled, lastBootPhase, type BootPhase } from './boot-timeline'

/** localStorage key holding the worst main-thread block of the current boot. */
export const MAIN_THREAD_BLOCK_STORAGE_KEY = 'xnet:boot:longblock'

/** Heartbeat period — small enough to bracket the block start tightly. */
const TICK_MS = 200
/** Only a gap longer than this counts as a real stall (vs. normal jank/GC). */
const BLOCK_THRESHOLD_MS = 1000
/** Stop watching after this long — the cold-open stall is always early. */
const WATCH_WINDOW_MS = 45_000

export interface MainThreadBlock {
  /** How long the event loop was frozen, ms. */
  blockMs: number
  /** Offset from `init:start` when the block began (the last good tick), ms. */
  atOffsetMs: number
  /** Furthest boot phase reached just before the block — names the window. */
  phaseBefore: BootPhase | undefined
  /** Furthest boot phase by the time the block cleared. */
  phaseAfter: BootPhase | undefined
  /** Long Tasks API attribution for the worst task, when the browser exposes it. */
  longTaskAttribution?: string
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

let detectorStarted = false
let worst: MainThreadBlock | null = null

function persistWorst(): void {
  try {
    if (typeof localStorage === 'undefined' || !worst) return
    localStorage.setItem(MAIN_THREAD_BLOCK_STORAGE_KEY, JSON.stringify(worst))
  } catch {
    // instrumentation must never break boot
  }
}

function recordBlock(block: MainThreadBlock): void {
  if (worst && block.blockMs <= worst.blockMs) {
    // Keep the worst, but still let a later, longer attribution enrich it.
    if (block.longTaskAttribution && !worst.longTaskAttribution) {
      worst.longTaskAttribution = block.longTaskAttribution
      persistWorst()
    }
    return
  }
  worst = { ...block, longTaskAttribution: worst?.longTaskAttribution ?? block.longTaskAttribution }
  persistWorst()
  try {
    // eslint-disable-next-line no-console
    console.warn(
      `[xNet] main-thread BLOCKED ${block.blockMs}ms at +${block.atOffsetMs}ms ` +
        `(phase ${block.phaseBefore ?? '?'} → ${block.phaseAfter ?? '?'})`,
      worst
    )
  } catch {
    // ignore
  }
}

/**
 * Observe the Long Tasks API (best-effort) so the worst block carries the
 * browser's attribution (container/script) when available — naming the script
 * frame that froze the thread, which the heartbeat alone can't.
 */
function observeLongTasks(base: number): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {}
  let obs: PerformanceObserver | null = null
  try {
    obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < BLOCK_THRESHOLD_MS) continue
        const attribution =
          (
            entry as unknown as { attribution?: Array<{ name?: string; containerType?: string }> }
          ).attribution
            ?.map((a) => a.containerType ?? a.name ?? '?')
            .join(',') || undefined
        recordBlock({
          blockMs: Math.round(entry.duration),
          atOffsetMs: Math.round(entry.startTime - base),
          phaseBefore: lastBootPhase(),
          phaseAfter: lastBootPhase(),
          longTaskAttribution: attribution
        })
      }
    })
    obs.observe({ entryTypes: ['longtask'] })
  } catch {
    obs = null
  }
  return () => {
    try {
      obs?.disconnect()
    } catch {
      // ignore
    }
  }
}

/**
 * Start the heartbeat + Long Task observer. Idempotent; a no-op unless boot debug
 * is on. Call once at `init:start`. The worst block lands in
 * `localStorage['xnet:boot:longblock']` and a `console.warn` line.
 */
export function startMainThreadStallDetector(): void {
  if (detectorStarted || !isBootDebugEnabled()) return
  if (typeof setInterval !== 'function') return
  detectorStarted = true

  const base = bootMarkAt('init:start') ?? now()
  let lastTick = now()
  let lastPhase = lastBootPhase()

  const stopLongTasks = observeLongTasks(base)

  const interval = setInterval(() => {
    const t = now()
    const gap = t - lastTick
    if (gap - TICK_MS > BLOCK_THRESHOLD_MS) {
      recordBlock({
        blockMs: Math.round(gap - TICK_MS),
        atOffsetMs: Math.round(lastTick - base),
        phaseBefore: lastPhase,
        phaseAfter: lastBootPhase()
      })
    }
    lastTick = t
    lastPhase = lastBootPhase()
  }, TICK_MS)

  setTimeout(() => {
    clearInterval(interval)
    stopLongTasks()
  }, WATCH_WINDOW_MS)
}

/** Test-only reset of module state. */
export function __resetMainThreadStallDetector(): void {
  detectorStarted = false
  worst = null
}
