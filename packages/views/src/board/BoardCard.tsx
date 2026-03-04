/**
 * BoardCard - Draggable card component for board view
 */

import type { BoardRow } from './useBoardState.js'
import type { Schema } from '@xnetjs/data'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@xnetjs/ui'
import React from 'react'
import { getPropertyHandler } from '../properties/index.js'

export interface BoardCardProps {
  /** The item to render */
  item: BoardRow
  /** Schema defining the properties */
  schema: Schema
  /** Properties to show on the card */
  cardProperties: string[]
  /** Whether this card is being dragged (from DragOverlay) */
  isDragging?: boolean
  /** Callback when card is clicked */
  onClick?: (itemId: string) => void
}

/**
 * Get the title property key from schema (first text property)
 */
function getTitlePropertyKey(schema: Schema): string | undefined {
  const titleProp = schema.properties.find((p) => p.type === 'text')
  if (!titleProp) return undefined
  return titleProp['@id'].split('#').pop() || titleProp.name
}

/**
 * BoardCard component - a draggable card in the Kanban board
 */
export function BoardCard({
  item,
  schema,
  cardProperties,
  isDragging,
  onClick
}: BoardCardProps): React.JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  // Get title
  const titleKey = getTitlePropertyKey(schema)
  const title = titleKey ? (item[titleKey] as string) : undefined

  // Get visible properties (excluding title)
  const visibleProperties = cardProperties.filter((key) => key !== titleKey)

  const handleClick = () => {
    if (onClick) onClick(item.id)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white dark:bg-gray-800 rounded-md p-3 shadow-sm',
        'border border-gray-200 dark:border-gray-700',
        'cursor-grab active:cursor-grabbing',
        'hover:shadow-md transition-shadow',
        (isDragging || isSortableDragging) && 'opacity-50 shadow-lg rotate-2'
      )}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      {/* Card title */}
      <div className="font-medium text-gray-900 dark:text-gray-100 text-sm mb-2">
        {title || 'Untitled'}
      </div>

      {/* Card properties */}
      {visibleProperties.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleProperties.map((propKey) => {
            const property = schema.properties.find((p) => {
              const key = p['@id'].split('#').pop() || p.name
              return key === propKey
            })
            if (!property) return null

            const value = item[propKey]
            if (value === null || value === undefined) return null

            const handler = getPropertyHandler(property.type)

            return (
              <div key={propKey} className="text-xs text-gray-600 dark:text-gray-400">
                {handler.render(value, property.config)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
