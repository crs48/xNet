/**
 * TableCell - Editable table cell component with context menu
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { Cell } from '@tanstack/react-table'
import { cn } from '@xnet/ui'
import type { TableRow } from './useTableState.js'
import type { ColumnMeta, CellPresence } from '../types.js'
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const cellRef = useRef<HTMLTableCellElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const hasPresence = presences && presences.length > 0

  const meta = cell.column.columnDef.meta as ColumnMeta | undefined
  const value = cell.getValue()
  const property = meta?.property
  const handler = meta?.handler

  const rowId = cell.row.original.id
  const columnId = cell.column.id

  // Check if this is an editable property
  const isEditable =
    property &&
    property.type !== 'created' &&
    property.type !== 'updated' &&
    property.type !== 'createdBy' &&
    property.type !== 'formula' &&
    property.type !== 'rollup'

  // Handle click to edit — skip if context menu was just open (closing it fires click)
  const handleClick = useCallback(() => {
    if (contextMenu) return
    if (!editing && isEditable) {
      setEditing(true)
      onCellFocus?.(rowId, columnId)
    }
  }, [editing, isEditable, onCellFocus, rowId, columnId, contextMenu])

  // Handle value change
  const handleChange = useCallback(
    (newValue: unknown) => {
      if (meta?.onUpdate) {
        meta.onUpdate(rowId, newValue)
      }
    },
    [meta, rowId]
  )

  // Handle blur to exit editing
  const handleBlur = useCallback(() => {
    setEditing(false)
    onCellBlur?.()
  }, [onCellBlur])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditing(false)
    } else if (e.key === 'Enter' && !e.shiftKey) {
      setEditing(false)
    }
  }, [])

  // ─── Context Menu ────────────────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  // Close on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [contextMenu])

  // Context menu actions
  const handleCopy = useCallback(() => {
    const text = value != null ? String(value) : ''
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback: silently fail
    })
    closeContextMenu()
  }, [value, closeContextMenu])

  const handleClear = useCallback(() => {
    if (meta?.onUpdate) {
      // Clear to default based on type
      const type = property?.type
      if (type === 'checkbox') {
        meta.onUpdate(rowId, false)
      } else if (type === 'number') {
        meta.onUpdate(rowId, null)
      } else if (type === 'multiSelect') {
        meta.onUpdate(rowId, [])
      } else {
        meta.onUpdate(rowId, '')
      }
    }
    closeContextMenu()
  }, [meta, property, rowId, closeContextMenu])

  const handleComment = useCallback(() => {
    if (cellRef.current) {
      if (commentCount > 0) {
        onCommentClick?.(rowId, columnId, cellRef.current)
      } else {
        onCommentCreate?.(rowId, columnId, cellRef.current)
      }
    }
    closeContextMenu()
  }, [commentCount, onCommentClick, onCommentCreate, rowId, columnId, closeContextMenu])

  const handleDelete = useCallback(() => {
    onDeleteRow?.(rowId)
    closeContextMenu()
  }, [onDeleteRow, rowId, closeContextMenu])

  // Focus cell when entering edit mode
  useEffect(() => {
    if (editing && cellRef.current) {
      const input = cellRef.current.querySelector('input, select, textarea')
      if (input instanceof HTMLElement) {
        input.focus()
      }
    }
  }, [editing])

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

  // ─── Context menu overlay ────────────────────────────────────────────────────

  const contextMenuOverlay = contextMenu && (
    <div
      ref={menuRef}
      className="fixed z-50 w-48 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 py-1 text-sm animate-in fade-in-0 zoom-in-95 duration-100"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      {/* Copy */}
      <button
        className="w-full px-3 py-1.5 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
        onClick={handleCopy}
      >
        <CopyIcon />
        Copy cell
      </button>

      {/* Edit */}
      {isEditable && !editing && (
        <button
          className="w-full px-3 py-1.5 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
          onClick={() => {
            setEditing(true)
            onCellFocus?.(rowId, columnId)
            closeContextMenu()
          }}
        >
          <EditIcon />
          Edit cell
        </button>
      )}

      {/* Clear */}
      {isEditable && value != null && value !== '' && (
        <button
          className="w-full px-3 py-1.5 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
          onClick={handleClear}
        >
          <ClearIcon />
          Clear cell
        </button>
      )}

      {/* Separator */}
      <div className="my-1 border-t border-gray-200 dark:border-gray-700" />

      {/* Comment */}
      {(onCommentCreate || onCommentClick) && (
        <button
          className="w-full px-3 py-1.5 text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
          onClick={handleComment}
        >
          <CommentIcon />
          {commentCount > 0 ? `View comments (${commentCount})` : 'Comment'}
        </button>
      )}

      {/* Separator */}
      {onDeleteRow && (
        <>
          <div className="my-1 border-t border-gray-200 dark:border-gray-700" />
          <button
            className="w-full px-3 py-1.5 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
            onClick={handleDelete}
          >
            <DeleteIcon />
            Delete row
          </button>
        </>
      )}
    </div>
  )

  // ─── Render ──────────────────────────────────────────────────────────────────

  // If no handler, just render the value
  if (!handler || !property) {
    return (
      <td
        ref={cellRef}
        data-row-id={rowId}
        data-column-id={columnId}
        className="px-2 py-1.5 border-r border-gray-100 dark:border-gray-800 text-gray-900 dark:text-gray-100 relative"
        style={{ width: cell.column.getSize() }}
        onContextMenu={handleContextMenu}
      >
        <div className="truncate">{value != null ? String(value) : ''}</div>
        {commentIndicator}
        {contextMenuOverlay}
      </td>
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
      onContextMenu={handleContextMenu}
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
      {contextMenuOverlay}
    </td>
  )
}

// ─── Inline SVG Icons (14x14, matching lucide style) ───────────────────────────

function CopyIcon() {
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
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function EditIcon() {
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
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function ClearIcon() {
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
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

function CommentIcon() {
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
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function DeleteIcon() {
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
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  )
}
