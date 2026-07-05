/**
 * One-time idle VACUUM of the OPFS SQLite database (exploration 0233).
 *
 * The boot trace caught the first landing query taking ~15.8 s of pure
 * execution because it faults its working set of B-tree pages from a large,
 * fragmented OPFS file (a 424 k-row append-only change log plus a 1.3 M-row
 * scalar index, grown interleaved over time). `VACUUM` rewrites the file
 * compactly and contiguously, so subsequent cold boots fault a smaller, denser
 * working set.
 *
 * `VACUUM` is heavy (it rewrites the whole file) and runs on the same single
 * SQLite worker as interactive reads, so it is gated to run **once per origin**
 * (localStorage flag), scheduled only when the main thread is idle, and never
 * touches the boot critical path. It also logs the file size before/after —
 * which doubles as the `db stats` measurement exploration 0233 asked for.
 * Never throws.
 *
 * SECOND ROLE (exploration 0260): this one-time VACUUM also *converts*
 * pre-existing `auto_vacuum=NONE` databases to `INCREMENTAL` (the mode set at
 * open in web.ts only takes effect on a fresh database or at a VACUUM). After
 * this single conversion, change-log compaction reclaims freed pages per boot
 * via `PRAGMA incremental_vacuum` — so the file keeps shrinking without ever
 * paying another whole-file rewrite. Because long-lived profiles latched the
 * localStorage flag back in 0233 (before incremental auto-vacuum existed), the
 * "once" gate is the database's ACTUAL `PRAGMA auto_vacuum` mode, not the flag
 * alone — a latched-but-unconverted database still gets its conversion VACUUM.
 *
 * INTERRUPTION ROBUSTNESS (0260 follow-up): VACUUM is atomic — a reload or tab
 * close mid-run rolls it back with ZERO progress. On a bloated profile the run
 * starts ~25–30 s after open (first paint + settle + idle) and takes minutes,
 * and the slowness it exists to fix is exactly what makes users reload — so
 * rapid reloaders could interrupt the conversion forever and never escape the
 * slow cold opens. A persisted attempt counter (incremented when a real VACUUM
 * starts, cleared on success) breaks that loop: after one interrupted attempt a
 * subtle "keep this tab open" hint shows while the VACUUM is in flight, and
 * after {@link ESCALATE_AFTER_ATTEMPTS} the scheduling escalates — the VACUUM
 * starts right at first paint, skipping the settle + idle waits, accepting one
 * slow-feeling boot to finally get the conversion through. Skipped runs
 * (in-memory DB, already converted) never touch the counter, so the steady
 * state stays one idle PRAGMA read per boot.
 */
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { bootSettled, runWhenBootSettled } from './boot-timeline'

const VACUUM_FLAG = 'xnet:db-vacuumed:v1'
/** Counts VACUUM starts that never reached success (cleared on completion). */
const VACUUM_ATTEMPTS_KEY = 'xnet:db-vacuum:attempts'
/** From the 2nd attempt on, show the "keep this tab open" hint while running. */
const HINT_AFTER_ATTEMPTS = 1
/** From the 3rd attempt on, start at first paint instead of waiting for idle. */
const ESCALATE_AFTER_ATTEMPTS = 2
/** Escalated-path safety net when `query:first-rows` never fires (error boot). */
const ESCALATED_FALLBACK_MS = 45000
/** `PRAGMA auto_vacuum` mode for INCREMENTAL (0 = NONE, 1 = FULL, 2 = INCREMENTAL). */
const AUTO_VACUUM_INCREMENTAL = 2

function debugLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.info('[xNet] db vacuum', ...args)
}

/** Prior VACUUM starts that never completed (0 when unset or unreadable). */
function readAttempts(): number {
  try {
    const n = Number(localStorage.getItem(VACUUM_ATTEMPTS_KEY))
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  } catch {
    return 0
  }
}

// ─── In-flight activity bus ──────────────────────────────────────────────────
// Same window-CustomEvent pattern as lib/storage-durability.ts: the vacuum runs
// far from the React tree, so it publishes activity for App-level surfaces (the
// StorageOptimiseHint pill) without threading callbacks through boot.

const VACUUM_ACTIVITY_EVENT = 'xnet:db-vacuum-activity'

type VacuumActivityEventDetail = { active: boolean }

let vacuumHintActive = false

/** Whether the "keep this tab open" hint should currently show (for late mounts). */
export function isVacuumHintActive(): boolean {
  return vacuumHintActive
}

/**
 * Subscribe to the in-flight hint state. Fires with `true` when a retry-attempt
 * VACUUM starts and `false` when it settles (success or failure).
 */
export function subscribeVacuumActivity(onChange: (active: boolean) => void): () => void {
  const listener = (event: Event): void => {
    const detail = (event as CustomEvent<VacuumActivityEventDetail>).detail
    if (detail) onChange(detail.active)
  }
  window.addEventListener(VACUUM_ACTIVITY_EVENT, listener)
  return () => window.removeEventListener(VACUUM_ACTIVITY_EVENT, listener)
}

