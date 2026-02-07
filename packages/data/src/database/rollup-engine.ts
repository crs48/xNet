/**
 * Rollup aggregation engine for computed columns.
 *
 * Rollups aggregate values from related rows via relation columns.
 * Supports count, sum, avg, min, max, concat, unique, and percentage functions.
 */

import type { CellValue } from './cell-types'
import type { RollupAggregation, RollupColumnConfig, ColumnDefinition } from './column-types'

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * A row with cells for rollup computation.
 */
export interface RollupRow {
  id: string
  databaseId: string
  cells: Record<string, CellValue>
}

/**
 * Context for rollup computation.
 */
export interface RollupContext {
  /** Get related rows for a row via a relation column */
  getRelatedRows: (rowId: string, relationColumnId: string) => Promise<RollupRow[]>

  /** Get column definitions for a database */
  getColumns: (databaseId: string) => Promise<ColumnDefinition[]>

  /** Get a specific column by ID */
  getColumn: (databaseId: string, columnId: string) => Promise<ColumnDefinition | undefined>
}

// ─── Aggregation Functions ───────────────────────────────────────────────────

/**
 * Aggregate an array of values using the specified function.
 */
export function aggregate(values: unknown[], aggregation: RollupAggregation): unknown {
  switch (aggregation) {
    case 'count':
      return values.length

    case 'sum':
      return values.reduce((sum: number, v) => sum + (Number(v) || 0), 0)

    case 'avg': {
      const nums = values.map(Number).filter((n) => !isNaN(n))
      if (nums.length === 0) return null
      return nums.reduce((a, b) => a + b, 0) / nums.length
    }

    case 'min': {
      const nums = values.map(Number).filter((n) => !isNaN(n))
      return nums.length > 0 ? Math.min(...nums) : null
    }

    case 'max': {
      const nums = values.map(Number).filter((n) => !isNaN(n))
      return nums.length > 0 ? Math.max(...nums) : null
    }

    case 'concat':
      return values
        .map(String)
        .filter((s) => s !== 'null' && s !== 'undefined' && s !== '')
        .join(', ')

    case 'unique':
      return [...new Set(values.map(String).filter((s) => s !== 'null' && s !== 'undefined'))]
        .length

    case 'empty':
      return values.filter((v) => v === null || v === undefined || v === '').length

    case 'notEmpty':
      return values.filter((v) => v !== null && v !== undefined && v !== '').length

    case 'percentEmpty': {
      if (values.length === 0) return 0
      const emptyCount = values.filter((v) => v === null || v === undefined || v === '').length
      return (emptyCount / values.length) * 100
    }

    case 'percentNotEmpty': {
      if (values.length === 0) return 0
      const nonEmptyCount = values.filter((v) => v !== null && v !== undefined && v !== '').length
      return (nonEmptyCount / values.length) * 100
    }

    default:
      return null
  }
}

/**
 * Get the default/empty value for an aggregation function.
 */
export function getEmptyValue(aggregation: RollupAggregation): unknown {
  switch (aggregation) {
    case 'count':
    case 'sum':
    case 'empty':
    case 'notEmpty':
    case 'unique':
      return 0
    case 'percentEmpty':
    case 'percentNotEmpty':
      return 0
    case 'concat':
      return ''
    case 'avg':
    case 'min':
    case 'max':
    default:
      return null
  }
}

// ─── Rollup Computation ──────────────────────────────────────────────────────

/**
 * Compute a rollup value for a row.
 *
 * @example
 * ```typescript
 * const value = await computeRollup(row, rollupColumn, context)
 * // Returns aggregated value from related rows
 * ```
 */
export async function computeRollup(
  row: RollupRow,
  rollupColumn: ColumnDefinition,
  context: RollupContext
): Promise<unknown> {
  if (rollupColumn.type !== 'rollup') {
    throw new Error(`Column ${rollupColumn.id} is not a rollup column`)
  }

  const config = rollupColumn.config as RollupColumnConfig

  // Get the relation column to find related rows
  const relationColumn = await context.getColumn(row.databaseId, config.relationColumn)

  if (!relationColumn || relationColumn.type !== 'relation') {
    return getEmptyValue(config.aggregation)
  }

  // Get related rows via the relation
  const relatedRows = await context.getRelatedRows(row.id, config.relationColumn)

  if (relatedRows.length === 0) {
    return getEmptyValue(config.aggregation)
  }

  // Extract values from the target column
  const values = relatedRows.map((r) => r.cells[config.targetColumn]).filter((v) => v !== undefined)

  // Aggregate
  return aggregate(values, config.aggregation)
}

/**
 * Batch compute rollups for multiple rows.
 *
 * @example
 * ```typescript
 * const results = await batchComputeRollups(rows, rollupColumn, context)
 * // Map<rowId, aggregatedValue>
 * ```
 */
export async function batchComputeRollups(
  rows: RollupRow[],
  rollupColumn: ColumnDefinition,
  context: RollupContext
): Promise<Map<string, unknown>> {
  const results = new Map<string, unknown>()

  // Compute in parallel for better performance
  await Promise.all(
    rows.map(async (row) => {
      const value = await computeRollup(row, rollupColumn, context)
      results.set(row.id, value)
    })
  )

  return results
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate a rollup column configuration.
 */
export function validateRollupConfig(
  config: RollupColumnConfig,
  columns: ColumnDefinition[]
): { valid: boolean; error?: string } {
  // Check relation column exists
  const relationColumn = columns.find((c) => c.id === config.relationColumn)
  if (!relationColumn) {
    return { valid: false, error: `Relation column '${config.relationColumn}' not found` }
  }

  if (relationColumn.type !== 'relation') {
    return { valid: false, error: `Column '${config.relationColumn}' is not a relation column` }
  }

  // Aggregation is always valid if it's a known type
  const validAggregations: RollupAggregation[] = [
    'sum',
    'avg',
    'count',
    'min',
    'max',
    'concat',
    'unique',
    'empty',
    'notEmpty',
    'percentEmpty',
    'percentNotEmpty'
  ]

  if (!validAggregations.includes(config.aggregation)) {
    return { valid: false, error: `Unknown aggregation: ${config.aggregation}` }
  }

  return { valid: true }
}

/**
 * Check if an aggregation function is numeric (requires number values).
 */
export function isNumericAggregation(aggregation: RollupAggregation): boolean {
  return ['sum', 'avg', 'min', 'max'].includes(aggregation)
}

/**
 * Get the result type for an aggregation function.
 */
export function getAggregationResultType(
  aggregation: RollupAggregation
): 'number' | 'text' | 'array' {
  switch (aggregation) {
    case 'concat':
      return 'text'
    case 'unique':
      return 'number' // Returns count of unique values
    default:
      return 'number'
  }
}
