/**
 * CalendarView - Main calendar view component with month/week/day modes
 */

import type { ViewConfig } from '../types.js'
import type { Schema } from '@xnet/data'
import { cn } from '@xnet/ui'
import React from 'react'
import { CalendarDayView } from './CalendarDayView.js'
import { CalendarMonthView } from './CalendarMonthView.js'
import { CalendarWeekView } from './CalendarWeekView.js'
import {
  useCalendarState,
  formatCurrentDate,
  type CalendarRow,
  type CalendarViewMode
} from './useCalendarState.js'

export interface CalendarViewProps {
  /** Schema defining the calendar structure */
  schema: Schema
  /** View configuration */
  view: ViewConfig
  /** Data rows */
  data: CalendarRow[]
  /** Callback when a row is updated */
  onUpdateRow?: (rowId: string, propertyId: string, value: unknown) => void
  /** Callback when view config changes */
  onUpdateView?: (changes: Partial<ViewConfig>) => void
  /** Callback when an event is clicked */
  onEventClick?: (eventId: string) => void
  /** Callback when a date/time is clicked (for creating new events) */
  onDateClick?: (date: Date) => void
  /** Additional CSS class */
  className?: string
}

const VIEW_MODE_OPTIONS: { mode: CalendarViewMode; label: string }[] = [
  { mode: 'month', label: 'Month' },
  { mode: 'week', label: 'Week' },
  { mode: 'day', label: 'Day' }
]

/**
 * CalendarView component - calendar with month/week/day modes
 */
export function CalendarView({
  schema,
  view,
  data,
  onUpdateRow,
  onEventClick,
  onDateClick,
  className
}: CalendarViewProps): React.JSX.Element {
  const {
    events,
    currentDate,
    viewMode,
    setViewMode,
    weekStartsOn,
    navigatePrev,
    navigateNext,
    navigateToday
  } = useCalendarState({ schema, view, data, onUpdateRow })

  // Handle time slot click (for week/day views)
  const handleTimeSlotClick = (date: Date, hour: number) => {
    const newDate = new Date(date)
    newDate.setHours(hour, 0, 0, 0)
    onDateClick?.(newDate)
  }

  return (
    <div className={cn('h-full flex flex-col bg-white dark:bg-gray-900', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            onClick={navigatePrev}
            title="Previous"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          <button
            className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            onClick={navigateToday}
          >
            Today
          </button>

          <button
            className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            onClick={navigateNext}
            title="Next"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <span className="ml-2 text-lg font-medium text-gray-800 dark:text-gray-200">
            {formatCurrentDate(currentDate, viewMode)}
          </span>
        </div>

        {/* View mode toggle */}
        <div className="flex gap-1">
          {VIEW_MODE_OPTIONS.map(({ mode, label }) => (
            <button
              key={mode}
              className={cn(
                'px-3 py-1 text-sm rounded transition-colors',
                viewMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              )}
              onClick={() => setViewMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'month' && (
          <CalendarMonthView
            currentDate={currentDate}
            events={events}
            weekStartsOn={weekStartsOn}
            onEventClick={onEventClick}
            onDateClick={onDateClick}
          />
        )}

        {viewMode === 'week' && (
          <CalendarWeekView
            currentDate={currentDate}
            events={events}
            weekStartsOn={weekStartsOn}
            onEventClick={onEventClick}
            onTimeSlotClick={handleTimeSlotClick}
          />
        )}

        {viewMode === 'day' && (
          <CalendarDayView
            currentDate={currentDate}
            events={events}
            onEventClick={onEventClick}
            onTimeSlotClick={handleTimeSlotClick}
          />
        )}
      </div>

      {/* Empty state */}
      {events.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-gray-500 dark:text-gray-400 text-sm">No events to display</div>
        </div>
      )}
    </div>
  )
}
