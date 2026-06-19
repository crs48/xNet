/**
 * Coachmark engine hook (exploration 0206) — the structural twin of
 * `useWhatsNew`. Picks at most one unseen tip for the active view, serialized
 * app-wide, capped per session, and writes "seen" back to the persisted
 * workbench store on dismiss.
 *
 * Guardrails baked in (not left to tip authors):
 *  - one tip at a time, across the whole app;
 *  - fire on first *visit* to a view, never on a timer;
 *  - at most `max` brand-new tips surfaced per session, so a long-dormant
 *    user who reopens many views isn't buried in popups.
 */
import { useCallback, useEffect, useMemo } from 'react'
import { useWorkbench } from '../workbench/state'
import { selectUnseenTips, type CoachTip } from './registry'

/**
 * Tip ids surfaced this browser session. Module-level on purpose: it's the
 * unit of "this session", survives view remounts, and resets on reload.
 */
const sessionShown = new Set<string>()

/** Settings → Replay calls this so suppressed/dismissed tips can show again now. */
export function resetCoachSession(): void {
  sessionShown.clear()
}

export interface CoachmarksApi {
  /** The tip to display now, or null. */
  current: CoachTip | null
  /** Mark the current tip seen (persisted) and advance. */
  dismiss: () => void
  /** Unseen tips still queued for this view after the current one. */
  remaining: number
}

export function useCoachmarks(
  view: string,
  options: { enabled?: boolean; max?: number } = {}
): CoachmarksApi {
  const { enabled = true, max = 2 } = options
  const seen = useWorkbench((s) => s.seenTips)
  const markTipSeen = useWorkbench((s) => s.markTipSeen)

  const queue = useMemo(() => {
    if (!enabled) return [] as CoachTip[]
    return selectUnseenTips(view, new Set(seen))
  }, [enabled, view, seen])

  // First still-showable tip: one already surfaced this session keeps showing;
  // otherwise a fresh one only if we're under the per-session cap.
  const current = useMemo(() => {
    for (const tip of queue) {
      if (sessionShown.has(tip.id)) return tip
      if (sessionShown.size < max) return tip
    }
    return null
  }, [queue, max])

  useEffect(() => {
    if (current) sessionShown.add(current.id)
  }, [current])

  const dismiss = useCallback(() => {
    if (current) markTipSeen(current.id)
  }, [current, markTipSeen])

  return { current, dismiss, remaining: Math.max(0, queue.length - 1) }
}
