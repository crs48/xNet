/**
 * View type definitions for database views.
 *
 * Views are stored in the database's Y.Doc as a Y.Map of view configs,
 * enabling collaborative view editing and real-time sync.
 */

// ─── View Types ───────────────────────────────────────────────────────────────

/**
 * Available view types.
 */
export type ViewType = 'table' | 'board' | 'list' | 'gallery' | 'calendar' | 'timeline'

/**
 * View configuration stored in the database's Y.Doc.
 */
export interface ViewConfig {
  /** Unique view ID */
  id: string

  /** Display name */
  name: string

  /** View type */
  type: ViewType

  /** Column visibility and order */
  visibleColumns: string[]

  /** Per-column widths (overrides column.width) */
  columnWidths?: Record<string, number>

  /** Filter configuration */
  filters?: FilterGroup | null

  /** Sort configuration */
  sorts?: SortConfig[]

  /** Group by column ID */
  groupBy?: string | null

  /** Group sort direction */
  groupSort?: 'asc' | 'desc'

  /** Collapsed group IDs */
  collapsedGroups?: string[]

  // Gallery/Board specific
  /** Cover image column ID */
  coverColumn?: string

  /** Card size */
  cardSize?: 'small' | 'medium' | 'large'

  // Calendar/Timeline specific
  /** Start date column ID */
  dateColumn?: string

  /** End date column ID */
  endDateColumn?: string
}

// ─── Filter Types ─────────────────────────────────────────────────────────────

/**
 * A group of filter conditions combined with AND/OR.
 */
export interface FilterGroup {
  /** Logical operator */
  operator: 'and' | 'or'

  /** Conditions or nested groups */
  conditions: Array<FilterCondition | FilterGroup>
}

/**
 * A single filter condition.
 */
export interface FilterCondition {
  /** Column ID to filter on */
  columnId: string

  /** Filter operator */
  operator: FilterOperator

  /** Filter value (type depends on column type and operator) */
  value: unknown
}

/**
 * Available filter operators.
 */
export type FilterOperator =
  // Text/general
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'isEmpty'
  | 'isNotEmpty'
  // Number/date comparison
  | 'greaterThan'
  | 'lessThan'
  | 'greaterOrEqual'
  | 'lessOrEqual'
  // Date specific
  | 'before'
  | 'after'
  | 'between'
  // Multi-select/relation
  | 'hasAny'
  | 'hasAll'
  | 'hasNone'

// ─── Sort Types ───────────────────────────────────────────────────────────────

/**
 * Sort configuration for a column.
 */
export interface SortConfig {
  /** Column ID to sort by */
  columnId: string

  /** Sort direction */
  direction: 'asc' | 'desc'
}

// ─── Type Guards ──────────────────────────────────────────────────────────────

/**
 * Check if a filter item is a group (vs a condition).
 */
export function isFilterGroup(item: FilterCondition | FilterGroup): item is FilterGroup {
  return 'operator' in item && 'conditions' in item
}

/**
 * Check if a filter item is a condition (vs a group).
 */
export function isFilterCondition(item: FilterCondition | FilterGroup): item is FilterCondition {
  return 'columnId' in item
}

/**
 * Check if a view type supports grouping.
 */
export function supportsGrouping(type: ViewType): boolean {
  return type === 'table' || type === 'board' || type === 'list'
}

/**
 * Check if a view type requires a date column.
 */
export function requiresDateColumn(type: ViewType): boolean {
  return type === 'calendar' || type === 'timeline'
}
