/**
 * Filter engine for in-memory row filtering.
 *
 * Evaluates filter groups and conditions against database rows.
 */

import type { ColumnDefinition, ColumnType } from './column-types'
import type { FilterGroup, FilterCondition, FilterOperator } from './view-types'
import { isFilterGroup } from './view-types'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A database row with cells.
 */
export interface FilterableRow {
  id: string
  cells: Record<string, unknown>
}

// ─── Filter Execution ─────────────────────────────────────────────────────────

/**
 * Filter rows in memory using a filter group.
 *
 * @param rows - Rows to filter
 * @param columns - Column definitions for type information
 * @param filter - Filter group to apply (null returns all rows)
 * @returns Filtered rows
 *
 * @example
 * ```typescript
 * const filtered = filterRows(rows, columns, {
 *   operator: 'and',
 *   conditions: [
 *     { columnId: 'status', operator: 'equals', value: 'active' }
 *   ]
 * })
 * ```
 */
export function filterRows<T extends FilterableRow>(
  rows: T[],
  columns: ColumnDefinition[],
  filter: FilterGroup | null
): T[] {
  if (!filter || filter.conditions.length === 0) {
    return rows
  }

  return rows.filter((row) => evaluateGroup(row, columns, filter))
}

/**
 * Evaluate a filter group against a row.
 */
function evaluateGroup(
  row: FilterableRow,
  columns: ColumnDefinition[],
  group: FilterGroup
): boolean {
  if (group.conditions.length === 0) {
    return true
  }

  const results = group.conditions.map((condition) => {
    if (isFilterGroup(condition)) {
      // Nested group - recurse
      return evaluateGroup(row, columns, condition)
    }
    return evaluateCondition(row, columns, condition)
  })

  if (group.operator === 'and') {
    return results.every(Boolean)
  } else {
    return results.some(Boolean)
  }
}

/**
 * Evaluate a single filter condition against a row.
 */
function evaluateCondition(
  row: FilterableRow,
  columns: ColumnDefinition[],
  condition: FilterCondition
): boolean {
  const column = columns.find((c) => c.id === condition.columnId)
  if (!column) {
    // Skip unknown columns (treat as passing)
    return true
  }

  const cellValue = row.cells[condition.columnId]
  const filterValue = condition.value

  return evaluateOperator(cellValue, filterValue, condition.operator, column.type)
}

/**
 * Evaluate a filter operator.
 */
function evaluateOperator(
  cellValue: unknown,
  filterValue: unknown,
  operator: FilterOperator,
  columnType: ColumnType
): boolean {
  switch (operator) {
    // ─── Equality ─────────────────────────────────────────────────────────────
    case 'equals':
      return cellValue === filterValue

    case 'notEquals':
      return cellValue !== filterValue

    // ─── Text Operators ───────────────────────────────────────────────────────
    case 'contains':
      if (typeof cellValue === 'string') {
        return cellValue.toLowerCase().includes(String(filterValue).toLowerCase())
      }
      if (Array.isArray(cellValue)) {
        return cellValue.includes(filterValue)
      }
      return false

    case 'notContains':
      return !evaluateOperator(cellValue, filterValue, 'contains', columnType)

    case 'startsWith':
      return (
        typeof cellValue === 'string' &&
        cellValue.toLowerCase().startsWith(String(filterValue).toLowerCase())
      )

    case 'endsWith':
      return (
        typeof cellValue === 'string' &&
        cellValue.toLowerCase().endsWith(String(filterValue).toLowerCase())
      )

    // ─── Empty Operators ──────────────────────────────────────────────────────
    case 'isEmpty':
      return (
        cellValue === null ||
        cellValue === undefined ||
        cellValue === '' ||
        (Array.isArray(cellValue) && cellValue.length === 0)
      )

    case 'isNotEmpty':
      return !evaluateOperator(cellValue, null, 'isEmpty', columnType)

    // ─── Comparison Operators ─────────────────────────────────────────────────
    case 'greaterThan':
      return Number(cellValue) > Number(filterValue)

    case 'lessThan':
      return Number(cellValue) < Number(filterValue)

    case 'greaterOrEqual':
      return Number(cellValue) >= Number(filterValue)

    case 'lessOrEqual':
      return Number(cellValue) <= Number(filterValue)

    // ─── Date Operators ───────────────────────────────────────────────────────
    case 'before':
      if (cellValue == null) return false
      return new Date(cellValue as string) < new Date(filterValue as string)

    case 'after':
      if (cellValue == null) return false
      return new Date(cellValue as string) > new Date(filterValue as string)

    case 'between': {
      if (cellValue == null) return false
      const [start, end] = filterValue as [string, string]
      const date = new Date(cellValue as string)
      return date >= new Date(start) && date <= new Date(end)
    }

    // ─── Multi-Select Operators ───────────────────────────────────────────────
    case 'hasAny': {
      const anyValues = filterValue as unknown[]
      if (!Array.isArray(cellValue)) return false
      return anyValues.some((v) => cellValue.includes(v))
    }

    case 'hasAll': {
      const allValues = filterValue as unknown[]
      if (!Array.isArray(cellValue)) return false
      return allValues.every((v) => cellValue.includes(v))
    }

    case 'hasNone': {
      const noneValues = filterValue as unknown[]
      if (!Array.isArray(cellValue)) return true
      return !noneValues.some((v) => cellValue.includes(v))
    }

    default:
      // Unknown operator - treat as passing
      return true
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a simple equals filter.
 */
export function createEqualsFilter(columnId: string, value: unknown): FilterGroup {
  return {
    operator: 'and',
    conditions: [{ columnId, operator: 'equals', value }]
  }
}

/**
 * Create a filter that matches any of the given values.
 */
export function createAnyOfFilter(columnId: string, values: unknown[]): FilterGroup {
  return {
    operator: 'or',
    conditions: values.map((value) => ({
      columnId,
      operator: 'equals' as FilterOperator,
      value
    }))
  }
}

/**
 * Combine multiple filter groups with AND.
 */
export function combineFiltersAnd(filters: FilterGroup[]): FilterGroup {
  return {
    operator: 'and',
    conditions: filters
  }
}

/**
 * Combine multiple filter groups with OR.
 */
export function combineFiltersOr(filters: FilterGroup[]): FilterGroup {
  return {
    operator: 'or',
    conditions: filters
  }
}
