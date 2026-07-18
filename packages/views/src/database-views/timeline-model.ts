/**
 * Timeline (roadmap) model — pure time-scale math (exploration 0339).
 *
 * A roadmap, not a Gantt: bars on a horizontal time axis, month/quarter/
 * year zoom, swimlane grouping — no dependency arrows or critical path
 * (GitHub Projects / Linear semantics).
 */

import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfMonth,
  format,
  startOfMonth,
  startOfQuarter
} from 'date-fns'
import type { GridField } from '../grid/model.js'
import type { DatabaseViewConfig, DatabaseViewRow } from './contract.js'
import { rowDateSpan } from './date-model.js'

export type TimelineZoom = 'month' | 'quarter' | 'year'

export const ZOOMS: Array<{ id: TimelineZoom; label: string; pxPerDay: number }> = [
  { id: 'month', label: 'Month', pxPerDay: 24 },
  { id: 'quarter', label: 'Quarter', pxPerDay: 8 },
  { id: 'year', label: 'Year', pxPerDay: 2.5 }
]

export function pxPerDay(zoom: TimelineZoom): number {
  return ZOOMS.find((z) => z.id === zoom)?.pxPerDay ?? 8
}

export interface TimelineItem {
  row: DatabaseViewRow
  start: Date
  end: Date
}

/** Rows with a usable span, given the view's date-field config. */
export function timelineItems(
  rows: DatabaseViewRow[],
  dateField: GridField,
  config: Pick<DatabaseViewConfig, 'endDateField'>
): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const row of rows) {
    const span = rowDateSpan(row.cells, dateField.id, dateField.type, config.endDateField)
    if (span) items.push({ row, ...span })
  }
  return items
}

export interface TimelineRange {
  start: Date
  end: Date
  /** Total width in px at the given zoom */
  width: number
}

/**
 * The rendered time range: whole months covering all items (padded one
 * month each side), or ±2 months around today when there are no items.
 */
export function timelineRange(items: TimelineItem[], zoom: TimelineZoom): TimelineRange {
  const today = new Date()
  let min = items.length ? items[0].start : today
  let max = items.length ? items[0].end : today
  for (const item of items) {
    if (item.start < min) min = item.start
    if (item.end > max) max = item.end
  }
  const start = startOfMonth(addMonths(min, -1))
  const end = endOfMonth(addMonths(max, zoom === 'year' ? 2 : 1))
  return { start, end, width: (differenceInCalendarDays(end, start) + 1) * pxPerDay(zoom) }
}

export function dayOffsetPx(range: TimelineRange, zoom: TimelineZoom, date: Date): number {
  return differenceInCalendarDays(date, range.start) * pxPerDay(zoom)
}

export function barGeometry(
  range: TimelineRange,
  zoom: TimelineZoom,
  item: { start: Date; end: Date }
): { left: number; width: number } {
  const left = dayOffsetPx(range, zoom, item.start)
  const width = (differenceInCalendarDays(item.end, item.start) + 1) * pxPerDay(zoom)
  return { left, width: Math.max(width, 6) }
}

export interface TimelineTick {
  date: Date
  label: string
  left: number
}

/** Major header ticks (months / quarters / quarters+months by zoom). */
export function majorTicks(range: TimelineRange, zoom: TimelineZoom): TimelineTick[] {
  if (zoom === 'year') {
    const months = eachMonthOfInterval({ start: range.start, end: range.end })
    return months
      .filter((m) => m.getTime() === startOfQuarter(m).getTime())
      .map((date) => ({
        date,
        label: `Q${Math.floor(date.getMonth() / 3) + 1} ${format(date, 'yyyy')}`,
        left: dayOffsetPx(range, zoom, date)
      }))
  }
  return eachMonthOfInterval({ start: range.start, end: range.end }).map((date) => ({
    date,
    label: format(date, zoom === 'month' ? 'MMMM yyyy' : 'MMM yyyy'),
    left: dayOffsetPx(range, zoom, date)
  }))
}

/** Minor ticks: days (month zoom) or weeks (quarter/year). */
export function minorTicks(range: TimelineRange, zoom: TimelineZoom): TimelineTick[] {
  if (zoom === 'month') {
    const ticks: TimelineTick[] = []
    for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
      ticks.push({ date: d, label: format(d, 'd'), left: dayOffsetPx(range, zoom, d) })
    }
    return ticks
  }
  return eachWeekOfInterval({ start: range.start, end: range.end }).map((date) => ({
    date,
    label: format(date, 'd MMM'),
    left: dayOffsetPx(range, zoom, date)
  }))
}

/** Snap a pixel delta to whole days at the current zoom. */
export function deltaDays(dx: number, zoom: TimelineZoom): number {
  return Math.round(dx / pxPerDay(zoom))
}
