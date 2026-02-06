# 06: Calendar View

> Month, week, and day calendar views

**Duration:** 2 weeks
**Dependencies:** 01-property-types.md

> **Architecture Update (Jan 2026):**
>
> - `@xnet/database` → Use `@xnet/data` (Schema system + NodeStore)
> - `DatabaseItem` → `Node`
> - `Database` → `Schema`
> - Import types from `@xnet/data`, hooks from `@xnet/react`

## Overview

The calendar view displays Nodes on a calendar grid based on date properties. Features:

- Month, week, and day views
- Drag to create events
- Drag to reschedule
- Multi-day events
- Color coding

## Implementation

### Calendar Config

```typescript
// packages/views/src/calendar/types.ts

export interface CalendarConfig {
  datePropertyId: string
  endDatePropertyId?: string // For multi-day events
  titlePropertyId?: string
  colorPropertyId?: string
  defaultView: CalendarViewMode
  weekStartsOn: 0 | 1 | 6 // Sunday, Monday, Saturday
}

export type CalendarViewMode = 'month' | 'week' | 'day'
```

### Calendar View Component

```typescript
// packages/views/src/calendar/CalendarView.tsx

import React, { useMemo, useState } from 'react'
import { Database, View, DatabaseItem } from '@xnet/database'
import { CalendarConfig, CalendarViewMode } from './types'
import { MonthView } from './MonthView'
import { WeekView } from './WeekView'
import { DayView } from './DayView'

export interface CalendarViewProps {
  database: Database
  view: View
  items: DatabaseItem[]
  onUpdateItem: (itemId: string, changes: Record<string, unknown>) => void
  className?: string
}

export function CalendarView({
  database,
  view,
  items,
  onUpdateItem,
  className,
}: CalendarViewProps) {
  const config = view.config as CalendarConfig

  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<CalendarViewMode>(config.defaultView)

  // Process items into calendar events
  const events = useMemo(() => {
    return items
      .filter(item => item.properties[config.datePropertyId])
      .map(item => ({
        id: item.id,
        item,
        date: new Date(item.properties[config.datePropertyId] as number),
        endDate: config.endDatePropertyId
          ? new Date(item.properties[config.endDatePropertyId] as number)
          : undefined,
        title: config.titlePropertyId
          ? (item.properties[config.titlePropertyId] as string)
          : 'Untitled',
        color: getEventColor(item, config, database),
      }))
  }, [items, config, database])

  // Navigation handlers
  const navigatePrev = () => {
    setCurrentDate(prev => {
      const date = new Date(prev)
      if (viewMode === 'month') date.setMonth(date.getMonth() - 1)
      else if (viewMode === 'week') date.setDate(date.getDate() - 7)
      else date.setDate(date.getDate() - 1)
      return date
    })
  }

  const navigateNext = () => {
    setCurrentDate(prev => {
      const date = new Date(prev)
      if (viewMode === 'month') date.setMonth(date.getMonth() + 1)
      else if (viewMode === 'week') date.setDate(date.getDate() + 7)
      else date.setDate(date.getDate() + 1)
      return date
    })
  }

  const navigateToday = () => setCurrentDate(new Date())

  // Update event date
  const handleEventMove = (eventId: string, newDate: Date) => {
    onUpdateItem(eventId, {
      [config.datePropertyId]: newDate.getTime(),
    })
  }

  const ViewComponent = {
    month: MonthView,
    week: WeekView,
    day: DayView,
  }[viewMode]

  return (
    <div className={`calendar-view ${className || ''}`}>
      {/* Toolbar */}
      <div className="calendar-toolbar">
        <div className="nav-controls">
          <button onClick={navigatePrev}>‹</button>
          <button onClick={navigateToday}>Today</button>
          <button onClick={navigateNext}>›</button>
          <span className="current-date">
            {formatCurrentDate(currentDate, viewMode)}
          </span>
        </div>

        <div className="view-controls">
          {(['month', 'week', 'day'] as const).map(mode => (
            <button
              key={mode}
              className={viewMode === mode ? 'active' : ''}
              onClick={() => setViewMode(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar content */}
      <ViewComponent
        currentDate={currentDate}
        events={events}
        weekStartsOn={config.weekStartsOn}
        onEventMove={handleEventMove}
        onDateClick={(date) => console.log('Create event on', date)}
      />
    </div>
  )
}

function getEventColor(item: DatabaseItem, config: CalendarConfig, database: Database): string {
  if (!config.colorPropertyId) return '#4a90d9'
  const colorProp = database.properties.find(p => p.id === config.colorPropertyId)
  if (!colorProp || colorProp.type !== 'select') return '#4a90d9'
  const optionId = item.properties[config.colorPropertyId] as string
  const option = colorProp.config.options?.find(o => o.id === optionId)
  return option?.color || '#4a90d9'
}

function formatCurrentDate(date: Date, mode: CalendarViewMode): string {
  if (mode === 'month') {
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  } else if (mode === 'week') {
    const start = getWeekStart(date, 0)
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
  } else {
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }
}

function getWeekStart(date: Date, weekStartsOn: number): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = (day - weekStartsOn + 7) % 7
  d.setDate(d.getDate() - diff)
  return d
}
```

