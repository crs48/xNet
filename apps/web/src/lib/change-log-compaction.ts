/**
 * Idle change-log compaction (exploration 0254 / F3) — the durable fix for the
 * recurring cold-open stall.
 *
 * The local `changes` table grows monotonically (every edit + every applied
 * remote change appends a row) and never shrinks, reaching ~424 k rows. That
 * bloats the OPFS file, so the cold SQLite open faults a large working set
 * (~15.8 s, exploration 0233/0253), and it bloats the first outbound-resync
 * slice (exploration 0253/#356). Both costs scale with the log size.
 *
 * The log is a *non-authoritative cache* of history the hub holds: reads run off
 * the materialized `nodes`/`node_properties` projection, never the log. So we
 * prune only *superseded* history — rows below the confirmed-durable sync floor
 * that are neither a node's hash-chain tip nor the provenance of a currently-
 * winning property value (see `pruneSupersededChanges`). That keeps reads,
 * outbound sync, `parentHash` chaining, and convergence with peers that never
 * compacted all intact, while shrinking the file at the root.
 *
 * Like the one-time VACUUM it mirrors, this runs only when the main thread is
 * idle, never on the boot critical path, never throws, and is gated behind a
 * kill switch (`localStorage['xnet:compact:changes'] = 'off'`).
 */
import type { SQLiteNodeStorageAdapter } from '@xnetjs/data'
import type { SQLiteAdapter } from '@xnetjs/sqlite'

/** Set to the string `'off'` to disable compaction. */
const KILL_SWITCH = 'xnet:compact:changes'
/** Truncation-proof record of the last compaction pass (mirrors #352's boot log). */
const DEBUG_KEY = 'xnet:compact:last'
/** Shared with `db-vacuum.ts`: clearing it re-arms the one-time reclaiming VACUUM. */
const VACUUM_FLAG = 'xnet:db-vacuumed:v1'
/**
 * Keep a margin below the confirmed cursor so an in-flight `setSyncCursor`
 * racing the prune can't leave a just-below-floor row unprunable-then-pruned,
 * and so only settled history is ever touched.
 */
const LAMPORT_MARGIN = 128

function killed(): boolean {
  try {
    return localStorage.getItem(KILL_SWITCH) === 'off'
  } catch {
    return false
  }
}

async function runCompaction(
  nodeStorage: SQLiteNodeStorageAdapter,
  sqliteAdapter: SQLiteAdapter
): Promise<void> {
  try {
    // An in-memory fallback DB has no durable file to shrink.
    if ((await sqliteAdapter.getStorageMode()) === 'memory') return

    // Gate: a workspace that has never confirmed a sync has no safe floor — the
    // hub may not hold any of its history — so prune nothing (K1).
    const watermark = await nodeStorage.getMinConfirmedSyncCursor()
    if (watermark === null) return
    const wsafe = watermark - LAMPORT_MARGIN
    if (wsafe <= 0) return

    const { deleted } = await nodeStorage.pruneSupersededChanges(wsafe)

    try {
      localStorage.setItem(DEBUG_KEY, JSON.stringify({ wsafe, deleted, at: Date.now() }))
    } catch {
      // best-effort instrumentation
    }

    if (deleted > 0) {
      // journal_mode is TRUNCATE (no WAL), so the DELETE frees B-tree pages to
      // the freelist but leaves the file size unchanged. Re-arm the idle VACUUM
      // so the next boot rewrites the file compactly and the win is realised.
      try {
        localStorage.removeItem(VACUUM_FLAG)
      } catch {
        // ignore
      }
      // eslint-disable-next-line no-console
      console.info('[xNet] change-log compaction', { wsafe, deleted })
    }
  } catch (err) {
    // Compaction is a best-effort space/perf optimisation; it must never break
    // the app. It simply retries next idle boot.
    // eslint-disable-next-line no-console
    console.warn('[xNet] change-log compaction failed:', err)
  }
}

/**
 * Schedule change-log compaction when the main thread is next idle. Safe to call
 * on every boot; a no-op when the kill switch is set or there is nothing to
 * prune. Never touches the boot critical path.
 */
export function scheduleChangeLogCompaction(
  nodeStorage: SQLiteNodeStorageAdapter,
  sqliteAdapter: SQLiteAdapter
): void {
  if (typeof window === 'undefined') return
  if (killed()) return

  const win = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  const run = (): void => {
    void runCompaction(nodeStorage, sqliteAdapter)
  }
  if (typeof win.requestIdleCallback === 'function') {
    win.requestIdleCallback(run, { timeout: 15000 })
  } else {
    setTimeout(run, 5000)
  }
}
