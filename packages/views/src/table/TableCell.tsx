/**
 * TableCell - Editable table cell component
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { Cell } from '@tanstack/react-table'
import { cn } from '@xnet/ui'
import type { TableRow } from './useTableState.js'
import type { ColumnMeta, CellPresence } from '../types.js'

export interface TableCellProps {
  cell: Cell<TableRow, unknown>
  /** Remote users focused on this cell */
  presences?: CellPresence[]
  /** Callback when this cell receives focus */
  onCellFocus?: (rowId: string, columnId: string) => void
  /** Callback when this cell loses focus */
  onCellBlur?: () => void
}

/**
 * Table cell component with inline editing support
 */
export function TableCell({
  cell,
  presences,
  onCellFocus,
  onCellBlur
}: TableCellProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const cellRef = useRef<HTMLTableCellElement>(null)
  const hasPresence = presences && presences.length > 0

  const meta = cell.column.columnDef.meta as ColumnMeta | undefined
  const value = cell.getValue()
  const property = meta?.property
  const handler = meta?.handler

  // Check if this is an editable property
  const isEditable =
    property &&
    property.type !== 'created' &&
    property.type !== 'updated' &&
    property.type !== 'createdBy' &&
    property.type !== 'formula' &&
    property.type !== 'rollup'

  // Handle click to edit
  const handleClick = useCallback(() => {
    if (!editing && isEditable) {
      setEditing(true)
      onCellFocus?.(cell.row.original.id, cell.column.id)
    }
  }, [editing, isEditable, onCellFocus, cell.row.original.id, cell.column.id])

  // Handle value change
  const handleChange = useCallback(
    (newValue: unknown) => {
      if (meta?.onUpdate) {
        meta.onUpdate(cell.row.original.id, newValue)
      }
    },
    [meta, cell.row.original.id]
  )

  // Handle blur to exit editing
  const handleBlur = useCallback(() => {
    setEditing(false)
    onCellBlur?.()
  }, [onCellBlur])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditing(false)
    } else if (e.key === 'Enter' && !e.shiftKey) {
      setEditing(false)
    }
  }, [])

  // Focus cell when entering edit mode
  useEffect(() => {
    if (editing && cellRef.current) {
      const input = cellRef.current.querySelector('input, select, textarea')
      if (input instanceof HTMLElement) {
        input.focus()
      }
    }
  }, [editing])

  // If no handler, just render the value
  if (!handler || !property) {
    return (
      <td
        ref={cellRef}
        className="px-2 py-1.5 border-r border-gray-100 dark:border-gray-800 text-gray-900 dark:text-gray-100"
        style={{ width: cell.column.getSize() }}
      >
        <div className="truncate">{value != null ? String(value) : ''}</div>
      </td>
    )
  }

  // Build presence border style
  const presenceStyle: React.CSSProperties = {
    width: cell.column.getSize()
  }
  if (hasPresence) {
    presenceStyle.boxShadow = `inset 0 0 0 2px ${presences[0].color}`
  }

  return (
    <td
      ref={cellRef}
      className={cn(
        'px-2 py-1.5 border-r border-gray-100 dark:border-gray-800',
        'text-gray-900 dark:text-gray-100 relative',
        editing && 'ring-2 ring-inset ring-blue-500 bg-white dark:bg-gray-900',
        isEditable && !editing && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'
      )}
      style={presenceStyle}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {editing && isEditable ? (
        <handler.Editor
          value={value}
          config={property.config}
          onChange={handleChange}
          onBlur={handleBlur}
          autoFocus
        />
      ) : (
        <div className="truncate">{handler.render(value, property.config)}</div>
      )}
      {/* Presence indicator label */}
      {hasPresence && (
        <div
          className="absolute -top-3 left-1 text-[10px] font-medium text-white px-1 rounded-sm whitespace-nowrap pointer-events-none z-10"
          style={{ backgroundColor: presences[0].color }}
        >
          {presences[0].name}
        </div>
      )}
    </td>
  )
}
