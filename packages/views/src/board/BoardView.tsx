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
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@xnet/ui'
import type { Schema } from '@xnet/data'
import {
  useBoardState,
  type BoardRow,
  type BoardColumn as BoardColumnType
} from './useBoardState.js'
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
  /** Callback when add column is clicked (adds new select option) */
  onAddColumn?: () => void
  /** Callback when a column is renamed (renames select option) */
  onRenameColumn?: (columnId: string, newName: string) => void
  /** Callback when a column is deleted (removes select option) */
  onDeleteColumn?: (columnId: string) => void
  /** Callback when columns are reordered */
  onReorderColumns?: (columnIds: string[]) => void
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
  onRenameColumn,
  onDeleteColumn,
  onReorderColumns,
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
  const [activeColumn, setActiveColumn] = useState<BoardColumnType | null>(null)
  const [isDraggingColumn, setIsDraggingColumn] = useState(false)

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
    const activeId = active.id as string

    // Check if dragging a column (prefixed with 'column-')
    if (activeId.startsWith('column-')) {
      const columnId = activeId.replace('column-', '')
      const column = columns.find((c) => c.id === columnId)
      if (column) {
        setActiveColumn(column)
        setIsDraggingColumn(true)
      }
      return
    }

    // Find the item and its column
    for (const column of columns) {
      const item = column.items.find((i) => i.id === activeId)
      if (item) {
        setActiveItem(item)
        setActiveColumnId(column.id)
        break
      }
    }
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over || isDraggingColumn) return

    const overId = over.id as string

    // Find which column we're over (for cards only)
    const overColumn = columns.find((c) => c.id === overId || c.items.some((i) => i.id === overId))

    if (overColumn && overColumn.id !== activeColumnId) {
      setActiveColumnId(overColumn.id)
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    const activeId = active.id as string

    // Handle column reorder
    if (isDraggingColumn) {
      setActiveColumn(null)
      setIsDraggingColumn(false)

      if (!over || !onReorderColumns) return

      const overId = over.id as string
      if (!overId.startsWith('column-')) return

      const fromColumnId = activeId.replace('column-', '')
      const toColumnId = overId.replace('column-', '')

      if (fromColumnId === toColumnId) return

      // Get current order (excluding special columns)
      const editableColumns = columns.filter((c) => c.id !== '__all__' && c.id !== '__none__')
      const currentOrder = editableColumns.map((c) => c.id)

      const fromIndex = currentOrder.indexOf(fromColumnId)
      const toIndex = currentOrder.indexOf(toColumnId)

      if (fromIndex === -1 || toIndex === -1) return

      // Reorder
      const newOrder = [...currentOrder]
      newOrder.splice(fromIndex, 1)
      newOrder.splice(toIndex, 0, fromColumnId)

      onReorderColumns(newOrder)
      return
    }

    // Handle card move
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
    setActiveColumn(null)
    setIsDraggingColumn(false)
  }

  // Column IDs for sortable context (prefixed)
  const sortableColumnIds = columns
    .filter((c) => c.id !== '__all__' && c.id !== '__none__')
    .map((c) => `column-${c.id}`)

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
        <SortableContext items={sortableColumnIds} strategy={horizontalListSortingStrategy}>
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
                onRenameColumn={onRenameColumn}
                onDeleteColumn={onDeleteColumn}
                isDraggable={!!onReorderColumns}
                isColumnDragging={isDraggingColumn && activeColumn?.id === column.id}
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
        </SortableContext>

        {/* Drag overlay - shows the card or column being dragged */}
        <DragOverlay>
          {activeItem && (
            <BoardCard
              item={activeItem}
              schema={schema}
              cardProperties={cardProperties}
              isDragging
            />
          )}
          {activeColumn && (
            <div className="w-72 bg-gray-100 dark:bg-gray-800/50 rounded-lg shadow-lg opacity-80">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: activeColumn.color }}
                />
                <span className="font-medium text-sm text-gray-700 dark:text-gray-200">
                  {activeColumn.name}
                </span>
                <span className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-400 rounded">
                  {activeColumn.items.length}
                </span>
              </div>
              <div className="p-2 text-xs text-gray-400">{activeColumn.items.length} cards</div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
