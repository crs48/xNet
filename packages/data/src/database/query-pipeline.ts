/**
 * Query pipeline for database rows.
 *
 * Executes filter -> sort -> group pipeline on rows.
 */

import type { ColumnDefinition } from './column-types'
import type { FilterGroup, SortConfig } from './view-types'
import { filterRows, type FilterableRow } from './filter-engine'
import { groupRows, type GroupableRow, type RowGroup, type GroupConfig } from './group-engine'
import { sortRows, type SortableRow } from './sort-engine'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A row that can be processed by the query pipeline.
 */
export interface QueryableRow extends FilterableRow, SortableRow, GroupableRow {
  id: string
  sortKey: string
  cells: Record<string, unknown>
}

/**
 * Query options for the pipeline.
 */
export interface QueryOptions {
  /** Filter configuration */
  filter?: FilterGroup | null
  /** Sort configurations (applied in order) */
  sorts?: SortConfig[]
  /** Group configuration */
  groupBy?: GroupConfig | null
  /** Maximum rows to return */
  limit?: number
  /** Offset for pagination */
  offset?: number
}

/**
 * Result of a query execution.
 */
export interface QueryResult<T extends QueryableRow = QueryableRow> {
  /** Grouped rows */
  groups: RowGroup<T>[]
  /** Total row count (before filtering) */
  total: number
  /** Filtered row count (after filtering, before pagination) */
  filtered: number
}

// ─── Query Execution ──────────────────────────────────────────────────────────

/**
 * Execute a full query pipeline: filter -> sort -> group.
 *
 * @param rows - Rows to query
 * @param columns - Column definitions for type information
 * @param options - Query options
 * @returns Query result with groups, total, and filtered counts
 *
 * @example
 * ```typescript
 * const result = executeQuery(rows, columns, {
 *   filter: { operator: 'and', conditions: [{ columnId: 'status', operator: 'equals', value: 'active' }] },
 *   sorts: [{ columnId: 'name', direction: 'asc' }],
 *   groupBy: { columnId: 'status' }
 * })
 * ```
 */
export function executeQuery<T extends QueryableRow>(
  rows: T[],
  columns: ColumnDefinition[],
  options: QueryOptions = {}
): QueryResult<T> {
  const { filter, sorts, groupBy, limit, offset } = options
  const total = rows.length

  // Step 1: Filter
  let result = filterRows(rows, columns, filter ?? null)
  const filtered = result.length

  // Step 2: Sort
  result = sortRows(result, columns, sorts ?? [])

  // Step 3: Paginate (before grouping for efficiency)
  if (offset !== undefined && offset > 0) {
    result = result.slice(offset)
  }
  if (limit !== undefined && limit > 0) {
    result = result.slice(0, limit)
  }

  // Step 4: Group
  const groups = groupRows(result, columns, groupBy ?? null)

  return {
    groups,
    total,
    filtered
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a simple query with just filtering.
 */
export function createFilterQuery(filter: FilterGroup): QueryOptions {
  return { filter }
}

/**
 * Create a simple query with just sorting.
 */
export function createSortQuery(sorts: SortConfig[]): QueryOptions {
  return { sorts }
}

/**
 * Create a paginated query.
 */
export function createPaginatedQuery(
  page: number,
  pageSize: number,
  options: Omit<QueryOptions, 'limit' | 'offset'> = {}
): QueryOptions {
  return {
    ...options,
    offset: page * pageSize,
    limit: pageSize
  }
}

/**
 * Flatten groups into a single array of rows.
 */
export function flattenGroups<T extends QueryableRow>(groups: RowGroup<T>[]): T[] {
  return groups.flatMap((g) => g.rows)
}

/**
 * Get total row count from groups.
 */
export function getTotalFromGroups<T extends QueryableRow>(groups: RowGroup<T>[]): number {
  return groups.reduce((sum, g) => sum + g.rows.length, 0)
}
