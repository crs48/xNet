/**
 * TableView - Main table view component with virtual scrolling
 */

import React, { useRef, type JSX } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Schema } from '@xnet/data'
import { cn } from '@xnet/ui'
import { useTableState, type TableRow } from './useTableState.js'
import { TableHeader } from './TableHeader.js'
import { TableCell } from './TableCell.js'
import type { ViewConfig, CellPresence } from '../types.js'

/** Column update payload */
export interface ColumnUpdate {
  name?: string
  type?: string
  config?: Record<string, unknown>
}

export interface TableViewProps {
  /** Schema defining the table structure */
  schema: Schema
  /** View configuration */
  view: ViewConfig
  /** Data rows */
  data: TableRow[]
  /** Callback when a cell is updated */
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
  /** Callback when view config changes */
  onUpdateView?: (changes: Partial<ViewConfig>) => void
  /** Callback when add column is clicked */
  onAddColumn?: () => void
  /** Callback when a column is updated (rename, change type) */
  onUpdateColumn?: (columnId: string, updates: ColumnUpdate) => void
  /** Callback when a column is deleted */
  onDeleteColumn?: (columnId: string) => void
  /** Callback when add row is clicked */
  onAddRow?: () => void
  /** Additional CSS class */
  className?: string
  /** Row height in pixels (default: 36) */
  rowHeight?: number
  /** Number of rows to render above/below viewport (default: 10) */
  overscan?: number
  /** Remote users' cell focus presence */
  cellPresences?: CellPresence[]
  /** Callback when a cell receives focus */
  onCellFocus?: (rowId: string, columnId: string) => void
  /** Callback when a cell loses focus */
  onCellBlur?: () => void
  /** Comment counts per cell (Map of "rowId:propertyKey" -> count) */
  cellCommentCounts?: Map<string, number>
  /** Callback when a comment indicator is clicked */
  onCommentClick?: (rowId: string, propertyKey: string, anchorEl: HTMLElement) => void
  /** Callback when a comment indicator is hovered */
  onCommentHover?: (rowId: string, propertyKey: string, anchorEl: HTMLElement) => void
  /** Callback when mouse leaves a comment indicator */
  onCommentLeave?: () => void
}

/**
 * Table view component with virtual scrolling for large datasets
 */
export function TableView({
  schema,
  view,
  data,
  onUpdateRow,
  onUpdateView,
  onAddColumn,
  onUpdateColumn,
  onDeleteColumn,
  onAddRow,
  className,
  rowHeight = 36,
  overscan = 10,
  cellPresences,
  onCellFocus,
  onCellBlur,
  cellCommentCounts,
  onCommentClick,
  onCommentHover,
  onCommentLeave
}: TableViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)

  // Set up table state
  const { table } = useTableState({
    schema,
    view,
    data,
    onUpdateRow,
    onUpdateView
  })

  const { rows } = table.getRowModel()

  // Set up virtual scrolling
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan
  })

  const virtualRows = rowVirtualizer.getVirtualItems()
  const totalHeight = rowVirtualizer.getTotalSize()

  // Calculate padding for virtual scroll
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const paddingBottom =
    virtualRows.length > 0 ? totalHeight - virtualRows[virtualRows.length - 1].end : 0

  return (
    <div className={cn('flex flex-col h-full bg-white dark:bg-gray-900', className)}>
      {/* Scrollable container */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          {/* Header */}
          <TableHeader
            table={table}
            onAddColumn={onAddColumn}
            onUpdateColumn={onUpdateColumn}
            onDeleteColumn={onDeleteColumn}
          />

          {/* Body with virtual scrolling */}
          <tbody>
            {/* Top padding for virtual scroll */}
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: paddingTop }} colSpan={table.getAllColumns().length} />
              </tr>
            )}

            {/* Visible rows */}
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index]
              return (
                <tr
                  key={row.id}
                  className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  data-index={virtualRow.index}
                >
                  {row.getVisibleCells().map((cell) => {
                    const presencesForCell = cellPresences?.filter(
                      (p) => p.rowId === row.original.id && p.columnId === cell.column.id
                    )
                    const commentCount =
                      cellCommentCounts?.get(`${row.original.id}:${cell.column.id}`) ?? 0
                    return (
                      <TableCell
                        key={cell.id}
                        cell={cell}
                        presences={presencesForCell}
                        onCellFocus={onCellFocus}
                        onCellBlur={onCellBlur}
                        commentCount={commentCount}
                        onCommentClick={onCommentClick}
                        onCommentHover={onCommentHover}
                        onCommentLeave={onCommentLeave}
                      />
                    )
                  })}
                </tr>
              )
            })}

            {/* Bottom padding for virtual scroll */}
            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: paddingBottom }} colSpan={table.getAllColumns().length} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <span>{rows.length} rows</span>
        {onAddRow && (
          <button
            className="px-2 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
            onClick={onAddRow}
          >
            + New
          </button>
        )}
      </div>
    </div>
  )
}
