/**
 * Explorer list filtering (0166) — pure and unit-tested.
 */
export interface ExplorerFilterable {
  title: string
  type: string
}

function matchesType(item: ExplorerFilterable, filter: string): boolean {
  return filter === 'all' || item.type === filter
}

function matchesText(item: ExplorerFilterable, needle: string): boolean {
  if (!needle) return true
  return (item.title || 'untitled').toLowerCase().includes(needle)
}

export function filterExplorerItems<T extends ExplorerFilterable>(
  items: T[],
  filter: string,
  search: string
): T[] {
  const needle = search.trim().toLowerCase()
  return items.filter((item) => matchesType(item, filter) && matchesText(item, needle))
}
