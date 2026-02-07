/**
 * Sort engine for in-memory row sorting.
 *
 * Supports multi-column sorting with type-aware comparison.
 */

import type { ColumnDefinition, ColumnType } from './column-types'
import type { SortConfig } from './view-types'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A database row with cells and sortKey.
 */
export interface SortableRow {
  id: string
  sortKey: string
  cells: Record<string, unknown>
}

// ─── Sort Execution ───────────────────────────────────────────────────────────

/**
 * Sort rows in memory using multi-column sort config.
 *
 * @param rows - Rows to sort
 * @param columns - Column definitions for type information
 * @param sorts - Sort configurations (applied in order)
 * @returns Sorted rows (new array)
 *
 * @example
 * ```typescript
 * const sorted = sortRows(rows, columns, [
 *   { columnId: 'status', direction: 'asc' },
 *   { columnId: 'name', direction: 'desc' }
 * ])
 * ```
 */
export function sortRows<T extends SortableRow>(
  rows: T[],
  columns: ColumnDefinition[],
  sorts: SortConfig[]
): T[] {
  if (!sorts || sorts.length === 0) {
    // Default sort by sortKey (fractional index)
    return [...rows].sort((a, b) => a.sortKey.localeCompare(b.sortKey))
  }

  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const column = columns.find((c) => c.id === sort.columnId)
      if (!column) continue

      const aValue = a.cells[sort.columnId]
      const bValue = b.cells[sort.columnId]

      const comparison = compareValues(aValue, bValue, column.type)

      if (comparison !== 0) {
        return sort.direction === 'asc' ? comparison : -comparison
      }
    }

    // Fallback to sortKey for stable sorting
    return a.sortKey.localeCompare(b.sortKey)
  })
}

/**
 * Compare two values based on column type.
 */
function compareValues(a: unknown, b: unknown, type: ColumnType): number {
  // Handle null/undefined - nulls sort last
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1

  switch (type) {
    // ─── Text Types ───────────────────────────────────────────────────────────
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
      return String(a).localeCompare(String(b))

    // ─── Number Type ──────────────────────────────────────────────────────────
    case 'number':
      return Number(a) - Number(b)

    // ─── Checkbox Type ────────────────────────────────────────────────────────
    case 'checkbox':
      // false (0) before true (1)
      return (a ? 1 : 0) - (b ? 1 : 0)

    // ─── Date Types ───────────────────────────────────────────────────────────
    case 'date':
    case 'dateRange':
    case 'created':
    case 'updated':
      return new Date(a as string).getTime() - new Date(b as string).getTime()

    // ─── Array Types ──────────────────────────────────────────────────────────
    case 'multiSelect':
    case 'relation':
      // Sort by array length
      return (a as unknown[]).length - (b as unknown[]).length

    // ─── Person Type ──────────────────────────────────────────────────────────
    case 'person':
    case 'createdBy':
    case 'updatedBy':
      return String(a).localeCompare(String(b))

    // ─── File Type ────────────────────────────────────────────────────────────
    case 'file': {
      // Sort by filename if available
      const aFile = a as { name?: string } | null
      const bFile = b as { name?: string } | null
      return (aFile?.name ?? '').localeCompare(bFile?.name ?? '')
    }

    // ─── Rich Text ────────────────────────────────────────────────────────────
    case 'richText':
      // Can't meaningfully sort rich text
      return 0

    // ─── Computed Types ───────────────────────────────────────────────────────
    case 'rollup':
    case 'formula':
      // These should be sorted by their computed value type
      // For now, treat as text
      return String(a).localeCompare(String(b))

    default:
      return 0
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a single-column sort config.
 */
export function createSort(columnId: string, direction: 'asc' | 'desc' = 'asc'): SortConfig {
  return { columnId, direction }
}

/**
 * Toggle sort direction.
 */
export function toggleSortDirection(direction: 'asc' | 'desc'): 'asc' | 'desc' {
  return direction === 'asc' ? 'desc' : 'asc'
}

/**
 * Add or update a sort in a sort list.
 * If the column already exists, toggles direction.
 * If it doesn't exist, adds it at the beginning.
 */
export function addOrToggleSort(sorts: SortConfig[], columnId: string): SortConfig[] {
  const existing = sorts.find((s) => s.columnId === columnId)

  if (existing) {
    // Toggle direction
    return sorts.map((s) =>
      s.columnId === columnId ? { ...s, direction: toggleSortDirection(s.direction) } : s
    )
  }

  // Add new sort at beginning
  return [{ columnId, direction: 'asc' }, ...sorts]
}

/**
 * Remove a sort from a sort list.
 */
export function removeSort(sorts: SortConfig[], columnId: string): SortConfig[] {
  return sorts.filter((s) => s.columnId !== columnId)
}
