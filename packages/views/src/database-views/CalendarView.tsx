/**
 * CalendarView — V2 month calendar (exploration 0339).
 *
 * Events position by the configured date field (single `date` or
 * `dateRange`; an optional end-date field turns single dates into spans).
 * Multi-day events render as packed lane bars per week; cells cap at
 * three lanes with a "+N more" overflow popover. Dragging an event to a
 * day rewrites its date cells in ONE node write, preserving duration.
 * Dates are floating local dates — see date-model.ts.
 */

import { addDays, addMonths, differenceInCalendarDays, format, isToday } from 'date-fns'
import type { CellValue } from '@xnetjs/data'
import { useEntangleBind, useEntangledHighlight } from '@xnetjs/react'
import { cn } from '@xnetjs/ui'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import React, { useCallback, useMemo, useState } from 'react'
import { optionChipStyle } from '../properties/optionColors.js'
import { WindowFootnote } from './card-bits.js'
import {
  buildMonthGrid,
  eventsInRange,
  isSameMonth,
  overflowByDay,
  packWeekSegments,
  type CalendarEvent,
  type WeekSegment
} from './calendar-model.js'
import { resolveDateField, rowTitle, type DatabaseViewProps } from './contract.js'
import { rowDateSpan, toDateCell } from './date-model.js'

const MAX_LANES = 3
const LANE_HEIGHT = 22

/** One lane-packed event bar — extracted so entangle hooks run per chip. */
function CalendarEventBar({
  segment,
  fields,
  colorField,
  draggable,
  onOpenRow
}: {
  segment: WeekSegment
  fields: DatabaseViewProps['fields']
  colorField: DatabaseViewProps['fields'][number] | undefined
  draggable: boolean
  onOpenRow?: (rowId: string) => void
}): React.JSX.Element {
  const rowId = segment.event.row.id
  // Entangle bus (0346): chip ↔ sibling frames co-highlight.
  const entangleBind = useEntangleBind(rowId)
  const entangled = useEntangledHighlight(rowId)
  const style = eventStyle(segment.event, colorField)
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-xnet-row', rowId)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn(
        'absolute z-10 truncate px-1.5 text-left text-[11px] leading-5',
        segment.isStart ? 'rounded-l' : '',
        segment.isEnd ? 'rounded-r' : '',
        entangled && 'ring-2 ring-amber-300/80 dark:ring-amber-500/50'
      )}
      style={{
        ...style,
        top: 24 + segment.lane * LANE_HEIGHT,
        left: `calc(${(segment.startCol / 7) * 100}% + 4px)`,
        width: `calc(${((segment.endCol - segment.startCol + 1) / 7) * 100}% - 8px)`,
        height: LANE_HEIGHT - 4
      }}
      data-testid="calendar-event"
      data-row-id={rowId}
      onClick={() => onOpenRow?.(rowId)}
      {...entangleBind}
    >
      {rowTitle(segment.event.row, fields)}
    </button>
  )
}

function eventStyle(
  event: CalendarEvent,
  colorField: DatabaseViewProps['fields'][number] | undefined
): React.CSSProperties {
  if (colorField) {
    const value = event.row.cells[colorField.id]
    const optionId = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : null
    const option =
      typeof optionId === 'string' ? colorField.options?.find((o) => o.id === optionId) : undefined
    if (option) return optionChipStyle(option.color)
  }
  return optionChipStyle('blue')
}

