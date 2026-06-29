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
  /**
   * Whether a hub is configured. A "restoring from hub" affordance only makes
   * sense with a hub to restore from — without one an empty store is just a
   * genuinely new/empty workspace.
   */
  hubConfigured: boolean
}

/**
 * Probe the local store. Counts rows in `nodes`. On any failure it reports
 * `empty: false` so we never show a misleading "restoring" message — the
 * worst case degrades to a normal load.
 */
export async function probeStoreColdStart(
  adapter: Pick<SQLiteAdapter, 'queryOne'>,
  persisted: boolean | null,
  hubConfigured: boolean
): Promise<ColdStartProbe> {
  try {
    const row = await adapter.queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM nodes')
    return { empty: !row || Number(row.n) === 0, persisted, hubConfigured }
  } catch {
    return { empty: false, persisted, hubConfigured }
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

/**
 * Whether to offer a "restoring from hub" affordance: the cache looks evicted
 * AND a hub is configured to restore it from. Without a hub an empty store is
 * just a new workspace, so we must not imply data is on its way.
 */
export function shouldOfferRestore(probe: ColdStartProbe): boolean {
  return looksEvicted(probe) && probe.hubConfigured
}

let lastProbe: ColdStartProbe | null = null

// Subscribers (e.g. useRestoringFromHub via useSyncExternalStore). The probe is
// now recorded asynchronously — exploration 0249 moved it off the awaited boot
// path — so consumers must re-render when it lands rather than reading a value
// that was guaranteed-ready before first render.
const listeners = new Set<() => void>()

/** Subscribe to probe changes; returns an unsubscribe. */
export function subscribeColdStartProbe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Record the boot probe so views can read it without prop-threading. */
export function recordColdStartProbe(probe: ColdStartProbe): void {
  lastProbe = probe
  for (const listener of listeners) listener()
}

/** The most recent boot probe, or null before the boot probe has resolved. */
export function getColdStartProbe(): ColdStartProbe | null {
  return lastProbe
}

/** Test-only: clear the recorded probe and any subscribers. */
export function __resetColdStartProbe(): void {
  lastProbe = null
  listeners.clear()
}
