/**
 * TableHeader - Table header component with sorting and resizing
 */

import React, { useState, useRef, useEffect } from 'react'
import { flexRender, type Table, type Header } from '@tanstack/react-table'
import { cn } from '@xnet/ui'
import type { TableRow } from './useTableState.js'

export interface TableHeaderProps {
  table: Table<TableRow>
  onAddColumn?: () => void
}

/**
 * Table header component
 */
export function TableHeader({ table, onAddColumn }: TableHeaderProps): React.JSX.Element {
  return (
    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <HeaderCell key={header.id} header={header} />
          ))}

          {/* Add column button */}
          {onAddColumn && (
            <th className="w-10 p-0 border-b border-gray-200 dark:border-gray-700">
              <button
                className="w-full h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={onAddColumn}
                title="Add property"
              >
                +
              </button>
            </th>
          )}
        </tr>
      ))}
    </thead>
  )
}

interface HeaderCellProps {
  header: Header<TableRow, unknown>
}

/**
 * Individual header cell with sort and resize
 */
function HeaderCell({ header }: HeaderCellProps): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const canSort = header.column.getCanSort()
  const sortDirection = header.column.getIsSorted()
  const isResizing = header.column.getIsResizing()

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <th
      className={cn(
        'relative h-9 px-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300',
        'border-b border-r border-gray-200 dark:border-gray-700',
        'select-none',
        isResizing && 'bg-blue-50 dark:bg-blue-900/20'
      )}
      style={{ width: header.getSize() }}
    >
      <div className="flex items-center justify-between gap-1">
        {/* Column name with sort toggle */}
        <span
          className={cn(
            'flex-1 truncate',
            canSort && 'cursor-pointer hover:text-gray-900 dark:hover:text-gray-100'
          )}
          onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
        >
          {header.isPlaceholder
            ? null
            : flexRender(header.column.columnDef.header, header.getContext())}

          {/* Sort indicator */}
          {sortDirection && (
            <span className="ml-1 text-blue-600 dark:text-blue-400">
              {sortDirection === 'asc' ? '↑' : '↓'}
            </span>
          )}
        </span>

        {/* Column menu trigger */}
        <button
          className="p-0.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          onClick={() => setMenuOpen(!menuOpen)}
          title="Column options"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>

        {/* Column dropdown menu */}
        {menuOpen && (
          <ColumnMenu ref={menuRef} header={header} onClose={() => setMenuOpen(false)} />
        )}
      </div>

      {/* Resize handle */}
      <div
        className={cn(
          'absolute top-0 right-0 w-1 h-full cursor-col-resize',
          'hover:bg-blue-500 transition-colors',
          isResizing && 'bg-blue-500'
        )}
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        onClick={(e) => e.stopPropagation()}
      />
    </th>
  )
}

interface ColumnMenuProps {
  header: Header<TableRow, unknown>
  onClose: () => void
}

/**
 * Column dropdown menu
 */
const ColumnMenu = React.forwardRef<HTMLDivElement, ColumnMenuProps>(({ header, onClose }, ref) => {
  const handleSortAsc = () => {
    header.column.toggleSorting(false)
    onClose()
  }

  const handleSortDesc = () => {
    header.column.toggleSorting(true)
    onClose()
  }

  const handleClearSort = () => {
    header.column.clearSorting()
    onClose()
  }

  const handleHide = () => {
    header.column.toggleVisibility(false)
    onClose()
  }

  const menuItemClass =
    'w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20"
    >
      <button className={menuItemClass} onClick={handleSortAsc}>
        ↑ Sort ascending
      </button>
      <button className={menuItemClass} onClick={handleSortDesc}>
        ↓ Sort descending
      </button>
      {header.column.getIsSorted() && (
        <button className={menuItemClass} onClick={handleClearSort}>
          ✕ Clear sort
        </button>
      )}
      <hr className="my-1 border-gray-200 dark:border-gray-700" />
      <button className={menuItemClass} onClick={handleHide}>
        Hide column
      </button>
    </div>
  )
})

ColumnMenu.displayName = 'ColumnMenu'
