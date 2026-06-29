/**
 * Instant-shell overlay for a landing list query (exploration 0249, F2).
 *
 * Wraps a live `useQuery` list result with the localStorage landing snapshot so
 * the surface paints in <1s on a cold boot instead of waiting on the single
 * SQLite worker's first cold read (~15s in the capture). While the live query is
 * still loading and has produced nothing, it returns the previous session's
 * snapshot rows; the instant the live result arrives it switches to live data,
 * writes the snapshot through for next time, and records the boot-timeline
 * `bridge:first-result` mark.
 *
 * It takes the already-called `useQuery` result rather than the schema, so the
 * caller keeps full query typing and this stays a thin, generic overlay.
 */
import { useEffect, useMemo } from 'react'
import { markBridgeFirstResult } from './boot-timeline'
import { readLandingRows, writeLandingRows, type LandingSnapshotRow } from './landing-snapshot'

/** The minimal shape this overlay needs from a `useQuery` list result. */
interface LiveListResult {
  data?: ReadonlyArray<{ id: string; title?: string; updatedAt: number }> | null
  loading: boolean
}

export interface InstantRowsResult {
  /** Rows to render now: live when available, else the snapshot. */
  rows: LandingSnapshotRow[]
  /** The underlying live query's loading state (unchanged). */
  loading: boolean
  /** True while the rows came from the snapshot rather than the live query. */
  fromSnapshot: boolean
}

export function useInstantRows(snapshotKey: string, live: LiveListResult): InstantRowsResult {
  // Read the snapshot once per key — it can't change under us between renders.
  const snapshot = useMemo(() => readLandingRows(snapshotKey), [snapshotKey])

  const liveRows = useMemo<LandingSnapshotRow[]>(
    () =>
      (live.data ?? []).map((node) => ({
        id: node.id,
        title: node.title,
        updatedAt: node.updatedAt
      })),
    [live.data]
  )

  // Live is authoritative once it has loaded (even if empty) or has any rows.
  const hasLive = !live.loading || liveRows.length > 0

  useEffect(() => {
    if (live.loading) return
    // Live resolved: persist for the next cold boot and mark the real first
    // result so the ~5s secondary gap stays attributable (0249).
    writeLandingRows(snapshotKey, liveRows)
    markBridgeFirstResult()
  }, [live.loading, liveRows, snapshotKey])

  if (hasLive) {
    return { rows: liveRows, loading: live.loading, fromSnapshot: false }
  }
  return { rows: snapshot ?? [], loading: live.loading, fromSnapshot: snapshot != null }
}
