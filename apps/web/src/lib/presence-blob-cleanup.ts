/**
 * One-time cleanup of the stale presence Yjs blob (exploration 0229).
 *
 * Exploration 0227 made workspace presence docs (`presence-*`) ephemeral —
 * never persisted going forward — but it never deleted the *existing* blob.
 * Because presence was a `gc:false` doc written on every awareness tick, that
 * historical blob can be hundreds of MB, and it still inflates the OPFS
 * `xnet.db` file, raising the cold-read cost of every boot. This deletes those
 * rows once and reclaims the space with a single `VACUUM`.
 *
 * Runs once per origin (gated by a localStorage flag), only VACUUMs when a row
 * was actually removed (so machines without the stale blob pay nothing), and is
 * gated behind `bootSettled()` (first paint) + a real idle slot so the heavy
 * `DELETE`/`VACUUM` never lands on the single SQLite worker while the cold-open
 * read burst is still draining it (exploration 0260). Never throws.
 */
import type { SQLiteAdapter } from '@xnetjs/sqlite'
import { runWhenBootSettled } from './boot-timeline'

const CLEANUP_FLAG = 'xnet:presence-blob-vacuumed:v1'

function debugLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.info('[xNet] presence-blob cleanup', ...args)
}

async function runCleanup(adapter: SQLiteAdapter): Promise<void> {
  try {
    const beforeBytes = await adapter.getDatabaseSize().catch(() => 0)
    const result = await adapter.run("DELETE FROM yjs_state WHERE node_id LIKE 'presence-%'")
    const removed = result?.changes ?? 0
    if (removed > 0) {
      await adapter.vacuum()
    }
    const afterBytes = await adapter.getDatabaseSize().catch(() => 0)
    try {
      localStorage.setItem(CLEANUP_FLAG, '1')
    } catch {
      // ignore: persistence of the flag is best-effort
    }
    debugLog('done', { removed, beforeBytes, afterBytes })
  } catch (err) {
    // A failed cleanup must never break the app; it retries next boot.
    // eslint-disable-next-line no-console
    console.warn('[xNet] presence-blob cleanup failed:', err)
  }
}

/**
 * Schedule the one-time stale-presence cleanup once the cold-open has settled
 * (first paint) and the main thread is idle. Safe to call on every boot — it
 * no-ops once the flag is set, and never competes with the boot read burst for
 * the single SQLite worker (exploration 0260).
 */
export function scheduleStalePresenceCleanup(adapter: SQLiteAdapter): void {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem(CLEANUP_FLAG)) return
  } catch {
    return
  }
  runWhenBootSettled(() => {
    void runCleanup(adapter)
  })
}
