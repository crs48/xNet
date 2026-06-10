/**
 * GridCell — one cell of the V2 grid: display via property handlers,
 * inline editor when active, presence ring, comment badge.
 */

import type { CellPresence } from '../types.js'
import type { GridField } from './model.js'
import type { CellValue } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import { MessageSquare } from 'lucide-react'
import React, { memo, useCallback, useEffect, useRef, useState } from 'react'
import { getPropertyHandler } from '../properties/index.js'

export interface GridCellProps {
  rowId: string
  field: GridField
  value: CellValue | undefined
  /** Cell coordinates (for ARIA/data attributes) */
  rowIndex: number
  colIndex: number
  /** Cursor is on this cell */
  focused: boolean
  /** Cell is inside the current selection */
  selected: boolean
  /** This cell is being edited */
  editing: boolean
  /** Replace-mode seed text (start the editor from this draft) */
  editSeed?: string
  /** Remote presences on this cell */
  presences?: CellPresence[]
  /** Comment thread count */
  commentCount?: number
  width: number
  readOnly?: boolean

  onMouseDown: (rowIndex: number, colIndex: number, shiftKey: boolean) => void
  onMouseEnter: (rowIndex: number, colIndex: number, buttons: number) => void
  onDoubleClick: (rowIndex: number, colIndex: number) => void
  /** Commit the draft (editor-initiated commit, e.g. picker select) */
  onCommit: (value: CellValue) => void
  /** Update the in-progress draft */
  onDraftChange: (value: CellValue) => void
  onCancel: () => void
  onCommentClick?: (rowId: string, fieldId: string, anchorEl: HTMLElement) => void
}

/** Seed text -> initial draft value for replace-mode editing. */
function seedValue(field: GridField, seed: string): CellValue {
  switch (field.type) {
    case 'number': {
      const n = Number(seed)
      return Number.isFinite(n) ? n : null
    }
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return seed
    default:
      // Pickers and rich types ignore the seed (they open their UI)
      return null
  }
}

function GridCellInner({
  rowId,
  field,
  value,
  rowIndex,
  colIndex,
  focused,
  selected,
  editing,
  editSeed,
  presences,
  commentCount = 0,
  width,
  readOnly,
  onMouseDown,
  onMouseEnter,
  onDoubleClick,
  onCommit,
  onDraftChange,
  onCancel,
  onCommentClick
}: GridCellProps): React.JSX.Element {
  const handler = getPropertyHandler(field.type)
  const cellRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<CellValue>(null)

  // Initialize the draft when an edit session starts (and report it, so a
  // commit with no further changes persists the right value)
  useEffect(() => {
    if (editing) {
      const initial =
        editSeed !== undefined ? seedValue(field, editSeed) : ((value ?? null) as CellValue)
      setDraft(initial)
      onDraftChange(initial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  const handleChange = useCallback(
    (next: unknown) => {
      setDraft(next as CellValue)
      onDraftChange(next as CellValue)
    },
    [onDraftChange]
  )

  const handleEditorCommit = useCallback(
    (next?: unknown) => {
      onCommit((next !== undefined ? next : draft) as CellValue)
    },
    [onCommit, draft]
  )

  const remotePresence = presences && presences.length > 0 ? presences[0] : undefined

  return (
    <div
      ref={cellRef}
      role="gridcell"
      aria-selected={selected}
      aria-colindex={colIndex + 1}
      data-grid-cell
      data-row-index={rowIndex}
      data-col-index={colIndex}
      data-row-id={rowId}
      data-field-id={field.id}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        ...(remotePresence ? { boxShadow: `inset 0 0 0 2px ${remotePresence.color}` } : {})
      }}
      className={cn(
        'relative h-full border-b border-r border-gray-100 dark:border-gray-800 px-2 flex items-center text-sm overflow-hidden select-none',
        selected && !focused && 'bg-blue-50/60 dark:bg-blue-900/20',
        focused && 'ring-2 ring-inset ring-blue-500 dark:ring-blue-400 z-[1]',
        !editing && 'whitespace-nowrap'
      )}
      onMouseDown={(e) => {
        if (e.button === 0) onMouseDown(rowIndex, colIndex, e.shiftKey)
      }}
      onMouseEnter={(e) => onMouseEnter(rowIndex, colIndex, e.buttons)}
      onDoubleClick={() => onDoubleClick(rowIndex, colIndex)}
    >
      {editing && !readOnly ? (
        <div className="absolute inset-0 z-10 bg-white dark:bg-gray-900 flex items-stretch">
          <handler.Editor
            value={draft}
            config={{ ...field.config, options: field.options }}
            onChange={handleChange}
            onCommit={handleEditorCommit}
            onCancel={onCancel}
            onBlur={() => handleEditorCommit()}
            autoFocus
          />
        </div>
      ) : (
        <div className="flex-1 truncate">
          {handler.render(value ?? null, { ...field.config, options: field.options })}
        </div>
      )}

      {/* Remote presence name flag */}
      {remotePresence && !editing && (
        <span
          className="absolute -top-0 right-0 px-1 text-[10px] leading-3 rounded-bl text-white pointer-events-none"
          style={{ backgroundColor: remotePresence.color }}
        >
          {remotePresence.name}
        </span>
      )}

      {/* Comment badge */}
      {commentCount > 0 && (
        <button
          type="button"
          aria-label={`${commentCount} comments`}
          className="absolute top-0.5 right-0.5 flex items-center gap-0.5 text-amber-500 hover:text-amber-600"
          onClick={(e) => {
            e.stopPropagation()
            onCommentClick?.(rowId, field.id, e.currentTarget)
          }}
        >
          <MessageSquare className="w-3 h-3 fill-current" />
          {commentCount > 1 && <span className="text-[10px]">{commentCount}</span>}
        </button>
      )}
    </div>
  )
}

export const GridCell = memo(GridCellInner)
