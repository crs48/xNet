/**
 * GridSummaryBar — Airtable-style footer aggregations for the V2 grid.
 *
 * One cell per visible field, aligned to the grid columns (leading gutter +
 * per-field widths). Click a cell to pick an aggregation from a styled
 * `@xnetjs/ui` menu; the computed value renders right-aligned with a small
 * function caption. Store-agnostic: rows + summaries in, choices out.
 */

import type { GridField } from './model.js'
import type { ColumnType, SummaryFunction, SummaryRow } from '@xnetjs/data'
import { SUMMARY_FUNCTIONS_BY_TYPE, computeColumnSummary, summaryFunctionLabel } from '@xnetjs/data'
import { Menu, MenuItem, cn } from '@xnetjs/ui'
import { Check, ChevronDown } from 'lucide-react'
import React, { useMemo } from 'react'

/** Width of the grid's leading gutter (row number + drag handle). */
const DEFAULT_GUTTER_WIDTH = 56

export interface GridSummaryBarProps {
  /** Visible fields, in display order (same set the grid renders). */
  fields: GridField[]
  /** Rows currently in view (already filtered/sorted). */
  rows: SummaryRow[]
  /** Per-field chosen aggregation; absent ⇒ `none`. */
  summaries: Record<string, SummaryFunction>
  /** Commit a new aggregation for a field (`none` clears it). */
  onChangeSummary: (fieldId: string, fn: SummaryFunction) => void
  /** Leading gutter width to align under the grid (defaults to 56). */
  gutterWidth?: number
  className?: string
}

export function GridSummaryBar({
  fields,
  rows,
  summaries,
  onChangeSummary,
  gutterWidth = DEFAULT_GUTTER_WIDTH,
  className
}: GridSummaryBarProps): React.JSX.Element {
  const rowCount = rows.length
  return (
    <div
      data-grid-summary-bar
      className={cn(
        'flex shrink-0 overflow-hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs',
        className
      )}
    >
      {/* Gutter: row count, mirrors the grid's leading column */}
      <div
        className="flex items-center justify-center px-2 text-[11px] tabular-nums text-gray-400"
        style={{ width: gutterWidth, minWidth: gutterWidth }}
        title={`${rowCount} row${rowCount === 1 ? '' : 's'}`}
      >
        {rowCount}
      </div>
      {fields.map((field) => (
        <SummaryCell
          key={field.id}
          field={field}
          rows={rows}
          fn={summaries[field.id] ?? 'none'}
          onChange={(fn) => onChangeSummary(field.id, fn)}
        />
      ))}
    </div>
  )
}

function SummaryCell({
  field,
  rows,
  fn,
  onChange
}: {
  field: GridField
  rows: SummaryRow[]
  fn: SummaryFunction
  onChange: (fn: SummaryFunction) => void
}): React.JSX.Element {
  const options = useMemo(
    () => SUMMARY_FUNCTIONS_BY_TYPE[field.type as ColumnType] ?? ['none'],
    [field.type]
  )
  const result = useMemo(
    () => computeColumnSummary(rows, { id: field.id, type: field.type as ColumnType }, fn),
    [rows, field.id, field.type, fn]
  )

  const trigger = (
    <button
      type="button"
      aria-label={`Summary for ${field.name}`}
      title={
        fn === 'none' ? `Summarize ${field.name}` : `${summaryFunctionLabel(fn)} of ${field.name}`
      }
      className={cn(
        'group/summary flex h-8 w-full items-center justify-end gap-1 px-2',
        'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50',
        'border-r border-gray-100 dark:border-gray-800'
      )}
    >
      {fn === 'none' ? (
        <span className="text-gray-300 opacity-0 transition-opacity group-hover/summary:opacity-100 dark:text-gray-600">
          Summarize
        </span>
      ) : (
        <span className="flex items-baseline gap-1">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">
            {summaryFunctionLabel(fn)}
          </span>
          <span className="tabular-nums font-medium text-gray-900 dark:text-gray-100">
            {result.display}
          </span>
        </span>
      )}
      <ChevronDown className="h-3 w-3 shrink-0 text-gray-300 opacity-0 transition-opacity group-hover/summary:opacity-100" />
    </button>
  )

  return (
    <div
      className="shrink-0"
      style={{ width: field.width, minWidth: field.width }}
      data-summary-field={field.id}
    >
      <Menu trigger={trigger} align="end">
        {options.map((option) => (
          <MenuItem
            key={option}
            onSelect={() => onChange(option)}
            icon={option === fn ? <Check className="h-4 w-4" /> : undefined}
          >
            {option === 'none' ? 'None' : summaryFunctionLabel(option)}
          </MenuItem>
        ))}
      </Menu>
    </div>
  )
}
