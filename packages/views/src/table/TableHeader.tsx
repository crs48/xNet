/**
 * TableHeader - Table header component with sorting, resizing, and column editing
 */

import type { ColumnUpdate } from './TableView.js'
import type { TableRow } from './useTableState.js'
import type { ColumnMeta } from '../types.js'
import type { PropertyType, SelectColor } from '@xnet/data'
import { flexRender, type Table, type Header } from '@tanstack/react-table'
import { cn } from '@xnet/ui'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { SelectOptionsEditor } from '../columns/SelectOptionsEditor.js'

/** Select option with typed color */
interface SelectOption {
  id: string
  name: string
  color?: SelectColor
}

export interface TableHeaderProps {
  table: Table<TableRow>
  onAddColumn?: () => void
  onUpdateColumn?: (columnId: string, updates: ColumnUpdate) => void
  onDeleteColumn?: (columnId: string) => void
}

/**
 * Available property types for column type selector
 */
const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'dateRange', label: 'Date Range' },
  { value: 'select', label: 'Select' },
  { value: 'multiSelect', label: 'Multi-Select' },
  { value: 'person', label: 'Person' },
  { value: 'relation', label: 'Relation' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'file', label: 'File' }
]

/**
 * Table header component
 */
export function TableHeader({
  table,
  onAddColumn,
  onUpdateColumn,
  onDeleteColumn
}: TableHeaderProps): React.JSX.Element {
  return (
    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800 z-10">
      {table.getHeaderGroups().map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header) => (
            <HeaderCell
              key={header.id}
              header={header}
              onUpdateColumn={onUpdateColumn}
              onDeleteColumn={onDeleteColumn}
            />
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
  onUpdateColumn?: (columnId: string, updates: ColumnUpdate) => void
  onDeleteColumn?: (columnId: string) => void
}

/**
 * Individual header cell with sort and resize
 */
function HeaderCell({
  header,
  onUpdateColumn,
  onDeleteColumn
}: HeaderCellProps): React.JSX.Element {
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
        'group relative h-9 px-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300',
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
          <ColumnMenu
            ref={menuRef}
            header={header}
            onClose={() => setMenuOpen(false)}
            onUpdateColumn={onUpdateColumn}
            onDeleteColumn={onDeleteColumn}
          />
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
  onUpdateColumn?: (columnId: string, updates: ColumnUpdate) => void
  onDeleteColumn?: (columnId: string) => void
}

/**
 * Column dropdown menu with sort, rename, change type, edit options, and delete
 */
const ColumnMenu = React.forwardRef<HTMLDivElement, ColumnMenuProps>(
  ({ header, onClose, onUpdateColumn, onDeleteColumn }, ref) => {
    const [mode, setMode] = useState<'main' | 'rename' | 'type' | 'options'>('main')
    const [newName, setNewName] = useState(String(header.column.columnDef.header || ''))
    const inputRef = useRef<HTMLInputElement>(null)

    const columnId = header.column.id
    const columnMeta = header.column.columnDef.meta as ColumnMeta | undefined
    const propertyType = columnMeta?.property?.type
    const propertyConfig = columnMeta?.property?.config as Record<string, unknown> | undefined
    const isSelectType = propertyType === 'select' || propertyType === 'multiSelect'

    // Get current options for select/multiSelect
    const currentOptions = (propertyConfig?.options as SelectOption[] | undefined) ?? []
    const [editedOptions, setEditedOptions] = useState<SelectOption[]>(currentOptions)

    // Reset edited options when config changes
    useEffect(() => {
      setEditedOptions(currentOptions)
      // eslint-disable-next-line react-hooks/exhaustive-deps -- we want to reset when propertyConfig changes, not currentOptions reference
    }, [propertyConfig])

    // Focus input when renaming
    useEffect(() => {
      if (mode === 'rename' && inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
      }
    }, [mode])

    const handleSortAsc = useCallback(() => {
      header.column.toggleSorting(false)
      onClose()
    }, [header.column, onClose])

    const handleSortDesc = useCallback(() => {
      header.column.toggleSorting(true)
      onClose()
    }, [header.column, onClose])

    const handleClearSort = useCallback(() => {
      header.column.clearSorting()
      onClose()
    }, [header.column, onClose])

    const handleHide = useCallback(() => {
      header.column.toggleVisibility(false)
      onClose()
    }, [header.column, onClose])

    const handleRename = useCallback(() => {
      if (newName.trim() && onUpdateColumn) {
        onUpdateColumn(columnId, { name: newName.trim() })
      }
      setMode('main')
      onClose()
    }, [newName, onUpdateColumn, columnId, onClose])

    const handleRenameKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
          handleRename()
        } else if (e.key === 'Escape') {
          setMode('main')
        }
      },
      [handleRename]
    )

    const handleChangeType = useCallback(
      (type: PropertyType) => {
        if (onUpdateColumn) {
          // When changing to select/multiSelect, initialize empty options
          const config =
            type === 'select' || type === 'multiSelect' ? { options: [], allowCreate: true } : {}
          onUpdateColumn(columnId, { type, config })
        }
        setMode('main')
        onClose()
      },
      [onUpdateColumn, columnId, onClose]
    )

    const handleSaveOptions = useCallback(() => {
      if (onUpdateColumn) {
        onUpdateColumn(columnId, {
          config: { ...propertyConfig, options: editedOptions }
        })
      }
      setMode('main')
      onClose()
    }, [onUpdateColumn, columnId, propertyConfig, editedOptions, onClose])

    const handleDelete = useCallback(() => {
      if (onDeleteColumn) {
        onDeleteColumn(columnId)
      }
      onClose()
    }, [onDeleteColumn, columnId, onClose])

    const menuItemClass =
      'w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'

    const dangerItemClass =
      'w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors'

    // Rename input mode
    if (mode === 'rename') {
      return (
        <div
          ref={ref}
          className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 p-2 z-20"
        >
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={handleRename}
            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            placeholder="Column name"
          />
        </div>
      )
    }

    // Type selector mode
    if (mode === 'type') {
      return (
        <div
          ref={ref}
          className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20 max-h-64 overflow-y-auto"
        >
          <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
            Select type
          </div>
          {PROPERTY_TYPES.map((pt) => (
            <button
              key={pt.value}
              className={menuItemClass}
              onClick={() => handleChangeType(pt.value)}
            >
              {pt.label}
            </button>
          ))}
          <hr className="my-1 border-gray-200 dark:border-gray-700" />
          <button className={menuItemClass} onClick={() => setMode('main')}>
            ← Back
          </button>
        </div>
      )
    }

    // Options editor mode (for select/multiSelect)
    if (mode === 'options') {
      return (
        <div
          ref={ref}
          className="absolute top-full right-0 mt-1 w-64 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-20"
        >
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
              Edit Options
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto p-2">
            <SelectOptionsEditor
              options={editedOptions}
              onChange={setEditedOptions}
              allowCreate={true}
              compact
            />
          </div>
          <div className="flex justify-between px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <button
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              onClick={() => setMode('main')}
            >
              ← Back
            </button>
            <button
              className="px-3 py-1 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              onClick={handleSaveOptions}
            >
              Save
            </button>
          </div>
        </div>
      )
    }

    // Main menu
    return (
      <div
        ref={ref}
        className="absolute top-full right-0 mt-1 w-44 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-20"
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
        {onUpdateColumn && (
          <>
            <button className={menuItemClass} onClick={() => setMode('rename')}>
              ✎ Rename
            </button>
            <button className={menuItemClass} onClick={() => setMode('type')}>
              ⇄ Change type
            </button>
            {isSelectType && (
              <button className={menuItemClass} onClick={() => setMode('options')}>
                ☰ Edit options
              </button>
            )}
          </>
        )}
        <button className={menuItemClass} onClick={handleHide}>
          ◯ Hide column
        </button>
        {onDeleteColumn && (
          <>
            <hr className="my-1 border-gray-200 dark:border-gray-700" />
            <button className={dangerItemClass} onClick={handleDelete}>
              ✕ Delete column
            </button>
          </>
        )}
      </div>
    )
  }
)

ColumnMenu.displayName = 'ColumnMenu'
