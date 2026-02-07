/**
 * CloneSchemaModal - Modal for cloning a database schema to a new database
 *
 * Allows users to:
 * - Specify a name for the new database
 * - Choose whether to include sample rows
 * - Preview what will be cloned
 */

import type { DatabaseSchemaMetadata, StoredColumn } from '@xnet/data'
import React, { useState, useCallback, useEffect, useRef } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloneSchemaModalProps {
  /** Whether the modal is open */
  isOpen: boolean
  /** Callback when modal should close */
  onClose: () => void
  /** Source schema metadata */
  sourceMetadata: DatabaseSchemaMetadata | null
  /** Source columns for preview */
  sourceColumns: StoredColumn[]
  /** Number of rows in source database */
  sourceRowCount: number
  /** Callback when user confirms clone */
  onClone: (options: { name: string; includeRows: boolean; maxSampleRows: number }) => void
  /** Whether clone is in progress */
  isCloning?: boolean
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * CloneSchemaModal component for cloning database schemas
 */
export function CloneSchemaModal({
  isOpen,
  onClose,
  sourceMetadata,
  sourceColumns,
  sourceRowCount,
  onClone,
  isCloning = false
}: CloneSchemaModalProps): React.JSX.Element | null {
  const [name, setName] = useState('')
  const [includeRows, setIncludeRows] = useState(false)
  const [maxSampleRows, setMaxSampleRows] = useState(10)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen && sourceMetadata) {
      setName(`${sourceMetadata.name} (Copy)`)
      setIncludeRows(false)
      setMaxSampleRows(Math.min(10, sourceRowCount))
    }
  }, [isOpen, sourceMetadata, sourceRowCount])

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isCloning) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isCloning, onClose])

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !isCloning) {
        onClose()
      }
    },
    [isCloning, onClose]
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!name.trim() || isCloning) return

      onClone({
        name: name.trim(),
        includeRows,
        maxSampleRows: includeRows ? maxSampleRows : 0
      })
    },
    [name, includeRows, maxSampleRows, isCloning, onClone]
  )

  if (!isOpen || !sourceMetadata) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Clone Schema</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isCloning}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Source info */}
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Cloning schema from:</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{sourceMetadata.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {sourceColumns.length} column{sourceColumns.length !== 1 ? 's' : ''} ·
                {sourceRowCount} row{sourceRowCount !== 1 ? 's' : ''} · v{sourceMetadata.version}
              </p>
            </div>

            {/* New database name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Database Name
              </label>
              <input
                ref={nameInputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter name for new database..."
                disabled={isCloning}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>

            {/* Include rows option */}
            {sourceRowCount > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="includeRows"
                    checked={includeRows}
                    onChange={(e) => setIncludeRows(e.target.checked)}
                    disabled={isCloning}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="includeRows" className="text-sm text-gray-700 dark:text-gray-300">
                    Include sample rows
                  </label>
                </div>

                {includeRows && (
                  <div className="ml-7">
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Number of rows to include (max {Math.min(50, sourceRowCount)})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={Math.min(50, sourceRowCount)}
                      value={maxSampleRows}
                      onChange={(e) =>
                        setMaxSampleRows(
                          Math.min(
                            Math.max(1, parseInt(e.target.value) || 1),
                            Math.min(50, sourceRowCount)
                          )
                        )
                      }
                      disabled={isCloning}
                      className="w-24 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    />
                  </div>
                )}
              </div>
            )}

            {/* What will be cloned */}
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                This will create a new database with:
              </p>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
                <li>All {sourceColumns.length} columns (with new IDs)</li>
                <li>Table and board view configurations</li>
                <li>Fresh schema version (v1.0.0)</li>
                {includeRows && (
                  <li>
                    {maxSampleRows} sample row{maxSampleRows !== 1 ? 's' : ''}
                  </li>
                )}
                {!includeRows && <li>No rows (empty database)</li>}
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isCloning}
              className="px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isCloning}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isCloning ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Cloning...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Clone Database
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CloneSchemaModal
