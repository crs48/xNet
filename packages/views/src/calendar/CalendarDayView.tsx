/**
 * CalendarDayView - Single day view for calendar with time slots
 */

import React from 'react'
import { cn } from '@xnet/ui'
import type { CalendarEvent } from './useCalendarState.js'
import { isSameDay, getHours, formatHour } from './useCalendarState.js'

export interface CalendarDayViewProps {
  /** Current date (the day to show) */
  currentDate: Date
  /** Events to display */
  events: CalendarEvent[]
  /** Callback when an event is clicked */
  onEventClick?: (eventId: string) => void
  /** Callback when a time slot is clicked */
  onTimeSlotClick?: (date: Date, hour: number) => void
}

/**
 * CalendarDayView component
 */
export function CalendarDayView({
  currentDate,
  events,
  onEventClick,
  onTimeSlotClick
}: CalendarDayViewProps): React.JSX.Element {
  const hours = getHours()
  const today = new Date()
  const isToday = isSameDay(currentDate, today)
  const dayEvents = events.filter((e) => isSameDay(e.date, currentDate))

  // Current time indicator position
  const now = new Date()
  const currentHour = now.getHours()
  const currentMinutes = now.getMinutes()
  const currentTimeTop = (currentHour + currentMinutes / 60) * 48

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day header */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <div className="w-16 flex-shrink-0" />
        <div className="flex-1 py-3 text-center">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {currentDate.toLocaleDateString('en-US', { weekday: 'long' })}
          </div>
          <div
            className={cn(
              'text-2xl font-medium mt-1',
              isToday
                ? 'w-10 h-10 mx-auto bg-blue-600 text-white rounded-full flex items-center justify-center'
                : 'text-gray-800 dark:text-gray-200'
            )}
          >
            {currentDate.getDate()}
          </div>
        </div>
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex">
          {/* Time labels */}
          <div className="w-16 flex-shrink-0">
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-12 border-b border-gray-100 dark:border-gray-800 pr-2 text-right"
              >
                <span className="text-xs text-gray-500 dark:text-gray-400 -translate-y-2 inline-block">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* Day column */}
          <div className="flex-1 border-l border-gray-200 dark:border-gray-700 relative">
            {/* Time slots */}
            {hours.map((hour) => (
              <div
                key={hour}
                className="h-12 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                onClick={() => onTimeSlotClick?.(currentDate, hour)}
              />
            ))}

            {/* Current time indicator */}
            {isToday && (
              <div
                className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
                style={{ top: currentTimeTop }}
              >
                <div className="w-2 h-2 bg-red-500 rounded-full -ml-1" />
                <div className="flex-1 h-0.5 bg-red-500" />
              </div>
            )}

            {/* Events */}
            {dayEvents.map((event) => {
              const eventHour = event.date.getHours()
              const eventMinutes = event.date.getMinutes()
              const top = (eventHour + eventMinutes / 60) * 48
              const duration = event.endDate
                ? (event.endDate.getTime() - event.date.getTime()) / (1000 * 60 * 60)
                : 1
              const height = Math.max(duration * 48, 24)

              return (
                <div
                  key={event.id}
                  className="absolute left-1 right-1 px-2 py-1 text-white rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    top,
                    height,
                    backgroundColor: event.color
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onEventClick?.(event.id)
                  }}
                  title={event.title}
                >
                  <div className="font-medium text-sm">{event.title}</div>
                  <div className="text-xs opacity-80">
                    {event.date.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit'
                    })}
                    {event.endDate && (
                      <>
                        {' - '}
                        {event.endDate.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
