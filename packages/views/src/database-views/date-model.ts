/**
 * Date semantics for calendar/timeline views (exploration 0339).
 *
 * DECISION — floating wall-clock dates: date cells store `YYYY-MM-DD`
 * (sometimes with a time suffix from imports). Views parse them as LOCAL
 * dates and never round-trip through UTC. A task due `2026-03-14` is due
 * "March 14" in every timezone; two collaborators in Tokyo and Lisbon see
 * the same calendar cell. This matches Notion's date-property behaviour
 * and avoids the classic off-by-one from `new Date('2026-03-14')`
 * (which parses as UTC midnight and renders as March 13 west of GMT).
 */

import { addDays, differenceInCalendarDays, format, parse, startOfDay } from 'date-fns'
import type { CellValue } from '@xnetjs/data'

/** A date cell's day, parsed as a LOCAL date (floating semantics). */
export function parseDateCell(value: CellValue | undefined | null): Date | null {
  if (typeof value !== 'string' || !value) return null
  const dayPart = value.slice(0, 10)
  const parsed = parse(dayPart, 'yyyy-MM-dd', new Date())
  return Number.isNaN(parsed.getTime()) ? null : startOfDay(parsed)
}

/** A dateRange cell ({ start, end } ISO strings), parsed as local dates. */
export function parseDateRangeCell(
  value: CellValue | undefined | null
): { start: Date; end: Date } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const range = value as { start?: unknown; end?: unknown }
  const start = parseDateCell(range.start as CellValue)
  const end = parseDateCell(range.end as CellValue) ?? start
  if (!start || !end) return null
  return end < start ? { start: end, end: start } : { start, end }
}

/** Serialize a local date back to the floating `YYYY-MM-DD` cell format. */
export function toDateCell(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * A row's [start, end] span for calendar/timeline placement. Single date
 * fields span one day; dateRange fields span start→end. Returns null
 * when the row has no usable date.
 */
export function rowDateSpan(
  cells: Record<string, CellValue>,
  dateFieldId: string,
  dateFieldType: string,
  endDateFieldId?: string | null
): { start: Date; end: Date } | null {
  if (dateFieldType === 'dateRange') {
    return parseDateRangeCell(cells[dateFieldId])
  }
  const start = parseDateCell(cells[dateFieldId])
  if (!start) return null
  const end = endDateFieldId ? (parseDateCell(cells[endDateFieldId]) ?? start) : start
  return end < start ? { start: end, end: start } : { start, end }
}

/** Inclusive day count of a span. */
export function spanDays(span: { start: Date; end: Date }): number {
  return differenceInCalendarDays(span.end, span.start) + 1
}

/** Shift a span by whole days (drag-move preserving duration). */
export function shiftSpan(
  span: { start: Date; end: Date },
  days: number
): { start: Date; end: Date } {
  return { start: addDays(span.start, days), end: addDays(span.end, days) }
}

/** Compact label for chips ("Mar 14" or "Mar 14 – Apr 2"). */
export function formatDayLabel(date: Date): string {
  return format(date, 'MMM d')
}
