/**
 * Number property helper.
 */

import type { PropertyBuilder } from '../types'

export interface NumberOptions {
  required?: boolean
  min?: number
  max?: number
  integer?: boolean
}

/**
 * Define a number property.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     price: number({ required: true, min: 0 }),
 *     quantity: number({ integer: true, min: 1 })
 *   }
 * })
 * ```
 */
export function number(options: NumberOptions = {}): PropertyBuilder<number> {
  return {
    definition: {
      type: 'number',
      required: options.required ?? false,
      config: {
        min: options.min,
        max: options.max,
        integer: options.integer
      }
    },

    validate(value: unknown): value is number {
      if (value === null || value === undefined) {
        return !options.required
      }
      if (typeof value !== 'number' || isNaN(value)) return false
      if (options.min !== undefined && value < options.min) return false
      if (options.max !== undefined && value > options.max) return false
      if (options.integer && !Number.isInteger(value)) return false
      return true
    },

    coerce(value: unknown): number | null {
      if (value === null || value === undefined) return null
      const num = Number(value)
      if (isNaN(num)) return null
      if (options.integer) return Math.round(num)
      return num
    },

    _type: 0 as number
  }
}