export function CalendarView(props: DatabaseViewProps): React.JSX.Element {
  const {
    fields,
    rows,
    window: viewWindow,
    config,
    className,
    onMoveCard,
    onOpenRow,
    onCreateRow
  } = props

  const [anchor, setAnchor] = useState(() => new Date())
  const [overflowCell, setOverflowCell] = useState<string | null>(null)

  const dateField = resolveDateField(fields, config)
  const colorField = config.colorBy ? fields.find((f) => f.id === config.colorBy) : undefined
  const grid = useMemo(() => buildMonthGrid(anchor), [anchor])
  const events = useMemo(
    () => (dateField ? eventsInRange(rows, dateField, config, grid.gridStart, grid.gridEnd) : []),
    [rows, dateField, config, grid]
  )

  // Empty-month affordance: when the visible month has no events but the
  // data does, offer a jump to the nearest event (demo data and archives
  // otherwise open onto a blank grid).
  const nearestEventStart = useMemo(() => {
    if (!dateField || events.length > 0) return null
    let nearest: Date | null = null
    let nearestDistance = Infinity
    for (const row of rows) {
      const span = rowDateSpan(row.cells, dateField.id, dateField.type, config.endDateField)
      if (!span) continue
      const distance = Math.abs(span.start.getTime() - anchor.getTime())
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = span.start
      }
    }
    return nearest
  }, [rows, dateField, config.endDateField, events.length, anchor])

  // Drop = shift the event's span so it starts on the target day
  const handleDrop = useCallback(
    (day: Date, rowId: string) => {
      if (!dateField || !onMoveCard) return
      const event = events.find((e) => e.row.id === rowId)
      if (!event) return
      const delta = differenceInCalendarDays(day, event.start)
      if (delta === 0) return
      const start = addDays(event.start, delta)
      const end = addDays(event.end, delta)
      const cells: Record<string, CellValue> = {}
      if (dateField.type === 'dateRange') {
        cells[dateField.id] = { start: toDateCell(start), end: toDateCell(end) } as CellValue
      } else {
        cells[dateField.id] = toDateCell(start)
        if (config.endDateField) cells[config.endDateField] = toDateCell(end)
      }
      onMoveCard(rowId, cells)
    },
    [dateField, events, config.endDateField, onMoveCard]
  )

  const handleCreate = useCallback(
    (day: Date) => {
      if (!dateField || !onCreateRow) return
      const value: CellValue =
        dateField.type === 'dateRange'
          ? ({ start: toDateCell(day), end: toDateCell(day) } as CellValue)
          : toDateCell(day)
      onCreateRow({ [dateField.id]: value })
    },
    [dateField, onCreateRow]
  )

  if (!dateField) {
    return (
      <div
        className={cn('flex h-full items-center justify-center p-8 text-sm text-ink-3', className)}
      >
        Add a date field to place rows on the calendar.
      </div>
    )
  }

  return (
    <div
      className={cn('flex h-full flex-col overflow-hidden', className)}
      data-testid="calendar-view"
    >
      {/* Month header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-ink-1">{format(anchor, 'MMMM yyyy')}</span>
        {nearestEventStart && (
          <button
            type="button"
            className="rounded px-2 py-0.5 text-xs text-primary hover:bg-surface-1"
            data-testid="calendar-jump-to-events"
            onClick={() => setAnchor(nearestEventStart)}
          >
            Jump to events ({format(nearestEventStart, 'MMM yyyy')})
          </button>
        )}
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Previous month"
          className="rounded p-1 text-ink-3 hover:bg-surface-1"
          onClick={() => setAnchor((a) => addMonths(a, -1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-xs text-ink-2 hover:bg-surface-1"
          onClick={() => setAnchor(new Date())}
        >
          Today
        </button>
        <button
          type="button"
          aria-label="Next month"
          className="rounded p-1 text-ink-3 hover:bg-surface-1"
          onClick={() => setAnchor((a) => addMonths(a, 1))}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-border">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="px-2 py-1 text-right text-[11px] text-ink-3">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {grid.weeks.map((week, weekIndex) => {
          const segments = packWeekSegments(events, week[0])
          const visible = segments.filter((s) => s.lane < MAX_LANES)
          const overflow = overflowByDay(segments, MAX_LANES)
          return (
            <div
              key={weekIndex}
              className="relative grid flex-1 grid-cols-7 border-b border-border"
              style={{ minHeight: 24 + (MAX_LANES + 1) * LANE_HEIGHT }}
            >
              {/* Day cells */}
              {week.map((day, dayIndex) => {
                const cellKey = `${weekIndex}:${dayIndex}`
                const hidden = overflow[dayIndex]
                return (
                  <div
                    key={cellKey}
                    className={cn(
                      'group/cell relative border-r border-border px-1 pt-0.5 last:border-r-0',
                      !isSameMonth(day, anchor) && 'bg-surface-1/40'
                    )}
                    data-testid="calendar-cell"
                    data-date={toDateCell(day)}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('application/x-xnet-row'))
                        e.preventDefault()
                    }}
                    onDrop={(e) => {
                      const rowId = e.dataTransfer.getData('application/x-xnet-row')
                      if (rowId) {
                        e.preventDefault()
                        handleDrop(day, rowId)
                      }
                    }}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {onCreateRow && (
                        <button
                          type="button"
                          aria-label={`Add row on ${toDateCell(day)}`}
                          className="rounded p-0.5 text-ink-3 opacity-0 hover:bg-surface-1 group-hover/cell:opacity-100"
                          onClick={() => handleCreate(day)}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      )}
                      <span
                        className={cn(
                          'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]',
                          isToday(day) ? 'bg-primary font-semibold text-white' : 'text-ink-2'
                        )}
                      >
                        {day.getDate()}
                      </span>
                    </div>
                    {hidden > 0 && (
                      <button
                        type="button"
                        className="absolute inset-x-1 text-left text-[11px] text-ink-3 hover:text-ink-1"
                        style={{ top: 24 + MAX_LANES * LANE_HEIGHT }}
                        onClick={() => setOverflowCell(overflowCell === cellKey ? null : cellKey)}
                      >
                        +{hidden} more
                      </button>
                    )}
                    {overflowCell === cellKey && (
                      <div className="absolute left-0 top-6 z-30 w-52 rounded-lg border border-hairline bg-popover p-1 shadow-pop">
                        {segments
                          .filter((s) => s.startCol <= dayIndex && s.endCol >= dayIndex)
                          .map((s) => (
                            <button
                              key={s.event.row.id}
                              type="button"
                              className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
                              onClick={() => {
                                setOverflowCell(null)
                                onOpenRow?.(s.event.row.id)
                              }}
                            >
                              {rowTitle(s.event.row, fields)}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Event bars (lane-packed, spanning columns) */}
              {visible.map((segment) => (
                <CalendarEventBar
                  key={`${segment.event.row.id}:${segment.startCol}`}
                  segment={segment}
                  fields={fields}
                  colorField={colorField}
                  draggable={Boolean(onMoveCard)}
                  onOpenRow={onOpenRow}
                />
              ))}
            </div>
          )
        })}
      </div>
      <WindowFootnote shown={rows.length} window={viewWindow} />
    </div>
  )
}
