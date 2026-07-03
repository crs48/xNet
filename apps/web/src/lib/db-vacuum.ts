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
 */
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { runWhenBootSettled } from './boot-timeline'

const VACUUM_FLAG = 'xnet:db-vacuumed:v1'

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

    const beforeBytes = await adapter.getDatabaseSize().catch(() => 0)
    await adapter.vacuum()
    const afterBytes = await adapter.getDatabaseSize().catch(() => 0)
    try {
      localStorage.setItem(VACUUM_FLAG, '1')
    } catch {
      // ignore: persistence of the flag is best-effort
    }
    debugLog('done', { beforeBytes, afterBytes, reclaimedBytes: beforeBytes - afterBytes })
  } catch (err) {
    // A failed VACUUM must never break the app; it retries next boot.
    // eslint-disable-next-line no-console
    console.warn('[xNet] db vacuum failed:', err)
  }
}

/**
 * Schedule the one-time defragmenting VACUUM when the main thread is idle.
 * Safe to call on every boot — it no-ops once the flag is set.
 */
export function scheduleOneTimeVacuum(adapter: SQLiteAdapter): void {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(VACUUM_FLAG)) return
  } catch {
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
