/**
 * GalleryView - Card-based gallery layout
 */

import type { ViewConfig } from '../types.js'
import type { Schema } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import React from 'react'
import { GalleryCard } from './GalleryCard.js'
import { useGalleryState, type GalleryRow } from './useGalleryState.js'

export interface GalleryViewProps {
  /** Schema defining the gallery structure */
  schema: Schema
  /** View configuration */
  view: ViewConfig
  /** Data rows */
  data: GalleryRow[]
  /** Callback when view config changes */
  onUpdateView?: (changes: Partial<ViewConfig>) => void
  /** Callback when add card is clicked */
  onAddCard?: () => void
  /** Callback when a card is clicked */
  onCardClick?: (itemId: string) => void
  /** Additional CSS class */
  className?: string
}

/**
 * GalleryView component - responsive card grid
 */
export function GalleryView({
  schema,
  view,
  data,
  onAddCard,
  onCardClick,
  className
}: GalleryViewProps): React.JSX.Element {
  const {
    coverProperty,
    titleProperty,
    displayProperties,
    cardDimensions,
    imageFit,
    showTitle,
    items
  } = useGalleryState({ schema, view, data })

  return (
    <div className={cn('h-full overflow-y-auto p-4 bg-white dark:bg-gray-900', className)}>
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${cardDimensions.width}px, 1fr))`
        }}
      >
        {items.map((item) => (
          <GalleryCard
            key={item.id}
            item={item}
            coverProperty={coverProperty}
            titleProperty={titleProperty}
            displayProperties={displayProperties}
            cardDimensions={cardDimensions}
            imageFit={imageFit}
            showTitle={showTitle}
            onClick={onCardClick}
          />
        ))}

        {/* Add card button */}
        {onAddCard && (
          <button
            className={cn(
              'flex items-center justify-center',
              'border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg',
              'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300',
              'hover:border-gray-400 dark:hover:border-gray-500',
              'transition-colors'
            )}
            style={{ width: cardDimensions.width, height: cardDimensions.height }}
            onClick={onAddCard}
          >
            <span className="text-3xl">+</span>
          </button>
        )}
      </div>

      {/* Empty state */}
      {items.length === 0 && !onAddCard && (
        <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          No items to display
        </div>
      )}
    </div>
  )
}
