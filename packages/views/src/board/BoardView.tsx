/**
 * BoardView - Kanban board view with drag-and-drop
 */

import React, { useState, useCallback, useRef } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  type UniqueIdentifier
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
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
  /** Callback when cards are reordered (provides new row order as array of row IDs) */
  onReorderCards?: (rowIds: string[]) => void
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
  onReorderCards,
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
  const [activeColumn, setActiveColumn] = useState<BoardColumnType | null>(null)
  const [isDraggingColumn, setIsDraggingColumn] = useState(false)

  // Track the source column when dragging a card
  const sourceColumnRef = useRef<string | null>(null)

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

  // Find which column contains a card
  const findColumnForCard = useCallback(
    (cardId: string): BoardColumnType | undefined => {
      return columns.find((col) => col.items.some((item) => item.id === cardId))
    },
    [columns]
  )

  // Find column by droppable ID (either column ID directly or prefixed)
  const findColumnById = useCallback(
    (id: string): BoardColumnType | undefined => {
      // Direct column ID (droppable area)
      const direct = columns.find((c) => c.id === id)
      if (direct) return direct

      // Prefixed column ID (sortable column)
      if (id.startsWith('column-')) {
        return columns.find((c) => c.id === id.replace('column-', ''))
      }

      // Card ID - find its column
      return findColumnForCard(id)
    },
    [columns, findColumnForCard]
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
        sourceColumnRef.current = null
      }
      return
    }

    // Dragging a card - find it and its source column
    const sourceColumn = findColumnForCard(activeId)
    if (sourceColumn) {
      const item = sourceColumn.items.find((i) => i.id === activeId)
      if (item) {
        setActiveItem(item)
        sourceColumnRef.current = sourceColumn.id
      }
    }
  }

  const handleDragOver = (_event: DragOverEvent) => {
    // We don't need to track this for visual feedback anymore
    // The column's isOver from useDroppable handles highlighting
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

      onReorderColumns(arrayMove(currentOrder, fromIndex, toIndex))
      return
    }

    // Handle card move/reorder
    const fromColumnId = sourceColumnRef.current

    setActiveItem(null)
    sourceColumnRef.current = null

    if (!over || !fromColumnId) return

    const overId = over.id as string

    // Check if dropped on another card
    const isCardTarget = data.some((row) => row.id === overId)

    // Find destination column
    const destColumn = findColumnById(overId)
    if (!destColumn) return

    const isMovingColumns = destColumn.id !== fromColumnId

    // Update column value if moving between columns
    if (isMovingColumns) {
      moveCard(activeId, fromColumnId, destColumn.id)
    }

    // Handle reordering
    if (onReorderCards) {
      const currentOrder = data.map((row) => row.id)
      const activeIndex = currentOrder.indexOf(activeId)

      if (activeIndex === -1) return

      let overIndex: number

      if (isCardTarget) {
        // Dropped on a card - use that card's index
        overIndex = currentOrder.indexOf(overId)
      } else {
        // Dropped on column - insert at end of that column's items
        const destColumnCards = destColumn.items.map((item) => item.id)
        if (destColumnCards.length === 0) {
          // Empty column - keep at current position or move to end
          if (!isMovingColumns) return
          overIndex = currentOrder.length - 1
        } else {
          // After the last card in destination column
          const lastCardInColumn = destColumnCards[destColumnCards.length - 1]
          overIndex = currentOrder.indexOf(lastCardInColumn)
        }
      }

      if (overIndex === -1) return
      if (activeIndex === overIndex) return

      onReorderCards(arrayMove(currentOrder, activeIndex, overIndex))
    }
  }

  const handleDragCancel = () => {
    setActiveItem(null)
    setActiveColumn(null)
    setIsDraggingColumn(false)
    sourceColumnRef.current = null
  }

  // Custom collision detection for cards and columns
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      // For columns, use closestCenter on column- prefixed items only
      if (isDraggingColumn) {
        return closestCenter(args)
      }

      // For cards: first try to find a card we're directly over (for reordering)
      const pointerCollisions = pointerWithin(args)

      // Check if we're over another card (for reordering within/across columns)
      const cardCollisions = pointerCollisions.filter((collision) => {
        const id = collision.id as string
        // Card IDs are row IDs - not column IDs and not prefixed
        return data.some((row) => row.id === id)
      })

      if (cardCollisions.length > 0) {
        // Return the card collision for reordering
        return [cardCollisions[0]]
      }

      // Otherwise check for column droppables
      const columnCollisions = pointerCollisions.filter((collision) => {
        const id = collision.id as string
        return columns.some((col) => col.id === id) && !id.startsWith('column-')
      })

      if (columnCollisions.length > 0) {
        return columnCollisions
      }

      // Fallback: use rect intersection to find columns
      const rectCollisions = rectIntersection(args)
      const columnRectCollisions = rectCollisions.filter((collision) => {
        const id = collision.id as string
        return columns.some((col) => col.id === id)
      })

      if (columnRectCollisions.length > 0) {
        return columnRectCollisions
      }

      return pointerCollisions
    },
    [isDraggingColumn, columns, data]
  )

  // Column IDs for sortable context (prefixed)
  const sortableColumnIds = columns
    .filter((c) => c.id !== '__all__' && c.id !== '__none__')
    .map((c) => `column-${c.id}`)

  return (
    <div className={cn('h-full overflow-x-auto p-4 bg-white dark:bg-gray-900', className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
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
                isDropTarget={false}
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
