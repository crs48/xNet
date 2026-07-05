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
 */
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { runWhenBootSettled } from './boot-timeline'

const VACUUM_FLAG = 'xnet:db-vacuumed:v1'
/** `PRAGMA auto_vacuum` mode for INCREMENTAL (0 = NONE, 1 = FULL, 2 = INCREMENTAL). */
const AUTO_VACUUM_INCREMENTAL = 2

function debugLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.info('[xNet] db vacuum', ...args)
}

async function runVacuum(adapter: SQLiteAdapter): Promise<void> {
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

    const beforeBytes = await adapter.getDatabaseSize().catch(() => 0)
    await adapter.vacuum()
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
      convertedAutoVacuumFrom: mode
    })
  } catch (err) {
    // A failed VACUUM must never break the app; it retries next boot.
    // eslint-disable-next-line no-console
    console.warn('[xNet] db vacuum failed:', err)
  }
}

/**
 * Schedule the one-time defragmenting VACUUM when the main thread is idle.
 * Safe to call on every boot — once the flag is latched AND the database is in
 * incremental auto-vacuum mode, the pass reduces to one idle `PRAGMA` read.
 */
export function scheduleOneTimeVacuum(adapter: SQLiteAdapter): void {
  if (typeof window === 'undefined') return
  // VACUUM is a whole-file rewrite on the single serial SQLite worker, so it must
  // run OFF the cold-open path. `requestIdleCallback` alone fired it INTO the boot
  // read burst (it tracks main-thread idle, which is idle while the worker is busy
  // — exploration 0260); gate on first paint + idle instead.
  runWhenBootSettled(() => {
    void runVacuum(adapter)
  })
}
