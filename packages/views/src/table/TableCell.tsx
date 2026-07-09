/**
 * TableCell - Editable table cell component with context menu
 */

import type { TableRow } from './useTableState.js'
import type { ColumnMeta, CellPresence } from '../types.js'
import type { Cell } from '@tanstack/react-table'
import {
  cn,
  ContextMenuRoot,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from '@xnetjs/ui'
import { Copy, Pencil, Eraser, MessageSquare, Trash2 } from 'lucide-react'
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { CommentIndicator } from '../components/CommentIndicator.js'

export interface TableCellProps {
  cell: Cell<TableRow, unknown>
  /** Remote users focused on this cell */
  presences?: CellPresence[]
  /** Callback when this cell receives focus */
  onCellFocus?: (rowId: string, columnId: string) => void
  /** Callback when this cell loses focus */
  onCellBlur?: () => void
  /** Number of comments on this cell */
  commentCount?: number
  /** Callback when comment indicator is clicked */
  onCommentClick?: (rowId: string, propertyKey: string, anchorEl: HTMLElement) => void
  /** Callback when comment indicator is hovered */
  onCommentHover?: (rowId: string, propertyKey: string, anchorEl: HTMLElement) => void
  /** Callback when mouse leaves comment indicator */
  onCommentLeave?: () => void
  /** Callback to create a comment on this cell */
  onCommentCreate?: (rowId: string, propertyKey: string, anchorEl: HTMLElement) => void
  /** Callback to delete this row */
  onDeleteRow?: (rowId: string) => void
}

/**
 * Table cell component with inline editing support
 */
export function TableCell({
  cell,
  presences,
  onCellFocus,
  onCellBlur,
  commentCount = 0,
  onCommentClick,
  onCommentHover,
  onCommentLeave,
  onCommentCreate,
  onDeleteRow
}: TableCellProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draftValue, setDraftValue] = useState<unknown>(cell.getValue())
  const [dirty, setDirty] = useState(false)
  const cellRef = useRef<HTMLTableCellElement>(null)
  const hasPresence = presences && presences.length > 0

  const meta = cell.column.columnDef.meta as ColumnMeta | undefined
  const value = cell.getValue()
  const property = meta?.property
  const handler = meta?.handler

  const rowId = cell.row.original.id
  const columnId = cell.column.id

  const commitDraft = useCallback(() => {
    if (!dirty) return
    if (meta?.onUpdate) {
      meta.onUpdate(rowId, draftValue)
    }
    setDirty(false)
  }, [dirty, meta, rowId, draftValue])

  const startEditing = useCallback(() => {
    setDraftValue(value)
    setDirty(false)
    setEditing(true)
    onCellFocus?.(rowId, columnId)
  }, [value, onCellFocus, rowId, columnId])

  const focusAdjacentCell = useCallback((direction: 'left' | 'right' | 'up' | 'down') => {
    const currentCell = cellRef.current
    if (!currentCell) return

    const currentRow = currentCell.parentElement as HTMLTableRowElement | null
    if (!currentRow) return

    if (direction === 'left') {
      let prev = currentCell.previousElementSibling
      while (prev && !(prev instanceof HTMLTableCellElement)) {
        prev = prev.previousElementSibling
      }
      if (prev instanceof HTMLTableCellElement) prev.focus()
      return
    }

    if (direction === 'right') {
      let next = currentCell.nextElementSibling
      while (next && !(next instanceof HTMLTableCellElement)) {
        next = next.nextElementSibling
      }
      if (next instanceof HTMLTableCellElement) next.focus()
      return
    }

    const targetColumnId = currentCell.dataset.columnId
    if (!targetColumnId) return

    let siblingRow: Element | null =
      direction === 'up' ? currentRow.previousElementSibling : currentRow.nextElementSibling

    while (siblingRow) {
      if (siblingRow instanceof HTMLTableRowElement) {
        const match = siblingRow.querySelector(
          `td[data-column-id="${targetColumnId}"]`
        ) as HTMLTableCellElement | null
        if (match) {
          match.focus()
          return
        }
      }
      siblingRow =
        direction === 'up' ? siblingRow.previousElementSibling : siblingRow.nextElementSibling
    }
  }, [])

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
      startEditing()
    }
  }, [editing, isEditable, startEditing])

  // Handle value change
  const handleChange = useCallback((newValue: unknown) => {
    setDraftValue(newValue)
    setDirty(true)
  }, [])

  // Handle blur to exit editing
  const handleBlur = useCallback(() => {
    commitDraft()
    setEditing(false)
    onCellBlur?.()
  }, [commitDraft, onCellBlur])

  const handleEditorCommit = useCallback(
    (nextValue?: unknown, _reason?: string) => {
      if (nextValue !== undefined) {
        setDraftValue(nextValue)
        setDirty(false)
        if (meta?.onUpdate) {
          meta.onUpdate(rowId, nextValue)
        }
      } else {
        commitDraft()
      }
      setEditing(false)
      onCellBlur?.()
    },
    [commitDraft, meta, onCellBlur, rowId]
  )

  const handleEditorCancel = useCallback(() => {
    setDraftValue(value)
    setDirty(false)
    setEditing(false)
    onCellBlur?.()
  }, [value, onCellBlur])

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editing && isEditable && (e.key === 'Enter' || e.key === 'F2')) {
        e.preventDefault()
        startEditing()
        return
      }

      if (!editing) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          focusAdjacentCell('left')
          return
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          focusAdjacentCell('right')
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          focusAdjacentCell('up')
          return
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          focusAdjacentCell('down')
          return
        }
        return
      }

      if (editing && e.key === 'Escape') {
        e.preventDefault()
        setDraftValue(value)
        setDirty(false)
        setEditing(false)
        onCellBlur?.()
        return
      }

      if (editing && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        commitDraft()
        setEditing(false)
        onCellBlur?.()
        focusAdjacentCell('down')
        return
      }

      if (editing && e.key === 'Tab') {
        e.preventDefault()
        commitDraft()
        setEditing(false)
        onCellBlur?.()
        focusAdjacentCell(e.shiftKey ? 'left' : 'right')
      }
    },
    [editing, isEditable, startEditing, value, onCellBlur, commitDraft, focusAdjacentCell]
  )

  // ─── Context Menu actions ────────────────────────────────────────────────────
  // Base UI's ContextMenu owns open/position/dismissal; these just run the verb.

  const handleCopy = useCallback(() => {
    const text = value != null ? String(value) : ''
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback: silently fail
    })
  }, [value])

  const handleClear = useCallback(() => {
    if (meta?.onUpdate) {
      // Clear to default based on type
      const type = property?.type
      if (type === 'checkbox') {
        meta.onUpdate(rowId, false)
      } else if (type === 'number') {
        meta.onUpdate(rowId, null)
      } else if (type === 'date' || type === 'dateRange') {
        meta.onUpdate(rowId, null)
      } else if (type === 'multiSelect') {
        meta.onUpdate(rowId, [])
      } else if (type === 'relation') {
        const allowMultiple =
          typeof property?.config?.allowMultiple === 'boolean'
            ? property.config.allowMultiple
            : true
        meta.onUpdate(rowId, allowMultiple ? [] : '')
      } else if (type === 'person') {
        const multiple =
          typeof property?.config?.multiple === 'boolean'
            ? property.config.multiple
            : typeof property?.config?.allowMultiple === 'boolean'
              ? property.config.allowMultiple
              : false
        meta.onUpdate(rowId, multiple ? [] : '')
      } else {
        meta.onUpdate(rowId, '')
      }
    }
  }, [meta, property, rowId])

  const handleComment = useCallback(() => {
    if (cellRef.current) {
      if (commentCount > 0) {
        onCommentClick?.(rowId, columnId, cellRef.current)
      } else {
        onCommentCreate?.(rowId, columnId, cellRef.current)
      }
    }
  }, [commentCount, onCommentClick, onCommentCreate, rowId, columnId])

  const handleDelete = useCallback(() => {
    onDeleteRow?.(rowId)
  }, [onDeleteRow, rowId])

  // Focus cell when entering edit mode
  useEffect(() => {
    if (editing && cellRef.current) {
      const input = cellRef.current.querySelector('input, select, textarea')
      if (input instanceof HTMLElement) {
        input.focus()
      }
    }
  }, [editing])

  useEffect(() => {
    if (!editing) {
      setDraftValue(value)
      setDirty(false)
    }
  }, [editing, value])

  // ─── Comment indicator helper ────────────────────────────────────────────────

  const commentIndicator = commentCount > 0 && (
    <CommentIndicator
      count={commentCount}
      variant="dot"
      onClick={(e) => {
        e.stopPropagation()
        onCommentClick?.(rowId, columnId, cellRef.current!)
      }}
      onMouseEnter={(e) => {
        e.stopPropagation()
        onCommentHover?.(rowId, columnId, cellRef.current!)
      }}
      onMouseLeave={onCommentLeave}
    />
  )

  // ─── Context menu items ──────────────────────────────────────────────────────

  const menuItems = (
    <ContextMenuContent className="w-48">
      <ContextMenuItem onClick={handleCopy}>
        <Copy />
        <span className="flex-1">Copy cell</span>
      </ContextMenuItem>
      {isEditable && !editing && (
        <ContextMenuItem onClick={startEditing}>
          <Pencil />
          <span className="flex-1">Edit cell</span>
        </ContextMenuItem>
      )}
      {isEditable && value != null && value !== '' && (
        <ContextMenuItem onClick={handleClear}>
          <Eraser />
          <span className="flex-1">Clear cell</span>
        </ContextMenuItem>
      )}
      {(onCommentCreate || onCommentClick) && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleComment}>
            <MessageSquare />
            <span className="flex-1">
              {commentCount > 0 ? `View comments (${commentCount})` : 'Comment'}
            </span>
          </ContextMenuItem>
        </>
      )}
      {onDeleteRow && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem danger onClick={handleDelete}>
            <Trash2 />
            <span className="flex-1">Delete row</span>
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  )

  // ─── Render ──────────────────────────────────────────────────────────────────

  // If no handler, just render the value
  if (!handler || !property) {
    return (
      <ContextMenuRoot>
        <ContextMenuTrigger
          render={
            <td
              ref={cellRef}
              data-row-id={rowId}
              data-column-id={columnId}
              className="px-2 py-1.5 border-r border-gray-100 dark:border-gray-800 text-gray-900 dark:text-gray-100 relative"
              style={{ width: cell.column.getSize() }}
            >
              <div className="truncate">{value != null ? String(value) : ''}</div>
              {commentIndicator}
            </td>
          }
        />
        {menuItems}
      </ContextMenuRoot>
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
    <ContextMenuRoot>
      <ContextMenuTrigger
        render={
          <td
            ref={cellRef}
            data-row-id={rowId}
            data-column-id={columnId}
            className={cn(
              'px-2 py-1.5 border-r border-gray-100 dark:border-gray-800',
              'text-gray-900 dark:text-gray-100 relative',
              editing && 'ring-2 ring-inset ring-blue-500 bg-white dark:bg-gray-900',
              isEditable && !editing && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800'
            )}
            style={presenceStyle}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
          >
            {editing && isEditable ? (
              <handler.Editor
                value={draftValue as never}
                config={property.config}
                onChange={handleChange}
                onCommit={handleEditorCommit}
                onCancel={handleEditorCancel}
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
            {commentIndicator}
          </td>
        }
      />
      {menuItems}
    </ContextMenuRoot>
  )
}
