/**
 * RelationCell - Cell component for displaying and editing relation column values
 *
 * Displays linked row titles as chips and opens a RowPickerModal for editing.
 */

import type { ColumnDefinition, RelationColumnConfig } from '@xnetjs/data'
import type { DatabaseRow } from '@xnetjs/react'
import { useRelatedRows } from '@xnetjs/react'
import React, { useState, useCallback } from 'react'
import { RowPickerModal } from './RowPickerModal.js'

// ─── Icons ───────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg
      width="12"
      height="12"
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
      width="10"
      height="10"
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

export interface RelationCellProps {
  /** The row ID containing this cell */
  rowId: string
  /** The column definition */
  column: ColumnDefinition
  /** Current value (array of related row IDs) */
  value: string[]
  /** Callback to update the value */
  onEdit?: (value: string[]) => void
  /** Whether to show compact mode (count only) */
  compact?: boolean
}

// ─── Relation Chip ───────────────────────────────────────────────────────────

interface RelationChipProps {
  row: DatabaseRow
  onRemove?: () => void
}

function RelationChip({ row, onRemove }: RelationChipProps) {
  // Get title from common title columns
  const title = (row.cells.title ?? row.cells.name ?? row.id) as string

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm text-gray-700 dark:text-gray-300 group"
      title={title}
    >
      <span className="max-w-32 truncate">{title}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 transition-opacity"
          aria-label={`Remove ${title}`}
          type="button"
        >
          <XIcon />
        </button>
      )}
    </span>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${className}`}
    />
  )
}

// ─── RelationCell ────────────────────────────────────────────────────────────

/**
 * RelationCell component for displaying and editing relation values.
 */
export function RelationCell({
  rowId: _rowId,
  column,
  value = [],
  onEdit,
  compact = false
}: RelationCellProps): React.JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false)
  const config = column.config as RelationColumnConfig

  // Load related row data for display
  const { rows: relatedRows, loading } = useRelatedRows(value)

  const handleAdd = useCallback(
    (selectedIds: string[]) => {
      const newValue = [...new Set([...value, ...selectedIds])]
      onEdit?.(newValue)
      setPickerOpen(false)
    },
    [value, onEdit]
  )

  const handleRemove = useCallback(
    (removeId: string) => {
      onEdit?.(value.filter((id) => id !== removeId))
    },
    [value, onEdit]
  )

  if (loading) {
    return <Skeleton className="h-6 w-24" />
  }

  // Compact mode: show count only
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <span className="text-gray-500 dark:text-gray-400 text-sm">
          {relatedRows.length} linked
        </span>
        {onEdit && (
          <>
            <button
              onClick={() => setPickerOpen(true)}
              className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              type="button"
              aria-label="Add link"
            >
              <PlusIcon />
            </button>

            <RowPickerModal
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              targetDatabaseId={config.targetDatabase}
              selectedIds={value}
              onSelect={handleAdd}
              allowMultiple={config.allowMultiple ?? true}
            />
          </>
        )}
      </div>
    )
  }

  // Full mode: show chips
  return (
    <div className="flex flex-wrap gap-1">
      {relatedRows.map((row) => (
        <RelationChip
          key={row.id}
          row={row}
          onRemove={onEdit ? () => handleRemove(row.id) : undefined}
        />
      ))}

      {onEdit && (
        <>
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1 px-2 py-0.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            type="button"
          >
            <PlusIcon />
            <span>Link</span>
          </button>

          <RowPickerModal
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            targetDatabaseId={config.targetDatabase}
            selectedIds={value}
            onSelect={handleAdd}
            allowMultiple={config.allowMultiple ?? true}
          />
        </>
      )}
    </div>
  )
}
