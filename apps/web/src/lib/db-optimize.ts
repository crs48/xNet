/**
 * Periodic query-planner statistics refresh (exploration 0264).
 *
 * `PRAGMA optimize` re-ANALYZEs only the tables the planner flagged as having
 * missing or stale statistics during this connection's lifetime, so it is
 * cheap by construction — but it has to actually RUN. Before 0264 it ran only
 * on close(), which a browser tab frequently never reaches (process kill,
 * tab discard), so long-lived databases accumulated skewed EAV distributions
 * the planner couldn't see: skip-scan never fired and index choice regressed
 * as the workspace grew.
 *
 * Cadence: first pass once the boot has settled (same idle gate as VACUUM and
 * change-log compaction — no background work is free on the single serial
 * SQLite worker, exploration 0260), then every OPTIMIZE_INTERVAL_MS while the
 * tab lives. `analysis_limit` is set at open (web.ts), bounding each pass.
 * Never throws.
 */
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { runWhenBootSettled } from './boot-timeline'

/** Re-run `PRAGMA optimize` this often (30 min) while the tab stays open. */
export const OPTIMIZE_INTERVAL_MS = 30 * 60 * 1000

function debugLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.info('[xNet] db optimize', ...args)
}

/** One bounded optimize pass. Exported for tests. */
export async function runOptimizePass(adapter: SQLiteAdapter): Promise<boolean> {
  try {
    if (!adapter.isOpen()) return false
    const startedAt = performance.now()
    await adapter.exec('PRAGMA optimize')
    debugLog({ durationMs: Math.round(performance.now() - startedAt) })
    return true
  } catch (err) {
    debugLog('skipped:', err)
    return false
  }
}

/**
 * Schedule the periodic optimize cadence: first pass after boot settles, then
 * every {@link OPTIMIZE_INTERVAL_MS}. Returns a cancel function (tests /
 * adapter teardown).
 */
export function schedulePeriodicOptimize(
  adapter: SQLiteAdapter,
  intervalMs: number = OPTIMIZE_INTERVAL_MS
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let cancelled = false

  const loop = (): void => {
    if (cancelled) return
    void runOptimizePass(adapter).finally(() => {
      if (cancelled) return
      timer = setTimeout(loop, intervalMs)
    })
  }

  runWhenBootSettled(() => {
    loop()
  })

  return () => {
    cancelled = true
    if (timer) clearTimeout(timer)
  }
}
