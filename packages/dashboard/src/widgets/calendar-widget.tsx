/**
 * Calendar widget - Mini month calendar with per-day item counts from a
 * configurable date property.
 */

import type { WidgetDefinition, WidgetProps } from '../types'
import { useMemo, useState } from 'react'
import { nodeQuery, stubDescriptor, TASK_SCHEMA_IRI } from './shared'

export interface CalendarWidgetConfig extends Record<string, unknown> {
  /** Date property bucketed per day */
  dateProperty?: string
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function CalendarWidget({ config, data }: WidgetProps<CalendarWidgetConfig>): JSX.Element {
  const [monthOffset, setMonthOffset] = useState(0)
  const dateProperty = config.dateProperty ?? 'dueDate'

  const { label, cells, todayKey } = useMemo(() => {
    const now = new Date()
    const first = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
    // Monday-first column for the 1st of the month
    const leading = (first.getDay() + 6) % 7

    const counts = new Map<string, number>()
    for (const row of data.rows) {
      const value = Number(row[dateProperty])
      if (!Number.isFinite(value) || value <= 0) continue
      const key = dayKey(new Date(value))
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    return {
      label: first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      todayKey: dayKey(now),
      cells: [
        ...Array.from({ length: leading }, () => null),
        ...Array.from({ length: daysInMonth }, (_, index) => {
          const date = new Date(first.getFullYear(), first.getMonth(), index + 1)
          return { day: index + 1, key: dayKey(date), count: counts.get(dayKey(date)) ?? 0 }
        })
      ]
    }
  }, [monthOffset, data.rows, dateProperty])

  return (
    <div className="flex h-full flex-col p-2" data-canvas-interactive="true">
      <div className="mb-1 flex items-center justify-between px-1">
        <button
          type="button"
          className="rounded px-1.5 text-muted-foreground hover:bg-accent"
          onClick={() => setMonthOffset((current) => current - 1)}
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-xs font-medium text-foreground">{label}</span>
        <button
          type="button"
          className="rounded px-1.5 text-muted-foreground hover:bg-accent"
          onClick={() => setMonthOffset((current) => current + 1)}
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="grid flex-1 grid-cols-7 gap-0.5 text-center text-[10px]">
        {WEEKDAYS.map((day, index) => (
          <span key={`${day}-${index}`} className="text-muted-foreground">
            {day}
          </span>
        ))}
        {cells.map((cell, index) =>
          cell ? (
            <span
              key={cell.key}
              className={`flex flex-col items-center justify-start rounded py-0.5 ${
                cell.key === todayKey
                  ? 'bg-primary/10 font-semibold text-primary'
                  : 'text-foreground'
              }`}
            >
              {cell.day}
              {cell.count > 0 ? (
                <span
                  className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary"
                  title={`${cell.count} items`}
                />
              ) : null}
            </span>
          ) : (
            <span key={`empty-${index}`} />
          )
        )}
      </div>
    </div>
  )
}

export const calendarWidget: WidgetDefinition<CalendarWidgetConfig> = {
  type: 'calendar.month',
  name: 'Calendar',
  icon: 'calendar',
  description: 'Month view with per-day item counts from a date property',
  trustTier: 'first-party',
  defaultSize: { w: 3, h: 4, minW: 3, minH: 3 },
  configFields: [
    { key: 'dateProperty', label: 'Date property', type: 'property-select', required: true }
  ],
  getStubConfig: () => ({
    config: { dateProperty: 'dueDate' },
    query: {
      descriptor: stubDescriptor('Calendar', nodeQuery(TASK_SCHEMA_IRI, { first: 500 })),
      refresh: 'live'
    }
  }),
  component: CalendarWidget
}
