/**
 * Relation property handler
 *
 * Displays and edits relation column values (links to rows in another database).
 */

import type { PropertyHandler, PropertyEditorProps } from '../types.js'
import React, { useCallback, useMemo } from 'react'

// ─── Inline Icons (14x14, matching lucide style) ─────────────────────────────

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
      width="12"
      height="12"
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

// ─── Relation Chip ───────────────────────────────────────────────────────────

interface RelationChipProps {
  id: string
  title: string
  onRemove?: () => void
}

function RelationChip({ id, title, onRemove }: RelationChipProps) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-700 dark:text-gray-300 group max-w-32"
      title={title}
    >
      <span className="truncate">{title || id}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 transition-opacity"
          aria-label={`Remove ${title}`}
        >
          <XIcon />
        </button>
      )}
    </span>
  )
}

// ─── Relation Editor ─────────────────────────────────────────────────────────

/**
 * Relation editor component
 *
 * Note: This is a simplified editor. The full RowPickerModal is rendered
 * by the parent RelationCell component in packages/views/src/relations/.
 * This editor just displays the current relations with remove buttons.
 */
function RelationEditor({ value, onChange, onBlur, disabled }: PropertyEditorProps<string[]>) {
  const rowIds = useMemo(() => (Array.isArray(value) ? value : []), [value])

  const handleRemove = useCallback(
    (removeId: string) => {
      onChange(rowIds.filter((id) => id !== removeId))
    },
    [rowIds, onChange]
  )

  if (disabled) {
    return (
      <div className="flex flex-wrap gap-1 py-0.5 opacity-50">
        {rowIds.length === 0 ? (
          <span className="text-gray-400 dark:text-gray-500 text-sm italic">No links</span>
        ) : (
          rowIds.map((id) => <RelationChip key={id} id={id} title={id} />)
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-1 py-0.5" onBlur={onBlur}>
      {rowIds.map((id) => (
        <RelationChip key={id} id={id} title={id} onRemove={() => handleRemove(id)} />
      ))}
      <button
        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        type="button"
      >
        <PlusIcon />
        <span>Link</span>
      </button>
    </div>
  )
}

// ─── Relation Handler ────────────────────────────────────────────────────────

/**
 * Relation property handler
 */
export const relationHandler: PropertyHandler<string[]> = {
  type: 'relation',

  render(value, _config) {
    const rowIds = Array.isArray(value) ? value : []

    if (rowIds.length === 0) {
      return <span className="text-gray-400 dark:text-gray-500 italic">Empty</span>
    }

    // In compact mode, just show count
    if (rowIds.length > 3) {
      return (
        <span className="text-gray-600 dark:text-gray-400 text-sm">{rowIds.length} linked</span>
      )
    }

    // Show chips for a few items
    return (
      <div className="flex flex-wrap gap-1">
        {rowIds.map((id) => (
          <RelationChip key={id} id={id} title={id} />
        ))}
      </div>
    )
  },

  compare(a, b, _config) {
    const aLen = Array.isArray(a) ? a.length : 0
    const bLen = Array.isArray(b) ? b.length : 0
    return aLen - bLen
  },

  filterOperators: ['isEmpty', 'isNotEmpty'],

  applyFilter(value, operator, _filterValue) {
    const rowIds = Array.isArray(value) ? value : []
    switch (operator) {
      case 'isEmpty':
        return rowIds.length === 0
      case 'isNotEmpty':
        return rowIds.length > 0
      default:
        return true
    }
  },

  Editor: RelationEditor
}
