/**
 * Coachmark tip registry (exploration 0206).
 *
 * A declarative, extensible store of first-run tips keyed by view. Core
 * seeds register at module load (see ./tips); any feature or bundled plugin
 * can call `contributeTips()` to add its own — onboarding grows with the
 * product without touching the engine.
 *
 * Everything here is pure and synchronous so it unit-tests without a DOM.
 */

/** A stable, versioned tip id. Bump the `@n` suffix to re-surface after a copy change. */
export type CoachTipId = `${string}@${number}`

export interface CoachTip {
  /** Stable, versioned id, e.g. `crm:overview@1`. */
  id: CoachTipId
  /**
   * The view this tip belongs to — a value from {@link viewIdForPath}
   * (`home` | `crm` | `tasks` | `data` | `database` | …). The tip auto-shows
   * the first time the user lands on a matching view.
   */
  view: string
  /**
   * CSS selector for the element to point at. Prefer the stable shell
   * anchors (`[data-coach="…"]`, `[data-wb-region="…"]`). If the element is
   * absent the tip silently waits until a later visit.
   */
  anchor: string
  /** Short headline (≤ ~40 chars). */
  title: string
  /** One or two sentences (≤ ~140 chars). */
  body: string
  /** Preferred placement relative to the anchor. Defaults to `bottom`. */
  side?: 'top' | 'right' | 'bottom' | 'left'
  /** Ordering within a view (lower first). Defaults to 0. */
  order?: number
}

const registry = new Map<string, CoachTip>()

/**
 * Register tips. Re-registering an id overwrites it (idempotent — safe to
 * call on every mount). Returns a disposer that removes exactly these tips.
 */
export function contributeTips(tips: readonly CoachTip[]): () => void {
  for (const tip of tips) registry.set(tip.id, tip)
  return () => {
    for (const tip of tips) registry.delete(tip.id)
  }
}

/** All tips registered for a view, ordered by `order` then registration. */
export function tipsForView(view: string): CoachTip[] {
  const out: CoachTip[] = []
  for (const tip of registry.values()) if (tip.view === view) out.push(tip)
  return out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

/** A view's tips minus the ones already dismissed — the show queue, in order. */
export function selectUnseenTips(view: string, seen: ReadonlySet<string>): CoachTip[] {
  return tipsForView(view).filter((tip) => !seen.has(tip.id))
}

/** Test helper: empty the registry. Not used by app code. */
export function __clearRegistry(): void {
  registry.clear()
}
