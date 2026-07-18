/**
 * The one-tree contracts (exploration 0353).
 *
 * Nine hand-rolled left navs collapse into ONE tree over the node graph,
 * projected through **lenses**. This is the shape every surviving
 * unified sidebar converged on independently (Anytype Sets, Tana search
 * nodes, Linear Views, Slack sections): never a flat undifferentiated
 * list of mixed types, always one store + a lens that scopes and sorts.
 *
 * Two rules encoded here, both learned from chat-in-a-doc-tree failures:
 *
 * 1. **Sort policy is per row, not per tree.** Chat rows want recency
 *    with an unread bump (something just happened); document rows want
 *    a stable manual order (a tree that reshuffles under your cursor
 *    every time a peer edits is unusable).
 * 2. **Mute suppresses badge AND bump together.** Shipping those as
 *    two independent flags is a recurring, reported bug class
 *    (Telegram's muted-chat-still-badges issue); one flag, one meaning.
 */
import type { LucideIcon } from 'lucide-react'
import type { TabNodeType } from '../state'

/**
 * How a row orders itself within its section. `recency` rows float to
 * the top on activity (and on unread, unless muted); `manual` rows hold
 * their place.
 */
export type SidebarSortPolicy = 'recency' | 'manual'

/** One row in the unified tree, whatever its underlying schema. */
export interface SidebarRowModel {
  /** Node id — also the navigation target. */
  id: string
  /** Drives icon + route via TAB_VIEWS; keeps rows type-legible (scent). */
  nodeType: TabNodeType
  title: string
  /** Unread count. Suppressed entirely when muted. */
  badge?: number
  /** Chat-grade presence, when the source has it. */
  presence?: 'online' | 'away' | null
  sortPolicy: SidebarSortPolicy
  /** Fractional order for `manual` rows (code-unit collation). */
  sortKey?: string
  /** Last activity for `recency` rows. */
  updatedAt: number
  /**
   * Muted rows neither badge nor bump — one flag, both effects, so the
   * two can never drift apart.
   */
  muted?: boolean
  /** Optional grouping hints reused from the Explorer's model. */
  space?: string | null
  folder?: string | null
  tags?: string[]
  /** Icon override; defaults to the nodeType's TAB_VIEWS icon. */
  icon?: LucideIcon
}

/**
 * A source of rows — "documents", "channels", "people". Sources are
 * registered, so a plugin can contribute rows to the one tree without
 * minting a tenth nav.
 */
export interface SidebarRowSource {
  id: string
  label: string
  /**
   * Live rows. A hook (not a promise) so rows stay reactive through the
   * ordinary useQuery path; called only when a mounted lens includes
   * this source, so an inactive lens costs nothing.
   */
  useRows: () => SidebarRowModel[]
}

/** A lens: which sources participate, and how their rows are ordered. */
export interface SidebarLens {
  id: string
  label: string
  /** Source ids this lens draws from; empty = every registered source. */
  sources: string[]
  /**
   * Sort policy override for the whole lens. Absent = each row's own
   * policy applies (the mixed case, e.g. the All lens).
   */
  sortPolicy?: SidebarSortPolicy
}

/**
 * Effective badge for a row: muted rows never badge, regardless of the
 * count the source reports.
 */
export function effectiveBadge(row: SidebarRowModel): number | null {
  if (row.muted) return null
  return row.badge && row.badge > 0 ? row.badge : null
}

/**
 * Whether a row should bump to the top of a recency section. Unread
 * bumps, but muting suppresses it — the same flag that hides the badge.
 */
export function shouldBump(row: SidebarRowModel): boolean {
  return row.sortPolicy === 'recency' && !row.muted && (row.badge ?? 0) > 0
}

/**
 * Order rows for a lens. Recency rows sort by unread-bump then
 * activity; manual rows by fractional sortKey (code units — never
 * localeCompare, per the sortKey collation invariant), then title.
 */
export function sortSidebarRows(
  rows: readonly SidebarRowModel[],
  lens?: Pick<SidebarLens, 'sortPolicy'>
): SidebarRowModel[] {
  const policyFor = (row: SidebarRowModel): SidebarSortPolicy => lens?.sortPolicy ?? row.sortPolicy

  return [...rows].sort((a, b) => {
    const policyA = policyFor(a)
    const policyB = policyFor(b)

    // Mixed lenses keep recency rows (chat) above manual rows (docs):
    // activity is the thing that just changed and wants attention.
    if (policyA !== policyB) return policyA === 'recency' ? -1 : 1

    if (policyA === 'recency') {
      const bumpA = shouldBump(a)
      const bumpB = shouldBump(b)
      if (bumpA !== bumpB) return bumpA ? -1 : 1
      return b.updatedAt - a.updatedAt
    }

    const keyA = a.sortKey ?? ''
    const keyB = b.sortKey ?? ''
    if (keyA !== keyB) return keyA < keyB ? -1 : 1
    return a.title.localeCompare(b.title)
  })
}