function publishVacuumActivity(active: boolean): void {
  vacuumHintActive = active
  try {
    window.dispatchEvent(
      new CustomEvent<VacuumActivityEventDetail>(VACUUM_ACTIVITY_EVENT, { detail: { active } })
    )
  } catch {
    // The hint is best-effort; the vacuum itself must never depend on it.
  }
}

async function runVacuum(adapter: SQLiteAdapter): Promise<void> {
  let hintShown = false
  try {
    // An in-memory fallback database (no OPFS) has nothing durable to compact;
    // skip so we never burn the one-shot flag on a transient empty DB.
    // `getStorageMode` is async through the worker proxy, sync on the adapter.
    if ((await adapter.getStorageMode()) === 'memory') return

    // The latch alone is not enough: long-lived profiles latched the flag back
    // in 0233, BEFORE incremental auto-vacuum existed, so their database is
    // still `auto_vacuum = NONE` and every per-prune `incremental_vacuum` is a
    // no-op — the file could never shrink. Gate on the database's ACTUAL mode:
    // only skip when it is already INCREMENTAL. The open path sets the pending
    // mode (web.ts), and this VACUUM is what applies it to an existing file.
    let flagged = false
    try {
      flagged = localStorage.getItem(VACUUM_FLAG) !== null
    } catch {
      // localStorage unavailable: fall through and let the pragma decide.
    }
    const row = await adapter
      .queryOne<{ auto_vacuum: number }>('PRAGMA auto_vacuum')
      .catch(() => null)
    const mode = row?.auto_vacuum
    if (flagged && mode === AUTO_VACUUM_INCREMENTAL) return

    // A real VACUUM is about to start. Persist the attempt BEFORE running:
    // VACUUM is atomic, so a reload mid-run rolls it back with zero progress
    // and this counter is the only trace the attempt ever happened. Cleared on
    // success; skipped runs above never reach here, keeping steady-state boots
    // write-free.
    const attempts = readAttempts()
    try {
      localStorage.setItem(VACUUM_ATTEMPTS_KEY, String(attempts + 1))
    } catch {
      // ignore: the counter is best-effort, like the flag
    }
    // A prior attempt never finished — the user is likely reloading into the
    // slowness this VACUUM fixes. Ask them (subtly) to let it run.
    if (attempts >= HINT_AFTER_ATTEMPTS) {
      hintShown = true
      publishVacuumActivity(true)
    }

    const beforeBytes = await adapter.getDatabaseSize().catch(() => 0)
    await adapter.vacuum()
    try {
      localStorage.removeItem(VACUUM_ATTEMPTS_KEY)
    } catch {
      // ignore
    }
    const afterBytes = await adapter.getDatabaseSize().catch(() => 0)
    try {
      localStorage.setItem(VACUUM_FLAG, '1')
    } catch {
      // ignore: persistence of the flag is best-effort
    }
    debugLog('done', {
      beforeBytes,
      afterBytes,
      reclaimedBytes: beforeBytes - afterBytes,
      convertedAutoVacuumFrom: mode,
      attempt: attempts + 1
    })
  } catch (err) {
    // A failed VACUUM must never break the app; it retries next boot. The
    // attempt counter is intentionally NOT cleared: a crash counts the same as
    // an interruption, so repeated failures still escalate.
    // eslint-disable-next-line no-console
    console.warn('[xNet] db vacuum failed:', err)
  } finally {
    if (hintShown) publishVacuumActivity(false)
  }
}

/**
 * Schedule the one-time defragmenting VACUUM when the main thread is idle.
 * Safe to call on every boot — once the flag is latched AND the database is in
 * incremental auto-vacuum mode, the pass reduces to one idle `PRAGMA` read.
 *
 * After {@link ESCALATE_AFTER_ATTEMPTS} interrupted attempts the idle wait is
 * the enemy: on a bloated profile it pushes the start past the point where a
 * frustrated user has already reloaded, so the conversion never lands. The
 * escalated path starts the VACUUM the moment first paint lands — still never
 * blocking it — trading one slow-feeling boot for finally getting converted.
 */
export function scheduleOneTimeVacuum(adapter: SQLiteAdapter): void {
  if (typeof window === 'undefined') return
  if (readAttempts() >= ESCALATE_AFTER_ATTEMPTS) {
    let started = false
    const start = (): void => {
      if (started) return
      started = true
      void runVacuum(adapter)
    }
    void bootSettled().then(start)
    // Same safety net as runWhenBootSettled: an error boot never paints, but
    // the conversion must not stay stranded behind it.
    setTimeout(start, ESCALATED_FALLBACK_MS)
    return
  }
  // VACUUM is a whole-file rewrite on the single serial SQLite worker, so it must
  // run OFF the cold-open path. `requestIdleCallback` alone fired it INTO the boot
  // read burst (it tracks main-thread idle, which is idle while the worker is busy
  // — exploration 0260); gate on first paint + idle instead.
  runWhenBootSettled(() => {
    void runVacuum(adapter)
  })
}
