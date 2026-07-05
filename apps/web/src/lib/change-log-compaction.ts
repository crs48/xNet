/**
 * Change-log compaction (exploration 0254 / F3; scheduling fixed in 0260) — the
 * durable fix for the recurring cold-open stall.
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
 * compacted all intact.
 *
 * SCHEDULING (exploration 0260): the single SQLite worker is strictly serial, so
 * compaction must run OFF the cold-open path or it *adds* to first-paint. #360
 * used `requestIdleCallback` — which measures MAIN-thread idle (idle exactly
 * while the worker is busy on the async landing read) — and a 250 k-row pass,
 * which doubled the cold-open (31.5 s). This version instead waits for
 * `bootSettled()` (first paint) + a real idle slot, then prunes in SMALL chunks
 * with an idle yield between each, capped per session and looping-until-dry
 * across boots. Never touches the boot critical path, never throws, gated behind
 * a kill switch (`localStorage['xnet:compact:changes'] = 'off'`).
 *
 * FILE RECLAIM (exploration 0260): a DELETE only frees pages to the freelist, so
 * on its own compaction shrinks the row count but not the OPFS *file* that the
 * cold read faults. With `auto_vacuum=INCREMENTAL` (web.ts) each pass follows its
 * deletes with the adapter's `incrementalVacuum()` (which steps the pragma to
 * completion — a bare `exec('PRAGMA incremental_vacuum')` frees only ONE page per
 * call on the WASM build), returning the freed pages to the OS — so the file
 * shrinks a little every idle boot until the log is drained, rather than only on
 * the single one-time VACUUM. A pass that deleted nothing still reclaims when a
 * large freelist backlog is present (pages stranded by earlier passes).
 */
import type { SQLiteNodeStorageAdapter } from '@xnetjs/data'
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { runWhenBootSettled } from './boot-timeline'

/** Set to the string `'off'` to disable compaction. */
const KILL_SWITCH = 'xnet:compact:changes'
/** Truncation-proof record of the last compaction pass (mirrors #352's boot log). */
const DEBUG_KEY = 'xnet:compact:last'
/**
 * Keep a margin below the confirmed cursor so an in-flight `setSyncCursor`
 * racing the prune can't leave a just-below-floor row unprunable-then-pruned,
 * and so only settled history is ever touched.
 */
const LAMPORT_MARGIN = 128
/** Rows deleted per worker op — small so a single DELETE can't monopolise a frame. */
const CHUNK = 2000
/** Cap per session; the rest is reclaimed on later boots (loop-until-dry). */
const MAX_CHUNKS_PER_SESSION = 25
/**
 * Freelist backlog (in pages, 8 KiB each — ≥ ~8 MiB) that triggers a reclaim
 * even on a pass that deleted nothing, healing pages stranded by earlier
 * interrupted or buggy passes.
 */
const RECLAIM_BACKLOG_PAGES = 1024

/** Current freelist size in pages; 0 when unreadable (skips backlog reclaim). */
async function freelistCount(sqliteAdapter: SQLiteAdapter): Promise<number> {
  try {
    const row = await sqliteAdapter.queryOne<{ freelist_count: number }>('PRAGMA freelist_count')
    return row?.freelist_count ?? 0
  } catch {
    return 0
  }
}

function killed(): boolean {
  try {
    return localStorage.getItem(KILL_SWITCH) === 'off'
  } catch {
    return false
  }
}

/**
 * Stop the pass early on the kill switch or when the tab is hidden. There is no
 * priority scheduler on the web adapter (ops are FIFO to the single worker), so
 * the only in-flight guard is small chunks + an idle yield between them; on top
 * of that we bail when the tab is backgrounded — `requestIdleCallback` is heavily
 * throttled there and the tab may be discarded mid-pass — and simply resume on
 * the next boot (loop-until-dry).
 */
function shouldStop(): boolean {
  if (killed()) return true
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return true
  return false
}

