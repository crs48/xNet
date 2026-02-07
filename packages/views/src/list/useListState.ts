/**
 * useListState - State management for ListView
 */

import type { ViewConfig } from '../types.js'
import type { Schema, PropertyDefinition } from '@xnet/data'
import { useMemo } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ListRow {
  id: string
  [key: string]: unknown
}

export interface UseListStateOptions {
  /** Schema defining the list structure */
  schema: Schema
  /** View configuration */
  view: ViewConfig
  /** Data rows */
  data: ListRow[]
}

export interface UseListStateResult {
  /** Processed list items */
  items: ListRow[]
  /** Title property definition */
  titleProperty: PropertyDefinition | null
  /** Checkbox property definition (if any) */
  checkboxProperty: PropertyDefinition | null
  /** Properties to display in the list item */
  displayProperties: PropertyDefinition[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Get property key from definition
 */
function getPropertyKey(prop: PropertyDefinition): string {
  return prop['@id'].split('#').pop() || prop.name
}

// ─── Hook Implementation ─────────────────────────────────────────────────────

/**
 * Hook for managing list view state
 */
export function useListState({ schema, view, data }: UseListStateOptions): UseListStateResult {
  // Find title property (first text property or first visible property)
  const titleProperty = useMemo(() => {
    const properties = schema.properties

    // First try to find a property named 'title' or 'name'
    const titleProp = properties.find((p) => {
      const key = getPropertyKey(p)
      return (
        key === 'title' ||
        key === 'name' ||
        key === 'Title' ||
        key === 'Name' ||
        p.name.toLowerCase() === 'title' ||
        p.name.toLowerCase() === 'name'
      )
    })
    if (titleProp) return titleProp

    // Otherwise use first text property
    const textProp = properties.find((p) => p.type === 'text')
    if (textProp) return textProp

    // Fallback to first visible property
    if (view.visibleProperties.length > 0) {
      return properties.find((p) => getPropertyKey(p) === view.visibleProperties[0]) ?? null
    }

    return properties[0] ?? null
  }, [schema.properties, view.visibleProperties])

  // Find checkbox property (for todo-style lists)
  const checkboxProperty = useMemo(() => {
    const properties = schema.properties

    // Look for checkbox type properties
    const checkboxProp = properties.find((p) => p.type === 'checkbox')
    if (checkboxProp) return checkboxProp

    // Look for common checkbox property names
    const commonNames = ['done', 'completed', 'checked', 'status', 'complete']
    const namedProp = properties.find((p) => {
      const key = getPropertyKey(p)
      return commonNames.some((name) => key.toLowerCase().includes(name))
    })
    if (namedProp && namedProp.type === 'checkbox') return namedProp

    return null
  }, [schema.properties])

  // Get display properties (excluding title and checkbox)
  const displayProperties = useMemo(() => {
    const properties = schema.properties
    const excludeKeys = new Set<string>()

    if (titleProperty) excludeKeys.add(getPropertyKey(titleProperty))
    if (checkboxProperty) excludeKeys.add(getPropertyKey(checkboxProperty))

    // Use visible properties from view config, or all properties
    const visibleKeys =
      view.visibleProperties.length > 0
        ? view.visibleProperties.filter((key) => !excludeKeys.has(key))
        : properties
            .filter((p) => !excludeKeys.has(getPropertyKey(p)))
            .map((p) => getPropertyKey(p))

    return visibleKeys
      .map((key) => properties.find((p) => getPropertyKey(p) === key))
      .filter((p): p is PropertyDefinition => p !== undefined)
      .slice(0, 3) // Limit to 3 display properties for compact view
  }, [schema.properties, view.visibleProperties, titleProperty, checkboxProperty])

  // Process items
  const items = useMemo(() => {
    return data
  }, [data])

  return {
    items,
    titleProperty,
    checkboxProperty,
    displayProperties
  }
}
