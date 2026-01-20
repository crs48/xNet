/**
 * @xnet/database - Date Range Property Handler
 *
 * Stores date ranges with start and optional end dates (Unix timestamps)
 */

import type { PropertyConfig, FilterOperator, DateRange } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

export const dateRangeProperty: PropertyHandler<DateRange> = {
  type: 'dateRange',

  validate(value: unknown): ValidationResult {
    if (value === null || value === undefined) {
      return { valid: true }
    }
    if (typeof value !== 'object') {
      return { valid: false, error: 'Must be a date range object' }
    }
    const range = value as Record<string, unknown>
    if (typeof range.start !== 'object' || !(range.start instanceof Date)) {
      // Also accept timestamps
      if (typeof range.start !== 'number') {
        return { valid: false, error: 'Start date is required' }
      }
    }
    return { valid: true }
  },

  coerce(value: unknown): DateRange | null {
    if (value === null || value === undefined) {
      return null
    }
    if (typeof value !== 'object') {
      return null
    }

    const range = value as Record<string, unknown>
    let start: Date | null = null
    let end: Date | null = null

    // Coerce start
    if (range.start instanceof Date) {
      start = range.start
    } else if (typeof range.start === 'number') {
      start = new Date(range.start)
    } else if (typeof range.start === 'string') {
      const parsed = Date.parse(range.start)
      start = Number.isNaN(parsed) ? null : new Date(parsed)
    }

    // Coerce end (optional)
    if (range.end instanceof Date) {
      end = range.end
    } else if (typeof range.end === 'number') {
      end = new Date(range.end)
    } else if (typeof range.end === 'string') {
      const parsed = Date.parse(range.end)
      end = Number.isNaN(parsed) ? null : new Date(parsed)
    }

    if (start === null) {
      return null
    }

    return { start, end }
  },

  format(value: DateRange | null, config: PropertyConfig): string {
    if (value === null) {
      return ''
    }

    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }

    if (config.includeTime) {
      options.hour = 'numeric'
      options.minute = '2-digit'
      options.hour12 = config.timeFormat !== '24h'
    }

    const formatter = new Intl.DateTimeFormat(undefined, options)
    const startStr = formatter.format(value.start)

    if (value.end === null) {
      return `${startStr} - ...`
    }

    const endStr = formatter.format(value.end)
    return `${startStr} - ${endStr}`
  },

  getDefaultValue(): DateRange | null {
    return null
  },

  isEmpty(value: DateRange | null): boolean {
    return value === null
  },

  filterOperators: ['isEmpty', 'isNotEmpty', 'isBefore', 'isAfter'] as const,

  applyFilter(value: DateRange | null, operator: FilterOperator, filterValue: unknown): boolean {
    if (operator === 'isEmpty') {
      return this.isEmpty(value)
    }
    if (operator === 'isNotEmpty') {
      return !this.isEmpty(value)
    }
    if (value === null) {
      return false
    }

    const f = Number(filterValue)
    if (Number.isNaN(f)) {
      return false
    }

    switch (operator) {
      case 'isBefore':
        return value.start.getTime() < f
      case 'isAfter':
        const endTime = value.end?.getTime() ?? value.start.getTime()
        return endTime > f
      default:
        return true
    }
  },

  compare(a: DateRange | null, b: DateRange | null): number {
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1
    return a.start.getTime() - b.start.getTime()
  },

  serialize(value: DateRange | null): unknown {
    if (value === null) {
      return null
    }
    return {
      start: value.start.getTime(),
      end: value.end?.getTime() ?? null
    }
  },

  deserialize(data: unknown): DateRange | null {
    if (data === null || data === undefined) {
      return null
    }
    if (typeof data !== 'object') {
      return null
    }

    const obj = data as Record<string, unknown>
    if (typeof obj.start !== 'number') {
      return null
    }

    return {
      start: new Date(obj.start),
      end: typeof obj.end === 'number' ? new Date(obj.end) : null
    }
  }
}
