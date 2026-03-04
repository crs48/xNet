/**
 * CalendarWeekView - Week view for calendar with time slots
 */

import type { CalendarEvent, WeekStartDay } from './useCalendarState.js'
import { cn } from '@xnetjs/ui'
import React from 'react'
import { getWeekStart, getDayNames, isSameDay, getHours, formatHour } from './useCalendarState.js'

export interface CalendarWeekViewProps {
  /** Current date (determines which week to show) */
  currentDate: Date
  /** Events to display */
  events: CalendarEvent[]
  /** Week start day */
  weekStartsOn: WeekStartDay
  /** Callback when an event is clicked */
  onEventClick?: (eventId: string) => void
  /** Callback when a time slot is clicked */
  onTimeSlotClick?: (date: Date, hour: number) => void
}

/**
 * CalendarWeekView component
 */
export function CalendarWeekView({
  currentDate,
  events,
  weekStartsOn,
  onEventClick,
  onTimeSlotClick
}: CalendarWeekViewProps): React.JSX.Element {
  const weekStart = getWeekStart(currentDate, weekStartsOn)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + i)
    return date
  })
  const dayNames = getDayNames(weekStartsOn)
  const hours = getHours()
  const today = new Date()

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {/* Time column spacer */}
        <div className="w-16 flex-shrink-0" />

        {/* Day columns */}
        {weekDays.map((date, i) => {
          const isToday = isSameDay(date, today)
          return (
            <div
              key={date.toISOString()}
              className="flex-1 py-2 text-center border-l border-gray-200 dark:border-gray-700"
            >
              <div className="text-xs text-gray-500 dark:text-gray-400">{dayNames[i]}</div>
              <div
                className={cn(
                  'text-lg font-medium mt-1',
                  isToday
                    ? 'w-8 h-8 mx-auto bg-blue-600 text-white rounded-full flex items-center justify-center'
                    : 'text-gray-800 dark:text-gray-200'
                )}
              >
                {date.getDate()}
              </div>
            </div>
          )
        })}
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

          {/* Day columns with time slots */}
          {weekDays.map((date) => {
            const dayEvents = events.filter((e) => isSameDay(e.date, date))

            return (
              <div
                key={date.toISOString()}
                className="flex-1 border-l border-gray-200 dark:border-gray-700 relative"
              >
                {/* Time slots */}
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="h-12 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                    onClick={() => onTimeSlotClick?.(date, hour)}
                  />
                ))}

                {/* Events */}
                {dayEvents.map((event) => {
                  const eventHour = event.date.getHours()
                  const eventMinutes = event.date.getMinutes()
                  const top = (eventHour + eventMinutes / 60) * 48 // 48px per hour (h-12)
                  const duration = event.endDate
                    ? (event.endDate.getTime() - event.date.getTime()) / (1000 * 60 * 60)
                    : 1
                  const height = Math.max(duration * 48, 24)

                  return (
                    <div
                      key={event.id}
                      className="absolute left-0.5 right-0.5 px-1 py-0.5 text-xs text-white rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
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
                      <div className="font-medium truncate">{event.title}</div>
                      <div className="text-[10px] opacity-80">
                        {event.date.toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
