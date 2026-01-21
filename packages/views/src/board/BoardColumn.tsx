/**
 * BoardColumn - A single column in the Kanban board
 */

import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
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
  onCardClick
}: BoardColumnProps): React.JSX.Element {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id
  })

  const handleAddCard = () => {
    if (onAddCard) onAddCard(column.id)
  }

  return (
    <div
      className={cn(
        'flex-shrink-0 flex flex-col bg-gray-100 dark:bg-gray-800/50 rounded-lg',
        column.collapsed ? 'w-10' : 'w-72',
        (isOver || isDropTarget) && 'bg-blue-50 dark:bg-blue-900/20'
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 min-w-0">
          {/* Color indicator */}
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: column.color }}
          />

          {!column.collapsed && (
            <>
              {/* Column name */}
              <span className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate">
                {column.name}
              </span>

              {/* Item count */}
              <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400 rounded">
                {column.items.length}
              </span>
            </>
          )}
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1">
          <button
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            onClick={onToggleCollapse}
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
        <div ref={setNodeRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
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
