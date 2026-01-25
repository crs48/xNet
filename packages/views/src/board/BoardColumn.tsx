/**
 * BoardColumn - A single column in the Kanban board
 */

import React, { useState, useRef, useEffect } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@xnet/ui'
import type { Schema } from '@xnet/data'
import type { BoardColumn as BoardColumnType } from './useBoardState.js'
import { BoardCard } from './BoardCard.js'

export interface BoardColumnProps {
  /** Column data */
  column: BoardColumnType
  /** Schema for rendering card properties */
  schema: Schema
  /** Properties to show on cards */
  cardProperties: string[]
  /** Toggle column collapse */
  onToggleCollapse: () => void
  /** Whether this column is a drop target */
  isDropTarget: boolean
  /** Callback when add card button is clicked */
  onAddCard?: (columnId: string) => void
  /** Callback when a card is clicked */
  onCardClick?: (itemId: string) => void
  /** Callback when column is renamed */
  onRenameColumn?: (columnId: string, newName: string) => void
  /** Callback when column is deleted */
  onDeleteColumn?: (columnId: string) => void
  /** Whether column dragging is enabled */
  isDraggable?: boolean
  /** Whether this column is currently being dragged */
  isColumnDragging?: boolean
}

/**
 * BoardColumn component - a single column in the Kanban board
 */
export function BoardColumn({
  column,
  schema,
  cardProperties,
  onToggleCollapse,
  isDropTarget,
  onAddCard,
  onCardClick,
  onRenameColumn,
  onDeleteColumn,
  isDraggable = false,
  isColumnDragging = false
}: BoardColumnProps): React.JSX.Element {
  // Droppable for cards
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: column.id
  })

  // Sortable for column reordering - use a prefixed ID to distinguish from cards
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging: isSortableDragging
  } = useSortable({
    id: `column-${column.id}`,
    disabled: !isDraggable || column.id === '__all__' || column.id === '__none__'
  })

  const columnStyle = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(column.name)
  const [showMenu, setShowMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  const handleAddCard = () => {
    if (onAddCard) onAddCard(column.id)
  }

  const handleStartRename = () => {
    setEditName(column.name)
    setIsEditing(true)
    setShowMenu(false)
  }

  const handleFinishRename = () => {
    setIsEditing(false)
    if (editName.trim() && editName !== column.name && onRenameColumn) {
      onRenameColumn(column.id, editName.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleFinishRename()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditName(column.name)
    }
  }

  const handleDelete = () => {
    setShowMenu(false)
    if (onDeleteColumn) {
      onDeleteColumn(column.id)
    }
  }

  // Special columns (__all__, __none__) are not editable
  const isEditable = column.id !== '__all__' && column.id !== '__none__'

  // Determine if column is dragging
  const isCurrentlyDragging = isSortableDragging || isColumnDragging

  return (
    <div
      ref={setSortableRef}
      style={columnStyle}
      className={cn(
        'flex-shrink-0 flex flex-col bg-gray-100 dark:bg-gray-800/50 rounded-lg',
        column.collapsed ? 'w-10' : 'w-72',
        (isOver || isDropTarget) && 'bg-blue-50 dark:bg-blue-900/20',
        isCurrentlyDragging && 'opacity-50 shadow-lg'
      )}
    >
      {/* Column header - draggable handle */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700',
          isDraggable && isEditable && 'cursor-grab active:cursor-grabbing'
        )}
        {...(isDraggable && isEditable ? { ...attributes, ...listeners } : {})}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Drag handle indicator */}
          {isDraggable && isEditable && (
            <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.5" />
                <circle cx="15" cy="6" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="18" r="1.5" />
                <circle cx="15" cy="18" r="1.5" />
              </svg>
            </span>
          )}
          {/* Color indicator */}
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: column.color }}
          />

          {!column.collapsed && (
            <>
              {/* Column name - editable */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleFinishRename}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="font-medium text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-blue-500 rounded px-1 py-0.5 outline-none min-w-0 w-full"
                />
              ) : (
                <span
                  className={cn(
                    'font-medium text-sm text-gray-700 dark:text-gray-200 truncate',
                    isEditable && 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400'
                  )}
                  onDoubleClick={isEditable ? handleStartRename : undefined}
                  title={isEditable ? 'Double-click to rename' : undefined}
                >
                  {column.name}
                </span>
              )}

              {/* Item count */}
              <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400 rounded flex-shrink-0">
                {column.items.length}
              </span>
            </>
          )}
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1 relative">
          {/* Menu button (only for editable columns) */}
          {!column.collapsed && isEditable && (onRenameColumn || onDeleteColumn) && (
            <button
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
              onPointerDown={(e) => e.stopPropagation()}
              title="Column options"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                />
              </svg>
            </button>
          )}

          {/* Dropdown menu */}
          {showMenu && (
            <div
              ref={menuRef}
              className="absolute top-full right-0 mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {onRenameColumn && (
                <button
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  onClick={handleStartRename}
                >
                  <span>Rename</span>
                </button>
              )}
              {onDeleteColumn && (
                <button
                  className="w-full px-3 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                  onClick={handleDelete}
                >
                  <span>Delete</span>
                </button>
              )}
            </div>
          )}

          <button
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title={column.collapsed ? 'Expand' : 'Collapse'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {column.collapsed ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Column content */}
      {!column.collapsed && (
        <div ref={setDroppableRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
          <SortableContext
            items={column.items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {column.items.map((item) => (
              <BoardCard
                key={item.id}
                item={item}
                schema={schema}
                cardProperties={cardProperties}
                onClick={onCardClick}
              />
            ))}
          </SortableContext>

          {/* Add card button */}
          {onAddCard && (
            <button
              className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              onClick={handleAddCard}
            >
              + New
            </button>
          )}
        </div>
      )}

      {/* Collapsed state - show rotated count */}
      {column.collapsed && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs text-gray-500 dark:text-gray-400 transform -rotate-90 whitespace-nowrap">
            {column.items.length} items
          </span>
        </div>
      )}
    </div>
  )
}
