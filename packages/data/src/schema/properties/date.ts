/**
 * Date property helper.
 * Stores dates as Unix timestamps (milliseconds).
 */

import type { PropertyBuilder } from '../types'

export interface DateOptions {
  required?: boolean
  includeTime?: boolean
}

/**
 * Define a date property.
 * Dates are stored as Unix timestamps (milliseconds).
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     dueDate: date({ required: true }),
 *     reminder: date({ includeTime: true })
 *   }
 * })
 * ```
 */
export function date(options: DateOptions = {}): PropertyBuilder<number> {
  return {
    definition: {
      type: 'date',
      required: options.required ?? false,
      config: {
        includeTime: options.includeTime ?? false
      }
    },

    validate(value: unknown): value is number {
      if (value === null || value === undefined) {
        return !options.required
      }
      if (typeof value !== 'number') return false
      // Check it's a valid timestamp (between year 1970 and 3000)
      return value >= 0 && value < 32503680000000
    },

    coerce(value: unknown): number | null {
      if (value === null || value === undefined) return null

      // Already a number
      if (typeof value === 'number') {
        return value
      }

      // Date object
      if (value instanceof Date) {
        return value.getTime()
      }

      // ISO string or other parseable format
      if (typeof value === 'string') {
        const parsed = Date.parse(value)
        if (!isNaN(parsed)) return parsed
      }

      return null
    },

    _type: 0 as number
  }
}
