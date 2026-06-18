/**
 * Cold-start probe for the local node store (exploration 0204).
 *
 * The app is local-first: a returning user's data lives durably in SQLite
 * (OPFS) and should paint before the hub connects. But OPFS is best-effort
 * and the browser evicts unpersisted origins (Safari after ~7 days idle,
 * Chromium under storage pressure). After an eviction the local store is
 * EMPTY, so the UI is effectively remote-first — data only appears once the
 * hub re-syncs, which looks like "nothing renders until the dot goes green".
 *
 * This probes, once at boot, whether the node table is empty and whether the
 * origin is persisted. Views read the result to choose skeleton-vs-spinner
 * and to surface a "restoring from hub" affordance instead of a blank screen.
 */
import type { SQLiteAdapter } from '@xnetjs/sqlite'

export interface ColdStartProbe {
  /** True when the local node store has zero rows at boot. */
  empty: boolean
  /** Whether storage is persisted (eviction-safe). null when unknown. */
  persisted: boolean | null
}

/**
 * Probe the local store. Counts rows in `nodes`. On any failure it reports
 * `empty: false` so we never show a misleading "restoring" message — the
 * worst case degrades to a normal load.
 */
export async function probeStoreColdStart(
  adapter: Pick<SQLiteAdapter, 'queryOne'>,
  persisted: boolean | null
): Promise<ColdStartProbe> {
  try {
    const row = await adapter.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM nodes')
    return { empty: !row || Number(row.n) === 0, persisted }
  } catch {
    return { empty: false, persisted }
  }
}

/**
 * The cache looks evicted when it is empty locally but the origin is not
 * persisted — the signature of a browser-evicted store rather than a
 * genuinely new/empty workspace.
 */
export function looksEvicted(probe: ColdStartProbe): boolean {
  return probe.empty && probe.persisted === false
}

let lastProbe: ColdStartProbe | null = null

/** Record the boot probe so views can read it without prop-threading. */
export function recordColdStartProbe(probe: ColdStartProbe): void {
  lastProbe = probe
}

/** The most recent boot probe, or null before the boot probe has run. */
export function getColdStartProbe(): ColdStartProbe | null {
  return lastProbe
}

/** Test-only: clear the recorded probe. */
export function __resetColdStartProbe(): void {
  lastProbe = null
}
