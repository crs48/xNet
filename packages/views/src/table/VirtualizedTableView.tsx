/**
 * VirtualizedTableView - Table view with X+Y dual-axis virtualization
 *
 * Renders only visible cells for tables with many rows AND columns.
 * Uses @tanstack/react-virtual for both row and column virtualization.
 */

import type { ViewConfig, CellPresence } from '../types.js'
import type { ColumnUpdate } from './TableView.js'
import type { TableRow } from './useTableState.js'
import type { Schema, PropertyDefinition } from '@xnetjs/data'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '@xnetjs/ui'
import React, { useRef, useCallback, useMemo, memo, type JSX } from 'react'
import { getPropertyHandler } from '../properties/index.js'

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ROW_HEIGHT = 36
const DEFAULT_COLUMN_WIDTH = 150
const MIN_COLUMN_WIDTH = 80
const MAX_COLUMN_WIDTH = 500
const OVERSCAN_ROWS = 10
const OVERSCAN_COLUMNS = 3

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VirtualizedTableViewProps {
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
  overscanRows?: number
  /** Number of columns to render left/right of viewport (default: 3) */
  overscanColumns?: number
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
  /** Callback to delete a row */
  onDeleteRow?: (rowId: string) => void
}

interface ColumnInfo {
  id: string
  name: string
  property: PropertyDefinition
  width: number
}

// ─── VirtualizedTableView Component ──────────────────────────────────────────

/**
 * Table view with X+Y dual-axis virtualization for large datasets
 */
