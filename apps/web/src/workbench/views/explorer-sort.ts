/**
 * Explorer list sorting (exploration 0190) — pure and unit-tested.
 *
 * Controls only the order of the flat list (Unfiled / Results). The folder
 * tree keeps its own fractional `sortKey` order; this never touches it. Title
 * sorting uses `localeCompare` (display order) — distinct from the code-unit
 * `sortKey` collation invariant, which applies only to fractional sort keys.
 */
export type ExplorerSort = 'recent' | 'created' | 'name' | 'type'

export const EXPLORER_SORTS: Array<{ id: ExplorerSort; label: string }> = [
  { id: 'recent', label: 'Recent' },
  { id: 'created', label: 'Created' },
  { id: 'name', label: 'A–Z' },
  { id: 'type', label: 'Type' }
]

interface SortableItem {
  title: string
  type: string
  updatedAt: number
  createdAt?: number
}

const byRecency = (a: SortableItem, b: SortableItem) => b.updatedAt - a.updatedAt
const byCreation = (a: SortableItem, b: SortableItem) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
const titleOf = (item: SortableItem) => (item.title || 'Untitled').toLowerCase()

/** Return a new array ordered by the chosen sort (recency-tiebroken). */
export function sortExplorerItems<T extends SortableItem>(items: T[], sort: ExplorerSort): T[] {
  const copy = items.slice()
  switch (sort) {
    case 'created':
      return copy.sort((a, b) => byCreation(a, b) || byRecency(a, b))
    case 'name':
      return copy.sort((a, b) => titleOf(a).localeCompare(titleOf(b)) || byRecency(a, b))
    case 'type':
      return copy.sort((a, b) => a.type.localeCompare(b.type) || byRecency(a, b))
    case 'recent':
    default:
      return copy.sort(byRecency)
  }
}
