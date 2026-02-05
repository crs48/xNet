/**
 * useGalleryState - Hook for managing gallery view state
 */

import type { ViewConfig, GalleryCardSize, GalleryImageFit } from '../types.js'
import type { Schema, PropertyDefinition } from '@xnet/data'
import { useMemo } from 'react'

/**
 * A row in the gallery (generic node with properties)
 */
export interface GalleryRow {
  id: string
  [key: string]: unknown
}

/**
 * Card dimensions by size
 */
export const CARD_SIZES: Record<GalleryCardSize, { width: number; height: number }> = {
  small: { width: 180, height: 200 },
  medium: { width: 240, height: 280 },
  large: { width: 320, height: 360 }
}

/**
 * Options for useGalleryState hook
 */
export interface UseGalleryStateOptions {
  /** Schema defining the properties */
  schema: Schema
  /** Current view configuration */
  view: ViewConfig
  /** Data rows (nodes with flattened properties) */
  data: GalleryRow[]
}

/**
 * Result from useGalleryState hook
 */
export interface UseGalleryStateResult {
  /** Cover property definition */
  coverProperty: PropertyDefinition | undefined
  /** Title property definition (first text property) */
  titleProperty: PropertyDefinition | undefined
  /** Properties to display on cards */
  displayProperties: PropertyDefinition[]
  /** Card dimensions based on size */
  cardDimensions: { width: number; height: number }
  /** Image fit mode */
  imageFit: GalleryImageFit
  /** Whether to show title on cards */
  showTitle: boolean
  /** The items to display */
  items: GalleryRow[]
}

/**
 * Get property key from definition
 */
function getPropertyKey(prop: PropertyDefinition): string {
  return prop['@id'].split('#').pop() || prop.name
}

/**
 * Hook for managing gallery state
 */
export function useGalleryState({
  schema,
  view,
  data
}: UseGalleryStateOptions): UseGalleryStateResult {
  // Get cover property from view config
  const coverProperty = useMemo(() => {
    if (!view.coverProperty) return undefined
    return schema.properties.find((p) => getPropertyKey(p) === view.coverProperty)
  }, [schema.properties, view.coverProperty])

  // Get title property (first text property)
  const titleProperty = useMemo(() => {
    return schema.properties.find((p) => p.type === 'text')
  }, [schema.properties])

  // Get display properties from visible properties
  const displayProperties = useMemo(() => {
    const titleKey = titleProperty ? getPropertyKey(titleProperty) : undefined
    const coverKey = coverProperty ? getPropertyKey(coverProperty) : undefined

    return view.visibleProperties
      .filter((key) => key !== titleKey && key !== coverKey) // Exclude title and cover
      .map((key) => schema.properties.find((p) => getPropertyKey(p) === key))
      .filter((p): p is PropertyDefinition => p !== undefined)
  }, [view.visibleProperties, schema.properties, titleProperty, coverProperty])

  // Card dimensions - default to medium
  const cardSize = view.galleryCardSize || 'medium'
  const cardDimensions = CARD_SIZES[cardSize]

  // Image fit mode - default to cover
  const imageFit = view.galleryImageFit || 'cover'

  // Show title - default to true
  const showTitle = view.galleryShowTitle !== false

  return {
    coverProperty,
    titleProperty,
    displayProperties,
    cardDimensions,
    imageFit,
    showTitle,
    items: data
  }
}

/**
 * Extract cover URL from a property value
 */
export function getCoverUrl(value: unknown): string | null {
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
