/**
 * Date range property helper.
 */

import type { PropertyBuilder } from '../types'

/**
 * A date range with start and optional end.
 */
export interface DateRange {
  /** Start date as ISO 8601 string */
  start: string
  /** End date as ISO 8601 string (optional for ongoing ranges) */
  end?: string
}

export interface DateRangeOptions {
  required?: boolean
  /** Include time, not just date */
  includeTime?: boolean
}

function isValidDateRange(value: unknown): value is DateRange {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  if (typeof obj.start !== 'string') return false
  if (!isValidDateString(obj.start)) return false
  if (obj.end !== undefined) {
    if (typeof obj.end !== 'string') return false
    if (!isValidDateString(obj.end)) return false
  }
  return true
}

function isValidDateString(str: string): boolean {
  const d = new Date(str)
  return !isNaN(d.getTime())
}

/**
 * Define a date range property.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     duration: dateRange({ includeTime: true }),
 *     vacationPeriod: dateRange({ required: true })
 *   }
 * })
 * ```
 */
export function dateRange(options: DateRangeOptions = {}): PropertyBuilder<DateRange> {
  return {
    definition: {
      type: 'dateRange',
      required: options.required ?? false,
      config: {
        includeTime: options.includeTime ?? false
      }
    },

    validate(value: unknown): value is DateRange {
      if (value === null || value === undefined) {
        return !options.required
      }
      return isValidDateRange(value)
    },

    coerce(value: unknown): DateRange | null {
      if (value === null || value === undefined) return null

      if (isValidDateRange(value)) {
        return value
      }

      // Try to coerce from object
      if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>
        if (obj.start) {
          const start = new Date(obj.start as string)
          if (!isNaN(start.getTime())) {
            const result: DateRange = { start: start.toISOString() }
            if (obj.end) {
              const end = new Date(obj.end as string)
              if (!isNaN(end.getTime())) {
                result.end = end.toISOString()
              }
            }
            return result
          }
        }
      }

      return null
    },

    _type: {} as DateRange
  }
}
