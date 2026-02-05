/**
 * CalendarMonthView - Month grid view for calendar
 */

import type { CalendarEvent, WeekStartDay } from './useCalendarState.js'
import { cn } from '@xnet/ui'
import React from 'react'
import { getMonthWeeks, getDayNames, isSameDay } from './useCalendarState.js'

export interface CalendarMonthViewProps {
  /** Current date (determines which month to show) */
  currentDate: Date
  /** Events to display */
  events: CalendarEvent[]
  /** Week start day */
  weekStartsOn: WeekStartDay
  /** Callback when an event is clicked */
  onEventClick?: (eventId: string) => void
  /** Callback when a date cell is clicked */
  onDateClick?: (date: Date) => void
}

/**
 * CalendarMonthView component
 */
export function CalendarMonthView({
  currentDate,
  events,
  weekStartsOn,
  onEventClick,
  onDateClick
}: CalendarMonthViewProps): React.JSX.Element {
  const weeks = getMonthWeeks(currentDate, weekStartsOn)
  const dayNames = getDayNames(weekStartsOn)
  const today = new Date()

  return (
    <div className="flex flex-col flex-1">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        {dayNames.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="flex-1 grid grid-rows-6">
        {weeks.map((week, weekIndex) => (
          <div
            key={weekIndex}
            className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-800"
          >
            {week.map((date) => {
              const isToday = isSameDay(date, today)
              const isCurrentMonth = date.getMonth() === currentDate.getMonth()
              const dayEvents = events.filter((e) => isSameDay(e.date, date))

              return (
                <div
                  key={date.toISOString()}
                  className={cn(
                    'min-h-[100px] p-1 border-r border-gray-100 dark:border-gray-800',
                    'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
                    !isCurrentMonth && 'bg-gray-50 dark:bg-gray-900/50'
                  )}
                  onClick={() => onDateClick?.(date)}
                >
                  {/* Day number */}
                  <div className="flex justify-end">
                    <span
                      className={cn(
                        'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full',
                        isToday
                          ? 'bg-blue-600 text-white'
                          : isCurrentMonth
                            ? 'text-gray-700 dark:text-gray-300'
                            : 'text-gray-400 dark:text-gray-600'
                      )}
                    >
                      {date.getDate()}
                    </span>
                  </div>

                  {/* Events */}
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <div
                        key={event.id}
                        className="px-1.5 py-0.5 text-xs text-white rounded truncate cursor-pointer hover:opacity-80 transition-opacity"
                        style={{ backgroundColor: event.color }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEventClick?.(event.id)
                        }}
                        title={event.title}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="px-1.5 text-xs text-gray-500 dark:text-gray-400">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
