/**
 * useTimelineState - Hook for managing timeline (Gantt) view state
 */

import type { ViewConfig } from '../types.js'
import type { Schema, PropertyDefinition } from '@xnet/data'
import { useMemo, useState, useCallback } from 'react'

/**
 * A row in the timeline (generic node with properties)
 */
export interface TimelineRow {
  id: string
  [key: string]: unknown
}

/**
 * Zoom level options
 */
export type ZoomLevel = 'day' | 'week' | 'month' | 'quarter'

/**
 * Zoom configuration for each level
 */
export interface ZoomConfig {
  unitWidth: number // pixels per unit
  gridInterval: number // days per grid line
  headerFormat: 'day' | 'week' | 'month' | 'year'
}

/**
 * Zoom configurations by level
 */
export const ZOOM_CONFIGS: Record<ZoomLevel, ZoomConfig> = {
  day: { unitWidth: 40, gridInterval: 1, headerFormat: 'day' },
  week: { unitWidth: 120, gridInterval: 7, headerFormat: 'week' },
  month: { unitWidth: 100, gridInterval: 30, headerFormat: 'month' },
  quarter: { unitWidth: 150, gridInterval: 90, headerFormat: 'year' }
}

/**
 * Processed timeline item
 */
export interface TimelineItem {
  id: string
  title: string
  startDate: Date
  endDate: Date
  color: string
  row: TimelineRow
}

/**
 * Timeline date range
 */
export interface TimelineRange {
  start: Date
  end: Date
}

/**
 * Options for useTimelineState hook
 */
export interface UseTimelineStateOptions {
  /** Schema defining the properties */
  schema: Schema
  /** Current view configuration */
  view: ViewConfig
  /** Data rows (nodes with flattened properties) */
  data: TimelineRow[]
  /** Callback when a row is updated */
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
}

/**
 * Result from useTimelineState hook
 */
export interface UseTimelineStateResult {
  /** Processed timeline items */
  items: TimelineItem[]
  /** Current zoom level */
  zoom: ZoomLevel
  /** Set zoom level */
  setZoom: (zoom: ZoomLevel) => void
  /** Zoom configuration */
  zoomConfig: ZoomConfig
  /** Visible date range */
  range: TimelineRange
  /** Total width in pixels */
  totalWidth: number
  /** Update item dates */
  updateItemDates: (itemId: string, startDate: Date, endDate: Date) => void
  /** Date property key */
  datePropertyKey: string | undefined
  /** End date property key */
  endDatePropertyKey: string | undefined
}

/**
 * Get property key from definition
 */
function getPropertyKey(prop: PropertyDefinition): string {
  return prop['@id'].split('#').pop() || prop.name
}

/**
 * Get color for an item based on a select property
 */
function getItemColor(
  item: TimelineRow,
  colorPropertyKey: string | undefined,
  schema: Schema
): string {
  if (!colorPropertyKey) return '#3b82f6' // default blue

  const colorProp = schema.properties.find((p) => getPropertyKey(p) === colorPropertyKey)
  if (!colorProp || colorProp.type !== 'select') return '#3b82f6'

  const optionId = item[colorPropertyKey] as string
  if (!optionId) return '#3b82f6'

  const options = (colorProp.config?.options as Array<{ id: string; color?: string }>) || []
  const option = options.find((o) => o.id === optionId)
  return option?.color || '#3b82f6'
}

const MS_PER_DAY = 86400000

/**
 * Hook for managing timeline state
 */
export function useTimelineState({
  schema,
  view,
  data,
  onUpdateRow
}: UseTimelineStateOptions): UseTimelineStateResult {
  const [zoom, setZoom] = useState<ZoomLevel>('week')

  // Get date properties from view config
  const datePropertyKey = view.dateProperty
  const endDatePropertyKey = view.endDateProperty

  // Get title property (first text property)
  const titleProperty = useMemo(() => {
    return schema.properties.find((p) => p.type === 'text')
  }, [schema.properties])

  // Get color property (first select property after date)
  const colorPropertyKey = useMemo(() => {
    const selectProp = schema.properties.find((p) => p.type === 'select')
    return selectProp ? getPropertyKey(selectProp) : undefined
  }, [schema.properties])

  // Process items
  const items = useMemo<TimelineItem[]>(() => {
    if (!datePropertyKey) return []

    const titleKey = titleProperty ? getPropertyKey(titleProperty) : undefined

    return data
      .filter((row) => {
        const date = row[datePropertyKey]
        return date != null && typeof date === 'number'
      })
      .map((row) => {
        const startTimestamp = row[datePropertyKey] as number
        const endTimestamp = endDatePropertyKey
          ? (row[endDatePropertyKey] as number) || startTimestamp + MS_PER_DAY
          : startTimestamp + MS_PER_DAY

        return {
          id: row.id,
          title: titleKey ? (row[titleKey] as string) || 'Untitled' : 'Untitled',
          startDate: new Date(startTimestamp),
          endDate: new Date(endTimestamp),
          color: getItemColor(row, colorPropertyKey, schema),
          row
        }
      })
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
  }, [data, datePropertyKey, endDatePropertyKey, titleProperty, colorPropertyKey, schema])

  // Calculate date range
  const range = useMemo<TimelineRange>(() => {
    const today = new Date()
    const padding = 7 * MS_PER_DAY

    if (items.length === 0) {
      return {
        start: new Date(today.getTime() - padding),
        end: new Date(today.getTime() + 30 * MS_PER_DAY)
      }
    }

    const minDate = Math.min(...items.map((i) => i.startDate.getTime()))
    const maxDate = Math.max(...items.map((i) => i.endDate.getTime()))

    return {
      start: new Date(minDate - padding),
      end: new Date(maxDate + padding)
    }
  }, [items])

  // Get zoom configuration
  const zoomConfig = ZOOM_CONFIGS[zoom]

  // Calculate total width
  const totalWidth = useMemo(() => {
    const totalDays = Math.ceil((range.end.getTime() - range.start.getTime()) / MS_PER_DAY)
    return totalDays * (zoomConfig.unitWidth / zoomConfig.gridInterval)
  }, [range, zoomConfig])

  // Update item dates
  const updateItemDates = useCallback(
    (itemId: string, startDate: Date, endDate: Date) => {
      if (!onUpdateRow || !datePropertyKey) return

      onUpdateRow(itemId, datePropertyKey, startDate.getTime())
      if (endDatePropertyKey) {
        onUpdateRow(itemId, endDatePropertyKey, endDate.getTime())
      }
    },
    [onUpdateRow, datePropertyKey, endDatePropertyKey]
  )

  return {
    items,
    zoom,
    setZoom,
    zoomConfig,
    range,
    totalWidth,
    updateItemDates,
    datePropertyKey,
    endDatePropertyKey
  }
}

/**
 * Calculate the X position for a date within the timeline
 */
export function getDatePosition(date: Date, range: TimelineRange, zoomConfig: ZoomConfig): number {
  const dayOffset = (date.getTime() - range.start.getTime()) / MS_PER_DAY
  return dayOffset * (zoomConfig.unitWidth / zoomConfig.gridInterval)
}

/**
 * Calculate the width for a date range
 */
export function getDateWidth(startDate: Date, endDate: Date, zoomConfig: ZoomConfig): number {
  const durationDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / MS_PER_DAY)
  return durationDays * (zoomConfig.unitWidth / zoomConfig.gridInterval)
}
