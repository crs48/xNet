/**
 * Group engine for in-memory row grouping.
 *
 * Groups rows by column value and calculates aggregates.
 */

import type { ColumnDefinition, SelectColumnConfig } from './column-types'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A database row with cells.
 */
export interface GroupableRow {
  id: string
  cells: Record<string, unknown>
}

/**
 * Group configuration.
 */
export interface GroupConfig {
  /** Column ID to group by */
  columnId: string
  /** Sort direction for groups */
  sort?: 'asc' | 'desc'
  /** Collapsed group keys */
  collapsedGroups?: string[]
}

/**
 * A group of rows.
 */
export interface RowGroup<T extends GroupableRow = GroupableRow> {
  /** Group key (column value or special key like '_empty') */
  key: string
  /** Display label */
  label: string
  /** Group color (for select columns) */
  color?: string
  /** Rows in this group */
  rows: T[]
  /** Calculated aggregates */
  aggregates: GroupAggregates
  /** Whether this group is collapsed */
  collapsed?: boolean
}

/**
 * Aggregate values for a group.
 */
export interface GroupAggregates {
  /** Row count */
  count: number
  /** Sum of number columns (keyed by columnId_sum) */
  [key: string]: number | undefined
}

// ─── Group Execution ──────────────────────────────────────────────────────────

/**
 * Group rows by a column value.
 *
 * @param rows - Rows to group
 * @param columns - Column definitions for type information
 * @param groupBy - Group configuration (null returns single group with all rows)
 * @returns Array of row groups
 *
 * @example
 * ```typescript
 * const groups = groupRows(rows, columns, { columnId: 'status' })
 * // Returns: [{ key: 'active', label: 'Active', rows: [...] }, ...]
 * ```
 */
export function groupRows<T extends GroupableRow>(
  rows: T[],
  columns: ColumnDefinition[],
  groupBy: GroupConfig | null
): RowGroup<T>[] {
  if (!groupBy) {
    return [
      {
        key: '_all',
        label: 'All Items',
        rows,
        aggregates: calculateAggregates(rows, columns)
      }
    ]
  }

  const column = columns.find((c) => c.id === groupBy.columnId)
  if (!column) {
    return [
      {
        key: '_all',
        label: 'All Items',
        rows,
        aggregates: calculateAggregates(rows, columns)
      }
    ]
  }

  // Get all possible group keys
  const groupKeys = getGroupKeys(rows, column)

  // Sort group keys
  const sortedKeys = sortGroupKeys(groupKeys, groupBy.sort ?? 'asc', column)

  // Build groups
  const groups: RowGroup<T>[] = sortedKeys.map((key) => {
    const groupRows = rows.filter((row) => {
      const value = row.cells[groupBy.columnId]
      return getGroupKey(value, column) === key
    })

    return {
      key,
      label: getGroupLabel(key, column),
      color: getGroupColor(key, column),
      rows: groupRows,
      aggregates: calculateAggregates(groupRows, columns),
      collapsed: groupBy.collapsedGroups?.includes(key)
    }
  })

  return groups
}

// ─── Group Key Helpers ────────────────────────────────────────────────────────

/**
 * Get all unique group keys from rows.
 */
function getGroupKeys(rows: GroupableRow[], column: ColumnDefinition): Set<string> {
  const keys = new Set<string>()

  for (const row of rows) {
    const value = row.cells[column.id]
    keys.add(getGroupKey(value, column))
  }

  // Add empty options for select columns (so empty groups show)
  if (column.type === 'select') {
    const config = column.config as SelectColumnConfig
    for (const option of config.options) {
      keys.add(option.id)
    }
  }

  return keys
}

/**
 * Get the group key for a cell value.
 */
