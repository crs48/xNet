/**
 * Calendar model — pure month-grid math and event lane packing
 * (exploration 0337). All dates are floating local dates (date-model.ts).
 */

import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  isSameMonth,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import type { GridField } from '../grid/model.js'
import type { DatabaseViewConfig, DatabaseViewRow } from './contract.js'
import { rowDateSpan } from './date-model.js'

export interface CalendarEvent {
  row: DatabaseViewRow
  start: Date
  end: Date
}

export interface MonthGrid {
  /** 4–6 weeks × 7 days covering the anchor month */
  weeks: Date[][]
  gridStart: Date
  gridEnd: Date
}

/** The visible month grid (whole weeks, Sunday start). */
export function buildMonthGrid(anchor: Date): MonthGrid {
  const gridStart = startOfWeek(startOfMonth(anchor))
  const gridEnd = endOfWeek(endOfMonth(anchor))
  const weeks: Date[][] = []
  for (let day = gridStart; day <= gridEnd; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)))
  }
  return { weeks, gridStart, gridEnd }
}

/** Rows with a usable date span overlapping [rangeStart, rangeEnd]. */
export function eventsInRange(
  rows: DatabaseViewRow[],
  dateField: GridField,
  config: Pick<DatabaseViewConfig, 'endDateField'>,
  rangeStart: Date,
  rangeEnd: Date
): CalendarEvent[] {
  const events: CalendarEvent[] = []
  for (const row of rows) {
    const span = rowDateSpan(row.cells, dateField.id, dateField.type, config.endDateField)
    if (!span) continue
    if (span.end < rangeStart || span.start > rangeEnd) continue
    events.push({ row, ...span })
  }
  events.sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())
  return events
}

export interface WeekSegment {
  event: CalendarEvent
  /** 0–6 columns within the week (inclusive) */
  startCol: number
  endCol: number
  /** Stacking lane within the week (0 = top) */
  lane: number
  /** Rounded ends: true when the event actually starts/ends in this week */
  isStart: boolean
  isEnd: boolean
}

/**
 * Clip events to one week and greedily pack them into lanes (earlier +
 * longer events claim upper lanes — Google/Notion behaviour).
 */
export function packWeekSegments(events: CalendarEvent[], weekStart: Date): WeekSegment[] {
  const weekEnd = addDays(weekStart, 6)
  const laneEnds: number[] = [] // per-lane last occupied column
  const segments: WeekSegment[] = []
  for (const event of events) {
    if (event.end < weekStart || event.start > weekEnd) continue
    const startCol = Math.max(0, differenceInCalendarDays(event.start, weekStart))
    const endCol = Math.min(6, differenceInCalendarDays(event.end, weekStart))
    let lane = laneEnds.findIndex((last) => last < startCol)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(endCol)
    } else {
      laneEnds[lane] = endCol
    }
    segments.push({
      event,
      startCol,
      endCol,
      lane,
      isStart: event.start >= weekStart,
      isEnd: event.end <= weekEnd
    })
  }
  return segments
}

/** Per-day hidden-event counts for a week, given a visible-lane cap. */
export function overflowByDay(segments: WeekSegment[], maxLanes: number): number[] {
  const counts = Array.from({ length: 7 }, () => 0)
  for (const segment of segments) {
    if (segment.lane < maxLanes) continue
    for (let col = segment.startCol; col <= segment.endCol; col++) counts[col]++
  }
  return counts
}

export { isSameMonth }
