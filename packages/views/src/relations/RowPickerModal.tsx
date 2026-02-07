/**
 * RowPickerModal - Modal for selecting rows to link in relation columns
 *
 * Shows a searchable list of rows from the target database with
 * multi-select support and the ability to create new rows inline.
 */

import type { ColumnDefinition, CellValue } from '@xnet/data'
import { useDatabase, type DatabaseRow } from '@xnet/react'
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'

// ─── Icons ───────────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RowPickerModalProps {
  /** Whether the modal is open */
  open: boolean
  /** Callback when the modal should close */
  onClose: () => void
  /** The database ID to pick rows from */
  targetDatabaseId: string
  /** Currently selected row IDs */
  selectedIds: string[]
  /** Callback when rows are selected */
  onSelect: (ids: string[]) => void
  /** Whether to allow selecting multiple rows */
  allowMultiple?: boolean
}

// ─── RowPickerModal ──────────────────────────────────────────────────────────

/**
 * Modal for selecting rows from a target database.
 */
export function RowPickerModal({
  open,
  onClose,
  targetDatabaseId,
  selectedIds,
  onSelect,
  allowMultiple = true
}: RowPickerModalProps): React.JSX.Element | null {
  const [search, setSearch] = useState('')
  const [pendingSelection, setPendingSelection] = useState<Set<string>>(new Set(selectedIds))
  const inputRef = useRef<HTMLInputElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  // Load database rows
  const { rows, columns, loading, hasMore, loadMore, createRow } = useDatabase(targetDatabaseId, {
    pageSize: 20
  })

  // Get title column
  const titleColumn = useMemo(() => {
    // Find explicit title column first
    const explicit = columns.find((c) => c.name?.toLowerCase() === 'title')
    if (explicit) return explicit

    // Find column marked as title
    const isTitle = columns.find((c) => (c as ColumnDefinition & { isTitle?: boolean }).isTitle)
    if (isTitle) return isTitle

    // Fall back to first text column or first column
    const textCol = columns.find((c) => c.type === 'text')
    return textCol ?? columns[0]
  }, [columns])

  // Filter rows by search
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows

    const searchLower = search.toLowerCase()
    return rows.filter((row) => {
      const title = getRowTitle(row, titleColumn)
      return title.toLowerCase().includes(searchLower)
    })
  }, [rows, search, titleColumn])

  // Reset pending selection when modal opens
  useEffect(() => {
    if (open) {
      setPendingSelection(new Set(selectedIds))
      setSearch('')
      // Focus input after a small delay for animation
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, selectedIds])

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        onClose()
      }
    },
    [onClose]
  )

  // Handle escape key
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Toggle row selection
  const handleToggle = useCallback(
    (rowId: string) => {
      setPendingSelection((prev) => {
        const next = new Set(prev)
        if (next.has(rowId)) {
          next.delete(rowId)
        } else {
          if (!allowMultiple) {
            next.clear()
          }
          next.add(rowId)
        }
        return next
      })
    },
    [allowMultiple]
  )

  // Confirm selection
  const handleConfirm = useCallback(() => {
    onSelect(Array.from(pendingSelection))
    onClose()
  }, [pendingSelection, onSelect, onClose])

  // Create and link new row
  const handleCreateAndLink = useCallback(async () => {
    const title = search.trim()
    if (!title || !titleColumn) return

    try {
      const values: Record<string, CellValue> = {
        [titleColumn.id]: title
      }

      const newRowId = await createRow(values)

      if (allowMultiple) {
        setPendingSelection((prev) => new Set([...prev, newRowId]))
      } else {
        onSelect([newRowId])
        onClose()
      }

      setSearch('')
    } catch (err) {
      console.error('[RowPickerModal] Failed to create row:', err)
    }
  }, [search, titleColumn, createRow, allowMultiple, onSelect, onClose])

  if (!open) return null

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="row-picker-title"
    >
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="row-picker-title"
            className="text-lg font-medium text-gray-900 dark:text-gray-100"
          >
            Link to row
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close"
            type="button"
          >
            <XIcon />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <SearchIcon />
            </span>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search or create..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Row list */}
        <div className="max-h-64 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">Loading...</div>
          ) : filteredRows.length === 0 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              {search.trim() ? (
                <div className="space-y-3">
                  <p>No results for "{search}"</p>
                  {titleColumn && (
                    <button
                      onClick={handleCreateAndLink}
                      className="inline-flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:underline"
                      type="button"
                    >
                      <PlusIcon />
                      Create "{search}" and link
                    </button>
                  )}
                </div>
              ) : (
                'No rows in this database'
              )}
            </div>
          ) : (
            <>
              {filteredRows.map((row) => {
                const isSelected = pendingSelection.has(row.id)
                const title = getRowTitle(row, titleColumn)

                return (
                  <button
                    key={row.id}
                    onClick={() => handleToggle(row.id)}
                    className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                      isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                    type="button"
                  >
                    <span
                      className={`flex-shrink-0 w-4 h-4 border rounded flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 dark:border-gray-600'
                      }`}
                    >
                      {isSelected && (
                        <span className="text-white">
                          <CheckIcon />
                        </span>
                      )}
                    </span>
                    <span className="flex-1 truncate text-gray-900 dark:text-gray-100">
                      {title}
                    </span>
                  </button>
                )
              })}

              {hasMore && (
                <button
                  onClick={() => loadMore()}
                  className="w-full p-2 text-center text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  type="button"
                >
                  Load more...
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {pendingSelection.size} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={pendingSelection.size === 0}
              type="button"
            >
              Link
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get the display title for a row.
 */
function getRowTitle(row: DatabaseRow, titleColumn: ColumnDefinition | undefined): string {
  if (!titleColumn) {
    // Fallback: try common title keys
    const title = row.cells.title ?? row.cells.name ?? row.cells.Name ?? row.cells.Title
    return title != null ? String(title) : row.id
  }

  const value = row.cells[titleColumn.id]
  return value != null ? String(value) : row.id
}