function getGroupKey(value: unknown, column: ColumnDefinition): string {
  if (value == null || value === '') {
    return '_empty'
  }

  switch (column.type) {
    case 'select':
      return String(value)

    case 'checkbox':
      return value ? 'checked' : 'unchecked'

    case 'person':
    case 'createdBy':
    case 'updatedBy':
      return String(value)

    case 'date':
    case 'created':
    case 'updated':
      // Group by date (day)
      return new Date(value as string).toISOString().split('T')[0]

    case 'multiSelect':
      // For multiSelect, use first value or empty
      if (Array.isArray(value) && value.length > 0) {
        return String(value[0])
      }
      return '_empty'

    default:
      return String(value)
  }
}

/**
 * Sort group keys.
 */
function sortGroupKeys(
  keys: Set<string>,
  direction: 'asc' | 'desc',
  column: ColumnDefinition
): string[] {
  const keyArray = Array.from(keys)

  // For select columns, use option order
  if (column.type === 'select') {
    const config = column.config as SelectColumnConfig
    const optionOrder = new Map(config.options.map((o, i) => [o.id, i]))

    keyArray.sort((a, b) => {
      // Empty always last
      if (a === '_empty') return 1
      if (b === '_empty') return -1

      const aOrder = optionOrder.get(a) ?? Infinity
      const bOrder = optionOrder.get(b) ?? Infinity

      return direction === 'asc' ? aOrder - bOrder : bOrder - aOrder
    })

    return keyArray
  }

  // Default alphabetical sort
  keyArray.sort((a, b) => {
    // Empty always last
    if (a === '_empty') return 1
    if (b === '_empty') return -1

    const comparison = a.localeCompare(b)
    return direction === 'asc' ? comparison : -comparison
  })

  return keyArray
}

/**
 * Get the display label for a group key.
 */
function getGroupLabel(key: string, column: ColumnDefinition): string {
  if (key === '_empty') {
    return 'Empty'
  }

  if (key === '_all') {
    return 'All Items'
  }

  if (column.type === 'select') {
    const config = column.config as SelectColumnConfig
    const option = config.options.find((o) => o.id === key)
    return option?.name ?? key
  }

  if (column.type === 'checkbox') {
    return key === 'checked' ? 'Checked' : 'Unchecked'
  }

  return key
}

/**
 * Get the color for a group key.
 */
function getGroupColor(key: string, column: ColumnDefinition): string | undefined {
  if (column.type === 'select') {
    const config = column.config as SelectColumnConfig
    const option = config.options.find((o) => o.id === key)
    return option?.color
  }
  return undefined
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

/**
 * Calculate aggregates for a group of rows.
 */
function calculateAggregates(rows: GroupableRow[], columns: ColumnDefinition[]): GroupAggregates {
  const aggregates: GroupAggregates = {
    count: rows.length
  }

  // Calculate aggregates for number columns
  for (const column of columns) {
    if (column.type === 'number') {
      const values = rows
        .map((r) => r.cells[column.id])
        .filter((v): v is number => typeof v === 'number')

      if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0)
        aggregates[`${column.id}_sum`] = sum
        aggregates[`${column.id}_avg`] = sum / values.length
        aggregates[`${column.id}_min`] = Math.min(...values)
        aggregates[`${column.id}_max`] = Math.max(...values)
      }
    }

    // Count non-empty for checkbox columns
    if (column.type === 'checkbox') {
      const checked = rows.filter((r) => r.cells[column.id] === true).length
      aggregates[`${column.id}_checked`] = checked
      aggregates[`${column.id}_unchecked`] = rows.length - checked
    }
  }

  return aggregates
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Toggle a group's collapsed state.
 */
export function toggleGroupCollapsed(
  collapsedGroups: string[] | undefined,
  groupKey: string
): string[] {
  const current = collapsedGroups ?? []

  if (current.includes(groupKey)) {
    return current.filter((k) => k !== groupKey)
  }

  return [...current, groupKey]
}

/**
 * Expand all groups.
 */
export function expandAllGroups(): string[] {
  return []
}

/**
 * Collapse all groups.
 */
export function collapseAllGroups<T extends GroupableRow>(groups: RowGroup<T>[]): string[] {
  return groups.map((g) => g.key)
}
