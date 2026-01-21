/**
 * useCalendarState - Hook for managing calendar view state
 */

import { useMemo, useState, useCallback } from 'react'
import type { Schema, PropertyDefinition } from '@xnet/data'
import type { ViewConfig } from '../types.js'

/**
 * A row in the calendar (generic node with properties)
 */
export interface CalendarRow {
  id: string
  [key: string]: unknown
}

/**
 * Calendar view modes
 */
export type CalendarViewMode = 'month' | 'week' | 'day'

/**
 * Week start day (0 = Sunday, 1 = Monday, 6 = Saturday)
 */
export type WeekStartDay = 0 | 1 | 6

/**
 * A calendar event derived from a data row
 */
export interface CalendarEvent {
  id: string
  title: string
  date: Date
  endDate?: Date
  color: string
  row: CalendarRow
}

/**
 * Options for useCalendarState hook
 */
export interface UseCalendarStateOptions {
  /** Schema defining the properties */
  schema: Schema
  /** Current view configuration */
  view: ViewConfig
  /** Data rows (nodes with flattened properties) */
  data: CalendarRow[]
  /** Callback when a row is updated */
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
}

/**
 * Result from useCalendarState hook
 */
export interface UseCalendarStateResult {
  /** Calendar events */
  events: CalendarEvent[]
  /** Current date (center of view) */
  currentDate: Date
  /** Set current date */
  setCurrentDate: (date: Date) => void
  /** Current view mode */
  viewMode: CalendarViewMode
  /** Set view mode */
  setViewMode: (mode: CalendarViewMode) => void
  /** Week start day */
  weekStartsOn: WeekStartDay
  /** Navigate to previous period */
  navigatePrev: () => void
  /** Navigate to next period */
  navigateNext: () => void
  /** Navigate to today */
  navigateToday: () => void
  /** Move event to new date */
  moveEvent: (eventId: string, newDate: Date) => void
  /** Date property key */
  datePropertyKey: string | undefined
}

/**
 * Get property key from definition
 */
function getPropertyKey(prop: PropertyDefinition): string {
  return prop['@id'].split('#').pop() || prop.name
}

/**
 * Get color for an event based on a select property
 */
function getEventColor(
  item: CalendarRow,
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

/**
 * Hook for managing calendar state
 */
export function useCalendarState({
  schema,
  view,
  data,
  onUpdateRow
}: UseCalendarStateOptions): UseCalendarStateResult {
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month')

  // Get date property from view config
  const datePropertyKey = view.dateProperty
  const endDatePropertyKey = view.endDateProperty

  // Get title property (first text property)
  const titleProperty = useMemo(() => {
    return schema.properties.find((p) => p.type === 'text')
  }, [schema.properties])

  // Get color property (first select property)
  const colorPropertyKey = useMemo(() => {
    const selectProp = schema.properties.find((p) => p.type === 'select')
    return selectProp ? getPropertyKey(selectProp) : undefined
  }, [schema.properties])

  // Week start day - default to Sunday
  const weekStartsOn: WeekStartDay = 0

  // Process items into events
  const events = useMemo<CalendarEvent[]>(() => {
    if (!datePropertyKey) return []

    const titleKey = titleProperty ? getPropertyKey(titleProperty) : undefined

    return data
      .filter((row) => {
        const date = row[datePropertyKey]
        return date != null && typeof date === 'number'
      })
      .map((row) => {
        const timestamp = row[datePropertyKey] as number
        const endTimestamp = endDatePropertyKey ? (row[endDatePropertyKey] as number) : undefined

        return {
          id: row.id,
          title: titleKey ? (row[titleKey] as string) || 'Untitled' : 'Untitled',
          date: new Date(timestamp),
          endDate: endTimestamp ? new Date(endTimestamp) : undefined,
          color: getEventColor(row, colorPropertyKey, schema),
          row
        }
      })
  }, [data, datePropertyKey, endDatePropertyKey, titleProperty, colorPropertyKey, schema])

  // Navigation
  const navigatePrev = useCallback(() => {
    setCurrentDate((prev) => {
      const date = new Date(prev)
      if (viewMode === 'month') {
        date.setMonth(date.getMonth() - 1)
      } else if (viewMode === 'week') {
        date.setDate(date.getDate() - 7)
      } else {
        date.setDate(date.getDate() - 1)
      }
      return date
    })
  }, [viewMode])

  const navigateNext = useCallback(() => {
    setCurrentDate((prev) => {
      const date = new Date(prev)
      if (viewMode === 'month') {
        date.setMonth(date.getMonth() + 1)
      } else if (viewMode === 'week') {
        date.setDate(date.getDate() + 7)
      } else {
        date.setDate(date.getDate() + 1)
      }
      return date
    })
  }, [viewMode])

  const navigateToday = useCallback(() => {
    setCurrentDate(new Date())
  }, [])

  // Move event to new date
  const moveEvent = useCallback(
    (eventId: string, newDate: Date) => {
      if (!onUpdateRow || !datePropertyKey) return
      onUpdateRow(eventId, datePropertyKey, newDate.getTime())
    },
    [onUpdateRow, datePropertyKey]
  )

  return {
    events,
    currentDate,
    setCurrentDate,
    viewMode,
    setViewMode,
    weekStartsOn,
    navigatePrev,
    navigateNext,
    navigateToday,
    moveEvent,
    datePropertyKey
  }
}

// ============================================================================
// Date Utilities
// ============================================================================

/**
 * Check if two dates are the same day
 */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Get the start of a week containing the given date
 */
export function getWeekStart(date: Date, weekStartsOn: WeekStartDay): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day - weekStartsOn + 7) % 7
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Get all weeks for a month view (6 weeks to ensure consistent grid)
 */
export function getMonthWeeks(date: Date, weekStartsOn: WeekStartDay): Date[][] {
  const weeks: Date[][] = []
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0)

  // Start from the first day of the week containing the 1st
  const start = getWeekStart(firstDay, weekStartsOn)

  let current = new Date(start)
  while (current <= lastDay || weeks.length < 6) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
    if (weeks.length === 6) break
  }

  return weeks
}

/**
 * Get day names starting from weekStartsOn
 */
export function getDayNames(
  weekStartsOn: WeekStartDay,
  format: 'short' | 'long' = 'short'
): string[] {
  const days =
    format === 'short'
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return [...days.slice(weekStartsOn), ...days.slice(0, weekStartsOn)]
}

/**
 * Format the current date header based on view mode
 */
export function formatCurrentDate(date: Date, mode: CalendarViewMode): string {
  if (mode === 'month') {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  } else if (mode === 'week') {
    const start = getWeekStart(date, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  } else {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }
}

/**
 * Get hours for day view (0-23)
 */
export function getHours(): number[] {
  return Array.from({ length: 24 }, (_, i) => i)
}

/**
 * Format hour (e.g., "9 AM", "12 PM")
 */
export function formatHour(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  if (hour < 12) return `${hour} AM`
  return `${hour - 12} PM`
}
