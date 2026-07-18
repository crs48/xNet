/**
 * Summary engine for the database grid's footer bar (Airtable parity).
 *
 * Pure, store-agnostic per-column aggregations: given the rows currently in
 * view, a column, and a chosen {@link SummaryFunction}, compute one footer
 * value. Type-aware — `SUMMARY_FUNCTIONS_BY_TYPE` lists which functions a
 * given column type may offer. Numbers add sum/average/min/max/range/median;
 * checkboxes add checked/unchecked; dates add earliest/latest; every type
 * offers the count family (filled/empty/unique and their percentages).
 *
 * Kept deliberately free of React/Y.Doc/NodeStore so it is trivially unit
 * tested and shared by `GridSummaryBar` and any future query-result footer.
 */

import type { ColumnType } from './column-types'

// ─── Types ──────────────────────────────────────────────────────────────────

/** A row reduced to the cells the summary bar reads. */
export interface SummaryRow {
  cells: Record<string, unknown>
}

/** The minimum a summary needs to know about a column. */
export interface SummaryColumnLike {
  id: string
  type: ColumnType
}

/** A footer aggregation. `none` renders nothing. */
export type SummaryFunction =
  | 'none'
  | 'filled'
  | 'empty'
  | 'percentFilled'
  | 'percentEmpty'
  | 'unique'
  | 'sum'
  | 'average'
  | 'min'
  | 'max'
  | 'range'
  | 'median'
  | 'checked'
  | 'unchecked'
  | 'percentChecked'
  | 'percentUnchecked'
  | 'earliest'
  | 'latest'

/** The result of computing one column summary. */
export interface ColumnSummaryResult {
  fn: SummaryFunction
  /** Numeric value where meaningful (percentages are 0–100); else null. */
  value: number | null
  /** Formatted display string (`''` for `none`, `'—'` for empty/N-A). */
  display: string
}

// ─── Function catalogue per column type ───────────────────────────────────────

const COUNT_FAMILY: SummaryFunction[] = [
  'filled',
  'empty',
  'percentFilled',
  'percentEmpty',
  'unique'
]

const NUMBER_FAMILY: SummaryFunction[] = ['sum', 'average', 'min', 'max', 'range', 'median']

const CHECKBOX_FAMILY: SummaryFunction[] = [
  'checked',
  'unchecked',
  'percentChecked',
  'percentUnchecked'
]

const DATE_FAMILY: SummaryFunction[] = ['earliest', 'latest']

function functionsForType(type: ColumnType): SummaryFunction[] {
  const base: SummaryFunction[] = ['none', ...COUNT_FAMILY]
  if (type === 'number') return ['none', ...NUMBER_FAMILY, ...COUNT_FAMILY]
  if (type === 'checkbox') return ['none', ...CHECKBOX_FAMILY, ...COUNT_FAMILY]
  if (type === 'date' || type === 'dateRange') return ['none', ...DATE_FAMILY, ...COUNT_FAMILY]
  return base
}

const ALL_COLUMN_TYPES: ColumnType[] = [
  'text',
  'number',
  'checkbox',
  'date',
  'dateRange',
  'geo',
  'select',
  'multiSelect',
  'person',
  'url',
  'email',
  'phone',
  'file',
  'relation',
  'tasks',
  'rollup',
  'formula',
  'richText',
  'created',
  'createdBy',
  'updated',
  'updatedBy'
]

/** Which summary functions each column type offers, in menu order. */
export const SUMMARY_FUNCTIONS_BY_TYPE: Record<ColumnType, SummaryFunction[]> =
  ALL_COLUMN_TYPES.reduce(
    (acc, type) => {
      acc[type] = functionsForType(type)
      return acc
    },
    {} as Record<ColumnType, SummaryFunction[]>
  )

const SUMMARY_FUNCTION_LABELS: Record<SummaryFunction, string> = {
  none: 'None',
  filled: 'Filled',
  empty: 'Empty',
  percentFilled: 'Percent filled',
  percentEmpty: 'Percent empty',
  unique: 'Unique',
  sum: 'Sum',
  average: 'Average',
  min: 'Min',
  max: 'Max',
  range: 'Range',
  median: 'Median',
  checked: 'Checked',
  unchecked: 'Unchecked',
  percentChecked: 'Percent checked',
  percentUnchecked: 'Percent unchecked',
  earliest: 'Earliest',
  latest: 'Latest'
}

