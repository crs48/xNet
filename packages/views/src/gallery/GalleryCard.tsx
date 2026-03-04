/**
 * GalleryCard - A single card in the gallery view
 */

import type { GalleryImageFit } from '../types.js'
import type { GalleryRow } from './useGalleryState.js'
import type { PropertyDefinition } from '@xnetjs/data'
import { cn } from '@xnetjs/ui'
import React, { useState } from 'react'
import { getPropertyHandler } from '../properties/index.js'

export interface GalleryCardProps {
  /** The item to render */
  item: GalleryRow
  /** Cover property definition */
  coverProperty: PropertyDefinition | undefined
  /** Title property definition */
  titleProperty: PropertyDefinition | undefined
  /** Properties to display on card */
  displayProperties: PropertyDefinition[]
  /** Card dimensions */
  cardDimensions: { width: number; height: number }
  /** Image fit mode */
  imageFit: GalleryImageFit
  /** Whether to show title */
  showTitle: boolean
  /** Callback when card is clicked */
  onClick?: (itemId: string) => void
}

/**
 * Get property key from definition
 */
function getPropertyKey(prop: PropertyDefinition): string {
  return prop['@id'].split('#').pop() || prop.name
}

/**
 * Extract cover URL from a property value
 */
function getCoverUrl(value: unknown): string | null {
  if (!value) return null

  // Handle file property value (object with url)
  if (typeof value === 'object' && value !== null) {
    const file = value as { url?: string; thumbnailUrl?: string }
    return file.thumbnailUrl || file.url || null
  }

  // Handle direct URL string
  if (typeof value === 'string' && (value.startsWith('http') || value.startsWith('/'))) {
    return value
  }

  return null
}

/**
 * GalleryCard component
 */
export function GalleryCard({
  item,
  coverProperty,
  titleProperty,
  displayProperties,
  cardDimensions,
  imageFit,
  showTitle,
  onClick
}: GalleryCardProps): React.JSX.Element {
  const [imageError, setImageError] = useState(false)

  // Get cover URL
  const coverKey = coverProperty ? getPropertyKey(coverProperty) : undefined
  const coverUrl = coverKey ? getCoverUrl(item[coverKey]) : null

  // Get title
  const titleKey = titleProperty ? getPropertyKey(titleProperty) : undefined
  const title = titleKey ? (item[titleKey] as string) : undefined

  // Calculate cover height (60% of card)
  const coverHeight = Math.round(cardDimensions.height * 0.6)

  const handleClick = () => {
    if (onClick) onClick(item.id)
  }

  const handleImageError = () => {
    setImageError(true)
  }

  return (
    <div
      className={cn(
        'flex flex-col bg-white dark:bg-gray-800 rounded-lg overflow-hidden',
        'shadow-sm hover:shadow-md transition-shadow cursor-pointer',
        'border border-gray-200 dark:border-gray-700'
      )}
      style={{ width: cardDimensions.width, height: cardDimensions.height }}
      onClick={handleClick}
    >
      {/* Cover image */}
      <div
        className="relative bg-gray-100 dark:bg-gray-700 overflow-hidden flex-shrink-0"
        style={{ height: coverHeight }}
      >
        {coverUrl && !imageError ? (
          <img
            src={coverUrl}
            alt={title || 'Cover'}
            className={cn(
              'w-full h-full',
              imageFit === 'cover' ? 'object-cover' : 'object-contain'
            )}
            onError={handleImageError}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-600 dark:to-gray-700 flex items-center justify-center">
            <svg
              className="w-12 h-12 text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="flex-1 p-3 flex flex-col gap-2 min-h-0">
        {/* Title */}
        {showTitle && (
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
            {title || 'Untitled'}
          </div>
        )}

        {/* Properties */}
        {displayProperties.length > 0 && (
          <div className="flex flex-col gap-1 overflow-hidden">
            {displayProperties.slice(0, 3).map((prop) => {
              const propKey = getPropertyKey(prop)
              const value = item[propKey]
              if (value === null || value === undefined) return null

              const handler = getPropertyHandler(prop.type)

              return (
                <div key={propKey} className="flex items-center justify-between text-xs gap-2">
                  <span className="text-gray-500 dark:text-gray-400 truncate flex-shrink-0">
                    {prop.name}
                  </span>
                  <span className="text-gray-700 dark:text-gray-300 truncate">
                    {handler.render(value, prop.config)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
