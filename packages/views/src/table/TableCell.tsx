/**
 * TableCell - Editable table cell component
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { Cell } from '@tanstack/react-table'
import { cn } from '@xnet/ui'
import type { TableRow } from './useTableState.js'
import type { ColumnMeta } from '../types.js'

export interface TableCellProps {
  cell: Cell<TableRow, unknown>
}

/**
 * Table cell component with inline editing support
 */
export function TableCell({ cell }: TableCellProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const cellRef = useRef<HTMLTableCellElement>(null)

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
    }
  }, [editing, isEditable])

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
  }, [])

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

  return (
    <td
      ref={cellRef}
      className={cn(
        'px-2 py-1.5 border-r border-gray-100 dark:border-gray-800',
        'text-gray-900 dark:text-gray-100',
        editing && 'ring-2 ring-inset ring-blue-500 bg-white dark:bg-gray-900',
        isEditable && !editing && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'
      )}
      style={{ width: cell.column.getSize() }}
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
    </td>
  )
}