/** Human label for a summary function (for menus and footer captions). */
export function summaryFunctionLabel(fn: SummaryFunction): string {
  return SUMMARY_FUNCTION_LABELS[fn]
}

// ─── Value helpers ────────────────────────────────────────────────────────────

/** A cell counts as filled unless it is null/undefined, '', or an empty array. */
export function isFilledValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function numbersIn(values: readonly unknown[]): number[] {
  return values.flatMap((v) => {
    const n = toNumber(v)
    return n === null ? [] : [n]
  })
}

function timestampsIn(values: readonly unknown[]): number[] {
  return values.flatMap((v) => {
    const t = toTimestamp(v)
    return t === null ? [] : [t]
  })
}

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// ─── Aggregators (each small; CC stays flat) ───────────────────────────────────

type Aggregator = (values: readonly unknown[]) => number | null

const AGGREGATORS: Record<SummaryFunction, Aggregator> = {
  none: () => null,
  filled: (v) => v.filter(isFilledValue).length,
  empty: (v) => v.filter((x) => !isFilledValue(x)).length,
  percentFilled: (v) => (v.length === 0 ? null : (v.filter(isFilledValue).length / v.length) * 100),
  percentEmpty: (v) =>
    v.length === 0 ? null : (v.filter((x) => !isFilledValue(x)).length / v.length) * 100,
  unique: (v) => new Set(v.filter(isFilledValue).map((x) => JSON.stringify(x))).size,
  sum: (v) => numbersIn(v).reduce((a, b) => a + b, 0),
  average: (v) => {
    const nums = numbersIn(v)
    return nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length
  },
  min: (v) => {
    const nums = numbersIn(v)
    return nums.length === 0 ? null : Math.min(...nums)
  },
  max: (v) => {
    const nums = numbersIn(v)
    return nums.length === 0 ? null : Math.max(...nums)
  },
  range: (v) => {
    const nums = numbersIn(v)
    return nums.length === 0 ? null : Math.max(...nums) - Math.min(...nums)
  },
  median: (v) => {
    const nums = numbersIn(v).sort((a, b) => a - b)
    return nums.length === 0 ? null : median(nums)
  },
  checked: (v) => v.filter((x) => x === true).length,
  unchecked: (v) => v.filter((x) => x !== true).length,
  percentChecked: (v) =>
    v.length === 0 ? null : (v.filter((x) => x === true).length / v.length) * 100,
  percentUnchecked: (v) =>
    v.length === 0 ? null : (v.filter((x) => x !== true).length / v.length) * 100,
  earliest: (v) => {
    const ts = timestampsIn(v)
    return ts.length === 0 ? null : Math.min(...ts)
  },
  latest: (v) => {
    const ts = timestampsIn(v)
    return ts.length === 0 ? null : Math.max(...ts)
  }
}

const PERCENT_FUNCTIONS = new Set<SummaryFunction>([
  'percentFilled',
  'percentEmpty',
  'percentChecked',
  'percentUnchecked'
])

const TIMESTAMP_FUNCTIONS = new Set<SummaryFunction>(['earliest', 'latest'])

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function formatValue(fn: SummaryFunction, value: number | null): string {
  if (fn === 'none') return ''
  if (value === null) return '—'
  if (PERCENT_FUNCTIONS.has(fn)) return `${Math.round(value)}%`
  if (TIMESTAMP_FUNCTIONS.has(fn)) return new Date(value).toISOString().slice(0, 10)
  return numberFormat.format(value)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a single column summary over the in-view rows.
 *
 * @param rows - rows currently displayed (already filtered)
 * @param column - the column being summarised
 * @param fn - the chosen aggregation
 */
export function computeColumnSummary(
  rows: readonly SummaryRow[],
  column: SummaryColumnLike,
  fn: SummaryFunction
): ColumnSummaryResult {
  const values = rows.map((row) => row.cells[column.id])
  const value = AGGREGATORS[fn](values)
  return { fn, value, display: formatValue(fn, value) }
}