export function VirtualizedTableView({
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
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscanRows = OVERSCAN_ROWS,
  overscanColumns = OVERSCAN_COLUMNS,
  cellPresences,
  onCellFocus,
  onCellBlur,
  cellCommentCounts,
  onCommentClick,
  onDeleteRow
}: VirtualizedTableViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  // Build column info from schema and view
  const columns = useMemo<ColumnInfo[]>(() => {
    const visibleProps = view.visibleProperties
    return schema.properties
      .filter((prop) => {
        const propKey = prop['@id'].split('#').pop() || prop.name
        return visibleProps.includes(propKey)
      })
      .sort((a, b) => {
        const aKey = a['@id'].split('#').pop() || a.name
        const bKey = b['@id'].split('#').pop() || b.name
        return visibleProps.indexOf(aKey) - visibleProps.indexOf(bKey)
      })
      .map((prop) => {
        const propKey = prop['@id'].split('#').pop() || prop.name
        return {
          id: propKey,
          name: prop.name,
          property: prop,
          width: view.propertyWidths?.[propKey] ?? DEFAULT_COLUMN_WIDTH
        }
      })
  }, [schema.properties, view.visibleProperties, view.propertyWidths])

  // Get column width by index
  const getColumnWidth = useCallback(
    (index: number) => {
      return columns[index]?.width ?? DEFAULT_COLUMN_WIDTH
    },
    [columns]
  )

  // Row virtualizer (Y-axis)
  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: overscanRows
  })

  // Column virtualizer (X-axis)
  const columnVirtualizer = useVirtualizer({
    horizontal: true,
    count: columns.length,
    getScrollElement: () => containerRef.current,
    estimateSize: getColumnWidth,
    overscan: overscanColumns
  })

  // Sync header scroll with body scroll
  const handleScroll = useCallback(() => {
    if (headerRef.current && containerRef.current) {
      headerRef.current.scrollLeft = containerRef.current.scrollLeft
    }
  }, [])

  // Handle column resize
  const handleColumnResize = useCallback(
    (columnId: string, newWidth: number) => {
      const clampedWidth = Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, newWidth))
      onUpdateView?.({
        propertyWidths: {
          ...view.propertyWidths,
          [columnId]: clampedWidth
        }
      })
    },
    [view.propertyWidths, onUpdateView]
  )

  const virtualRows = rowVirtualizer.getVirtualItems()
  const virtualColumns = columnVirtualizer.getVirtualItems()
  const totalWidth = columnVirtualizer.getTotalSize()
  const totalHeight = rowVirtualizer.getTotalSize()

  return (
    <div className={cn('flex flex-col h-full bg-white dark:bg-gray-900', className)}>
      {/* Fixed Header (scrolls horizontally with body) */}
      <div
        ref={headerRef}
        className="flex-shrink-0 overflow-hidden border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
      >
        <div style={{ width: totalWidth, position: 'relative', height: rowHeight }}>
          {virtualColumns.map((virtualCol) => {
            const column = columns[virtualCol.index]
            return (
              <VirtualizedHeaderCell
                key={column.id}
                column={column}
                left={virtualCol.start}
                width={virtualCol.size}
                height={rowHeight}
                onResize={(width) => handleColumnResize(column.id, width)}
                onUpdateColumn={onUpdateColumn}
                onDeleteColumn={onDeleteColumn}
              />
            )
          })}

          {/* Add column button */}
          {onAddColumn && (
            <div
              className="absolute top-0 flex items-center justify-center border-r border-gray-200 dark:border-gray-700"
              style={{
                left: totalWidth,
                width: 40,
                height: rowHeight
              }}
            >
              <button
                className="w-full h-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={onAddColumn}
                title="Add property"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable Body */}
      <div ref={containerRef} className="flex-1 overflow-auto" onScroll={handleScroll}>
        <div style={{ width: totalWidth, height: totalHeight, position: 'relative' }}>
          {virtualRows.map((virtualRow) => {
            const row = data[virtualRow.index]
            return (
              <VirtualizedRow
                key={row.id}
                row={row}
                columns={columns}
                virtualColumns={virtualColumns}
                top={virtualRow.start}
                height={virtualRow.size}
                onUpdateRow={onUpdateRow}
                cellPresences={cellPresences}
                onCellFocus={onCellFocus}
                onCellBlur={onCellBlur}
                cellCommentCounts={cellCommentCounts}
                onCommentClick={onCommentClick}
                onDeleteRow={onDeleteRow}
              />
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {data.length} rows, {columns.length} columns
        </span>
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

// ─── VirtualizedHeaderCell Component ─────────────────────────────────────────

interface VirtualizedHeaderCellProps {
  column: ColumnInfo
  left: number
  width: number
  height: number
  onResize: (width: number) => void
  onUpdateColumn?: (columnId: string, updates: ColumnUpdate) => void
  onDeleteColumn?: (columnId: string) => void
}

const VirtualizedHeaderCell = memo(function VirtualizedHeaderCell({
  column,
  left,
  width,
  height,
  onResize,
  onUpdateColumn,
  onDeleteColumn
}: VirtualizedHeaderCellProps): JSX.Element {
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      startXRef.current = e.clientX
      startWidthRef.current = width

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startXRef.current
        onResize(startWidthRef.current + delta)
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [width, onResize]
  )

  return (
    <div
      className="absolute top-0 flex items-center px-2 text-xs font-medium text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 select-none group"
      style={{
        left,
        width,
        height
      }}
    >
      <span className="flex-1 truncate">{column.name}</span>

      {/* Column menu button */}
      {(onUpdateColumn || onDeleteColumn) && (
        <button
          className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Column options"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
      )}

      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 transition-colors"
        onMouseDown={handleResizeStart}
      />
    </div>
  )
})

// ─── VirtualizedRow Component ────────────────────────────────────────────────

interface VirtualizedRowProps {
  row: TableRow
  columns: ColumnInfo[]
  virtualColumns: { index: number; start: number; size: number }[]
  top: number
  height: number
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
  cellPresences?: CellPresence[]
  onCellFocus?: (rowId: string, columnId: string) => void
  onCellBlur?: () => void
  cellCommentCounts?: Map<string, number>
  onCommentClick?: (rowId: string, propertyKey: string, anchorEl: HTMLElement) => void
  onDeleteRow?: (rowId: string) => void
}

const VirtualizedRow = memo(function VirtualizedRow({
  row,
  columns,
  virtualColumns,
  top,
  height,
  onUpdateRow,
  cellPresences,
  onCellFocus,
  onCellBlur,
  cellCommentCounts,
  onCommentClick,
  onDeleteRow
}: VirtualizedRowProps): JSX.Element {
  return (
    <div
      className="absolute left-0 right-0 flex border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      style={{ top, height }}
      data-row-id={row.id}
    >
      {virtualColumns.map((virtualCol) => {
        const column = columns[virtualCol.index]
        const value = row[column.id]
        const presencesForCell = cellPresences?.filter(
          (p) => p.rowId === row.id && p.columnId === column.id
        )
        const commentCount = cellCommentCounts?.get(`${row.id}:${column.id}`) ?? 0

        return (
          <VirtualizedCell
            key={column.id}
            rowId={row.id}
            column={column}
            value={value}
            left={virtualCol.start}
            width={virtualCol.size}
            height={height}
            onUpdate={onUpdateRow}
            presences={presencesForCell}
            onCellFocus={onCellFocus}
            onCellBlur={onCellBlur}
            commentCount={commentCount}
            onCommentClick={onCommentClick}
            onDeleteRow={onDeleteRow}
          />
        )
      })}
    </div>
  )
})

// ─── VirtualizedCell Component ───────────────────────────────────────────────

interface VirtualizedCellProps {
  rowId: string
  column: ColumnInfo
  value: unknown
  left: number
  width: number
  height: number
  onUpdate?: (rowId: string, propertyId: string, value: unknown) => void
  presences?: CellPresence[]
  onCellFocus?: (rowId: string, columnId: string) => void
  onCellBlur?: () => void
  commentCount?: number
  onCommentClick?: (rowId: string, propertyKey: string, anchorEl: HTMLElement) => void
  onDeleteRow?: (rowId: string) => void
}

const VirtualizedCell = memo(function VirtualizedCell({
  rowId,
  column,
  value,
  left,
  width,
  height,
  onUpdate,
  presences,
  onCellFocus,
  onCellBlur,
  commentCount = 0,
  onCommentClick,
  onDeleteRow: _onDeleteRow
}: VirtualizedCellProps): JSX.Element {
  // Note: onDeleteRow is passed through for future context menu implementation
  void _onDeleteRow
  const cellRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = React.useState(false)
  const hasPresence = presences && presences.length > 0

  const handler = getPropertyHandler(column.property.type)

  // Check if this is an editable property
  const isEditable =
    column.property.type !== 'created' &&
    column.property.type !== 'updated' &&
    column.property.type !== 'createdBy' &&
    column.property.type !== 'formula' &&
    column.property.type !== 'rollup'

  const handleClick = useCallback(() => {
    if (!editing && isEditable) {
      setEditing(true)
      onCellFocus?.(rowId, column.id)
    }
  }, [editing, isEditable, onCellFocus, rowId, column.id])

  const handleChange = useCallback(
    (newValue: unknown) => {
      onUpdate?.(rowId, column.id, newValue)
    },
    [onUpdate, rowId, column.id]
  )

  const handleBlur = useCallback(() => {
    setEditing(false)
    onCellBlur?.()
  }, [onCellBlur])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
      setEditing(false)
    }
  }, [])

  // Build presence border style
  const style: React.CSSProperties = {
    position: 'absolute',
    left,
    width,
    height
  }
  if (hasPresence) {
    style.boxShadow = `inset 0 0 0 2px ${presences[0].color}`
  }

  return (
    <div
      ref={cellRef}
      className={cn(
        'flex items-center px-2 border-r border-gray-100 dark:border-gray-800',
        'text-sm text-gray-900 dark:text-gray-100',
        editing && 'ring-2 ring-inset ring-blue-500 bg-white dark:bg-gray-900 z-10',
        isEditable && !editing && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'
      )}
      style={style}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-row-id={rowId}
      data-column-id={column.id}
    >
      {editing && isEditable ? (
        <handler.Editor
          value={value}
          config={column.property.config}
          onChange={handleChange}
          onBlur={handleBlur}
          autoFocus
        />
      ) : (
        <div className="truncate flex-1">{handler.render(value, column.property.config)}</div>
      )}

      {/* Presence indicator */}
      {hasPresence && (
        <div
          className="absolute -top-3 left-1 text-[10px] font-medium text-white px-1 rounded-sm whitespace-nowrap pointer-events-none z-10"
          style={{ backgroundColor: presences[0].color }}
        >
          {presences[0].name}
        </div>
      )}

      {/* Comment indicator */}
      {commentCount > 0 && (
        <div
          className="absolute top-0.5 right-0.5 w-2 h-2 bg-yellow-400 rounded-full cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            if (cellRef.current) {
              onCommentClick?.(rowId, column.id, cellRef.current)
            }
          }}
          title={`${commentCount} comment${commentCount > 1 ? 's' : ''}`}
        />
      )}
    </div>
  )
})