### Month View

```typescript
// packages/views/src/calendar/MonthView.tsx

import React from 'react'
import { CalendarEvent } from './types'

interface MonthViewProps {
  currentDate: Date
  events: CalendarEvent[]
  weekStartsOn: number
  onEventMove: (eventId: string, newDate: Date) => void
  onDateClick: (date: Date) => void
}

export function MonthView({
  currentDate,
  events,
  weekStartsOn,
  onEventMove,
  onDateClick,
}: MonthViewProps) {
  const weeks = getMonthWeeks(currentDate, weekStartsOn)
  const today = new Date()

  return (
    <div className="month-view">
      {/* Day headers */}
      <div className="month-header">
        {getDayNames(weekStartsOn).map(day => (
          <div key={day} className="day-header">{day}</div>
        ))}
      </div>

      {/* Week rows */}
      <div className="month-body">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="week-row">
            {week.map(date => {
              const isToday = isSameDay(date, today)
              const isCurrentMonth = date.getMonth() === currentDate.getMonth()
              const dayEvents = events.filter(e => isSameDay(e.date, date))

              return (
                <div
                  key={date.toISOString()}
                  className={`day-cell ${isToday ? 'today' : ''} ${isCurrentMonth ? '' : 'other-month'}`}
                  onClick={() => onDateClick(date)}
                >
                  <span className="day-number">{date.getDate()}</span>

                  <div className="day-events">
                    {dayEvents.slice(0, 3).map(event => (
                      <div
                        key={event.id}
                        className="event-pill"
                        style={{ backgroundColor: event.color }}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('eventId', event.id)
                        }}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="more-events">
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

function getMonthWeeks(date: Date, weekStartsOn: number): Date[][] {
  const weeks: Date[][] = []
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1)
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0)

  // Start from the first day of the week containing the 1st
  const start = new Date(firstDay)
  const dayOffset = (start.getDay() - weekStartsOn + 7) % 7
  start.setDate(start.getDate() - dayOffset)

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

function getDayNames(weekStartsOn: number): string[] {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return [...days.slice(weekStartsOn), ...days.slice(0, weekStartsOn)]
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}
```

### Styles

```css
/* packages/views/src/calendar/calendar.css */

.calendar-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.calendar-toolbar {
  display: flex;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
}

.nav-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.current-date {
  font-weight: 500;
  min-width: 200px;
}

/* Month view */
.month-view {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.month-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--border);
}

.day-header {
  padding: 8px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

.month-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.week-row {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--border-light);
}

.day-cell {
  padding: 4px;
  border-right: 1px solid var(--border-light);
  min-height: 100px;
  cursor: pointer;
}

.day-cell:hover {
  background: var(--bg-hover);
}

.day-cell.today .day-number {
  background: var(--accent);
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.day-cell.other-month {
  color: var(--text-tertiary);
  background: var(--bg-secondary);
}

.day-number {
  font-size: 12px;
  font-weight: 500;
}

.day-events {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.event-pill {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 11px;
  color: white;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: grab;
}

.more-events {
  font-size: 11px;
  color: var(--text-secondary);
  padding: 2px 6px;
}
```

## Checklist

### Week 1: Month View

- [ ] CalendarView with toolbar
- [ ] MonthView component
- [ ] Day cell with events
- [ ] Event pills with colors
- [ ] Navigation (prev/next/today)
- [ ] Today highlighting
- [ ] Other month days styling

### Week 2: Week/Day Views + Interactions

- [ ] WeekView component
- [ ] DayView component with time slots
- [ ] Drag to reschedule events
- [ ] Drag to create events
- [ ] Multi-day event spanning
- [ ] Click event to open
- [ ] All tests pass

---

[← Back to Timeline View](./05-view-timeline.md) | [Next: Formula Engine →](./07-formula-engine.md)