/** Yield until the main thread is next idle, so interactive ops preempt between chunks. */
function nextIdle(): Promise<void> {
  return new Promise((resolve) => {
    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
    }
    if (typeof win.requestIdleCallback === 'function') {
      win.requestIdleCallback(() => resolve(), { timeout: 2000 })
    } else {
      setTimeout(resolve, 50)
    }
  })
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

    // Prune one small chunk at a time, yielding the worker between chunks so a
    // landing read or user interaction always preempts. Stop when a chunk comes
    // back short (nothing left below the floor) or the per-session cap is hit.
    let deleted = 0
    for (let i = 0; i < MAX_CHUNKS_PER_SESSION; i++) {
      if (shouldStop()) break
      const { deleted: n } = await nodeStorage.pruneSupersededChanges(wsafe, {
        chunk: CHUNK,
        maxRows: CHUNK
      })
      deleted += n
      if (n < CHUNK) break // dry — nothing more to prune this pass
      await nextIdle()
    }

    // A DELETE only returns pages to the freelist; the OPFS file (whose size
    // gates the cold-open read) does not shrink until those pages are handed
    // back to the filesystem. Under `auto_vacuum=INCREMENTAL` (web.ts; converted
    // for pre-existing databases by the one-time boot VACUUM) incremental
    // vacuuming does exactly that, per pass — so the file shrinks a little every
    // idle boot as the log drains. A harmless no-op on a database still in
    // `auto_vacuum=NONE` (not yet converted); we deliberately do NOT re-arm the
    // full VACUUM here (exploration 0260).
    //
    // Reclaim also runs when this pass deleted nothing but a large freelist
    // backlog exists: earlier passes could strand freed pages (a hidden-tab
    // bail, or the one-page-per-exec reclaim bug fixed alongside
    // `incrementalVacuum`), and an already-drained log would otherwise leave
    // that backlog in the file forever.
    let reclaimed = false
    let freedPages = 0
    const backlogPages = deleted > 0 ? 0 : await freelistCount(sqliteAdapter)
    if (deleted > 0 || backlogPages >= RECLAIM_BACKLOG_PAGES) {
      try {
        if (typeof sqliteAdapter.incrementalVacuum === 'function') {
          // Steps the pragma to completion. `exec('PRAGMA incremental_vacuum')`
          // frees only ONE page per call on the WASM build (oo1 exec steps a
          // row-less statement once) — the adapter method is the correct path.
          freedPages = await sqliteAdapter.incrementalVacuum()
        } else {
          await sqliteAdapter.exec('PRAGMA incremental_vacuum')
        }
        reclaimed = true
      } catch (err) {
        // Reclaim is best-effort; the freed pages simply wait for a later pass.
        // eslint-disable-next-line no-console
        console.warn('[xNet] incremental_vacuum after compaction failed:', err)
      }
      // eslint-disable-next-line no-console
      console.info('[xNet] change-log compaction', { wsafe, deleted, reclaimed, freedPages })
    }

    try {
      localStorage.setItem(
        DEBUG_KEY,
        JSON.stringify({ wsafe, deleted, reclaimed, freedPages, at: Date.now() })
      )
    } catch {
      // best-effort instrumentation
    }
  } catch (err) {
    // Compaction is a best-effort space/perf optimisation; it must never break
    // the app. It simply retries next idle boot.
    // eslint-disable-next-line no-console
    console.warn('[xNet] change-log compaction failed:', err)
  }
}

/**
 * Schedule change-log compaction to run once the cold-open has settled (first
 * paint) and the main thread is idle. Safe to call on every boot; a no-op when
 * the kill switch is set or there is nothing to prune. Never touches the boot
 * critical path (exploration 0260).
 */
export function scheduleChangeLogCompaction(
  nodeStorage: SQLiteNodeStorageAdapter,
  sqliteAdapter: SQLiteAdapter
): void {
  if (typeof window === 'undefined') return
  if (killed()) return
  runWhenBootSettled(() => {
    void runCompaction(nodeStorage, sqliteAdapter)
  })
}
