/**
 * BoardView - Kanban board view with drag-and-drop
 */

import React, { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent
} from '@dnd-kit/core'
import { cn } from '@xnet/ui'
import type { Schema } from '@xnet/data'
import { useBoardState, type BoardRow } from './useBoardState.js'
import { BoardColumn } from './BoardColumn.js'
import { BoardCard } from './BoardCard.js'
import type { ViewConfig } from '../types.js'

export interface BoardViewProps {
  /** Schema defining the board structure */
  schema: Schema
  /** View configuration */
  view: ViewConfig
  /** Data rows */
  data: BoardRow[]
  /** Callback when a row is updated */
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
  /** Callback when view config changes */
  onUpdateView?: (changes: Partial<ViewConfig>) => void
  /** Callback when add card is clicked */
  onAddCard?: (columnId: string) => void
  /** Callback when add column is clicked */
  onAddColumn?: () => void
  /** Callback when a card is clicked */
  onCardClick?: (itemId: string) => void
  /** Additional CSS class */
  className?: string
}

/**
 * BoardView component - Kanban board with drag-and-drop
 */
export function BoardView({
  schema,
  view,
  data,
  onUpdateRow,
  onUpdateView,
  onAddCard,
  onAddColumn,
  onCardClick,
  className
}: BoardViewProps): React.JSX.Element {
  const { columns, moveCard, toggleColumnCollapse } = useBoardState({
    schema,
    view,
    data,
    onUpdateRow,
    onUpdateView
  })

  const [activeItem, setActiveItem] = useState<BoardRow | null>(null)
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null)

  // Card properties to display (from view config or default to visible properties)
  const cardProperties = view.visibleProperties

  // Sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8 // 8px movement before drag starts
      }
    }),
    useSensor(KeyboardSensor)
  )

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const itemId = active.id as string

    // Find the item and its column
    for (const column of columns) {
      const item = column.items.find((i) => i.id === itemId)
      if (item) {
        setActiveItem(item)
        setActiveColumnId(column.id)
        break
      }
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over) return

    const overId = over.id as string

    // Find which column we're over
    const overColumn = columns.find((c) => c.id === overId || c.items.some((i) => i.id === overId))

    if (overColumn && overColumn.id !== activeColumnId) {
      setActiveColumnId(overColumn.id)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    const activeId = active.id as string
    const fromColumnId = activeColumnId

    setActiveItem(null)
    setActiveColumnId(null)

    if (!over || !fromColumnId) return

    const overId = over.id as string

    // Find destination column
    let destColumn = columns.find((c) => c.id === overId)
    if (!destColumn) {
      // Dropped on another card, find its column
      destColumn = columns.find((c) => c.items.some((i) => i.id === overId))
    }
    if (!destColumn) return

    // Move the card
    moveCard(activeId, fromColumnId, destColumn.id)
  }

  const handleDragCancel = () => {
    setActiveItem(null)
    setActiveColumnId(null)
  }

  return (
    <div className={cn('h-full overflow-x-auto p-4 bg-white dark:bg-gray-900', className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex gap-3 h-full items-start">
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              schema={schema}
              cardProperties={cardProperties}
              onToggleCollapse={() => toggleColumnCollapse(column.id)}
              isDropTarget={activeColumnId === column.id}
              onAddCard={onAddCard}
              onCardClick={onCardClick}
            />
          ))}

          {/* Add column button */}
          {onAddColumn && (
            <div className="flex-shrink-0 w-72">
              <button
                className="w-full py-3 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800/50 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                onClick={onAddColumn}
              >
                + Add column
              </button>
            </div>
          )}
        </div>

        {/* Drag overlay - shows the card being dragged */}
        <DragOverlay>
          {activeItem && (
            <BoardCard
              item={activeItem}
              schema={schema}
              cardProperties={cardProperties}
              isDragging
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
