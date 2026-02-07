/**
 * Filter operators by column type.
 *
 * Maps each column type to the filter operators that are valid for that type.
 */

import type { ColumnType } from './column-types'
import type { FilterOperator } from './view-types'

// ─── Operators by Type ────────────────────────────────────────────────────────

/**
 * Valid filter operators for each column type.
 */
export const OPERATORS_BY_TYPE: Record<ColumnType, FilterOperator[]> = {
  text: [
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'startsWith',
    'endsWith',
    'isEmpty',
    'isNotEmpty'
  ],
  number: [
    'equals',
    'notEquals',
    'greaterThan',
    'lessThan',
    'greaterOrEqual',
    'lessOrEqual',
    'between',
    'isEmpty',
    'isNotEmpty'
  ],
  checkbox: ['equals'],
  date: ['equals', 'before', 'after', 'between', 'isEmpty', 'isNotEmpty'],
  dateRange: ['before', 'after', 'between', 'isEmpty', 'isNotEmpty'],
  select: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'],
  multiSelect: ['hasAny', 'hasAll', 'hasNone', 'isEmpty', 'isNotEmpty'],
  person: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'],
  url: ['isEmpty', 'isNotEmpty', 'contains'],
  email: ['isEmpty', 'isNotEmpty', 'contains'],
  phone: ['isEmpty', 'isNotEmpty'],
  file: ['isEmpty', 'isNotEmpty'],
  relation: ['contains', 'notContains', 'isEmpty', 'isNotEmpty'],
  rollup: [], // Rollups use the result type's operators
  formula: [], // Formulas use the result type's operators
  richText: ['isEmpty', 'isNotEmpty', 'contains'],
  created: ['before', 'after', 'between'],
  createdBy: ['equals', 'notEquals'],
  updated: ['before', 'after', 'between'],
  updatedBy: ['equals', 'notEquals']
}

// ─── Operator Labels ──────────────────────────────────────────────────────────

/**
 * Human-readable labels for filter operators.
 */
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  equals: 'equals',
  notEquals: 'does not equal',
  contains: 'contains',
  notContains: 'does not contain',
  startsWith: 'starts with',
  endsWith: 'ends with',
  isEmpty: 'is empty',
  isNotEmpty: 'is not empty',
  greaterThan: 'greater than',
  lessThan: 'less than',
  greaterOrEqual: 'at least',
  lessOrEqual: 'at most',
  before: 'before',
  after: 'after',
  between: 'between',
  hasAny: 'has any of',
  hasAll: 'has all of',
  hasNone: 'has none of'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get valid operators for a column type.
 */
export function getOperatorsForType(type: ColumnType): FilterOperator[] {
  return OPERATORS_BY_TYPE[type] ?? []
}

/**
 * Check if an operator is valid for a column type.
 */
export function isValidOperator(type: ColumnType, operator: FilterOperator): boolean {
  return OPERATORS_BY_TYPE[type]?.includes(operator) ?? false
}

/**
 * Get the human-readable label for an operator.
 */
export function getOperatorLabel(operator: FilterOperator): string {
  return OPERATOR_LABELS[operator] ?? operator
}

/**
 * Check if an operator requires a value.
 */
export function operatorRequiresValue(operator: FilterOperator): boolean {
  return !['isEmpty', 'isNotEmpty'].includes(operator)
}
