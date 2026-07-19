/**
 * GridCell — one cell of the V2 grid: display via property handlers,
 * inline editor when active, presence ring, comment badge.
 */

import type { CellPresence } from '../types.js'
import type { GridField } from './model.js'
import type { CellValue } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import { Lock, MessageSquare } from 'lucide-react'
import React, { memo, useCallback, useMemo, useRef, useState } from 'react'
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
  /** When set, this cell is edit-locked (e.g. by authorization); the reason is
   *  shown on hover and a lock glyph is rendered. */
  lockReason?: string
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
  /** Persist a new select option for this field (typeahead create) */
  onCreateOption?: (fieldId: string, name: string) => Promise<string | null>
  /** Upload a file (file fields); returns the stored FileRef */
  onUploadFile?: (file: File) => Promise<import('@xnetjs/data').FileRef | null>
  /** A file was dropped onto this (non-editing) cell */
  onDropFile?: (rowIndex: number, colIndex: number, file: File) => void
  /** Resolve a FileRef to a displayable URL */
  onResolveFileUrl?: (ref: import('@xnetjs/data').FileRef) => Promise<string>
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
  lockReason,
  width,
  readOnly,
  onMouseDown,
  onMouseEnter,
  onDoubleClick,
  onCommit,
  onDraftChange,
  onCancel,
  onCommentClick,
  onCreateOption,
  onUploadFile,
  onDropFile,
  onResolveFileUrl
}: GridCellProps): React.JSX.Element {
  const handler = getPropertyHandler(field.type)
  const cellRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<CellValue>(null)
  const wasEditingRef = useRef(false)
  /**
   * One commit (or cancel) per edit session. The unmounting editor's input
   * fires a blur after the session already committed (picker-select, keymap
   * Enter/Escape) — without this guard that stale blur re-commits the old
   * draft and can clobber the just-written value.
   */
  const sessionDoneRef = useRef(true)

  // Initialize the draft synchronously when an edit session starts — the
  // editor captures its initial value on mount, so an effect would be too
  // late and drop the type-to-replace seed (guarded setState-during-render,
  // React's derived-state pattern).
  if (editing && !wasEditingRef.current) {
    wasEditingRef.current = true
    sessionDoneRef.current = false
    const initial =
      editSeed !== undefined ? seedValue(field, editSeed) : ((value ?? null) as CellValue)
    setDraft(initial)
    onDraftChange(initial)
  } else if (!editing && wasEditingRef.current) {
    // The grid closed the session (keymap commit/cancel); render phase runs
    // before the editor's DOM unmount, so the ref is set before its blur fires
    wasEditingRef.current = false
    sessionDoneRef.current = true
  }

  const editorConfig = useMemo(
    () => ({
      allowCreate: true,
      ...field.config,
      options: field.options,
      ...(onCreateOption
        ? { onCreateOption: (name: string) => onCreateOption(field.id, name) }
        : {}),
      ...(onUploadFile ? { onUploadFile } : {}),
      ...(onResolveFileUrl ? { onResolveFileUrl } : {}),
      // Type-to-replace on picker cells: the typed character becomes the
      // initial autocomplete query instead of being dropped
      ...(editing && editSeed !== undefined ? { initialQuery: editSeed } : {})
    }),
    [field, onCreateOption, onUploadFile, onResolveFileUrl, editing, editSeed]
  )

  const handleChange = useCallback(
    (next: unknown) => {
      setDraft(next as CellValue)
      onDraftChange(next as CellValue)
    },
    [onDraftChange]
  )

  const handleEditorCommit = useCallback(
    (next?: unknown) => {
      if (sessionDoneRef.current) return
      sessionDoneRef.current = true
      onCommit((next !== undefined ? next : draft) as CellValue)
    },
    [onCommit, draft]
  )

  const handleEditorCancel = useCallback(() => {
    if (sessionDoneRef.current) return
    sessionDoneRef.current = true
    onCancel()
  }, [onCancel])

  const remotePresence = presences && presences.length > 0 ? presences[0] : undefined

  // Why this cell can't be edited, shown on hover. Per-cell authorization locks
  // (`lockReason`) take precedence; otherwise a column may carry an opt-in
  // `readonlyReason` (e.g. the dev tools labeling system/non-editable columns).
  const columnReadOnlyReason = field.readonly ? field.readonlyReason : undefined
  const hoverReason = lockReason ?? columnReadOnlyReason
  // Mark non-editable cells with a small lock glyph: authorization locks always,
  // and opt-in read-only columns only while the grid itself is editable (so the
  // glyph distinguishes locked columns from editable ones during editing,
  // without cluttering a fully read-only grid).
  const showLockGlyph =
    !editing && (lockReason != null || (columnReadOnlyReason != null && !readOnly))

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
      title={hoverReason}
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        ...(remotePresence ? { boxShadow: `inset 0 0 0 2px ${remotePresence.color}` } : {})
      }}
      className={cn(
        'relative h-full border-b border-r border-gray-100 dark:border-gray-800 px-2 flex items-center text-sm select-none',
        selected && !focused && 'bg-blue-50/60 dark:bg-blue-900/20',
        focused && 'ring-2 ring-inset ring-blue-500 dark:ring-blue-400 z-[1]',
        // While editing the cell must not clip its editor's dropdown
        // (option lists render below the input) and must paint above
        // neighboring cells
        editing ? 'z-30' : 'overflow-hidden whitespace-nowrap'
      )}
      onMouseDown={(e) => {
        if (e.button === 0) onMouseDown(rowIndex, colIndex, e.shiftKey)
      }}
      onMouseEnter={(e) => onMouseEnter(rowIndex, colIndex, e.buttons)}
      onDoubleClick={() => onDoubleClick(rowIndex, colIndex)}
      onDragOver={(e) => {
        if (field.type === 'file' && !readOnly && e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
        }
      }}
      onDrop={(e) => {
        if (field.type !== 'file' || readOnly || !onDropFile) return
        const file = e.dataTransfer.files?.[0]
        if (!file) return
        e.preventDefault()
        onDropFile(rowIndex, colIndex, file)
      }}
    >
      {editing && !readOnly ? (
        <div
          className="absolute inset-0 z-10 bg-white dark:bg-gray-900 flex items-stretch"
          // Clicks inside the editor must not re-enter grid selection — the
          // bubbled mousedown would re-dispatch focusCell and tear down the
          // session before the editor's own click handler runs
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <handler.Editor
            value={draft}
            config={editorConfig}
            onChange={handleChange}
            onCommit={handleEditorCommit}
            onCancel={handleEditorCancel}
            onBlur={() => handleEditorCommit()}
            autoFocus
            autoSelect={editSeed === undefined}
          />
        </div>
      ) : rowId === '__ghost__' || field.id === '__ghost__' ? (
        <div className="flex-1" />
      ) : (
        <div className="flex-1 truncate">{handler.render(value ?? null, editorConfig)}</div>
      )}

      {/* Edit-lock glyph (authorization or an opt-in read-only column). Top-left
          to avoid the comment badge (top-right); the reason shows via the cell's
          title tooltip. */}
      {showLockGlyph && (
        <span
          className="absolute top-0.5 left-0.5 text-gray-400 dark:text-gray-500 pointer-events-none"
          aria-label="read-only"
        >
          <Lock className="w-2.5 h-2.5" />
        </span>
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

      {/* Add-comment affordance: focused, commentless cells show a subtle
          button (the badge below covers commented cells). Cmd/Ctrl+Shift+M
          also works, but Chrome reserves it on macOS, so a visible entry
          point is required. */}
      {commentCount === 0 && focused && !editing && !readOnly && onCommentClick && (
        <button
          type="button"
          aria-label="Add comment"
          className="absolute top-0.5 right-0.5 p-0.5 rounded text-gray-300 hover:text-amber-500 dark:text-gray-600 dark:hover:text-amber-400"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onCommentClick(rowId, field.id, e.currentTarget)
          }}
        >
          <MessageSquare className="w-3 h-3" />
        </button>
      )}

      {/* Comment badge */}
      {commentCount > 0 && (
        <button
          type="button"
          aria-label={`${commentCount} comments`}
          className="absolute top-0.5 right-0.5 flex items-center gap-0.5 text-comment hover:text-comment-strong"
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
