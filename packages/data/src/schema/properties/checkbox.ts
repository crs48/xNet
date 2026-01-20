/**
 * Checkbox (boolean) property helper.
 */

import type { PropertyBuilder } from '../types'

export interface CheckboxOptions {
  required?: boolean
  default?: boolean
}

/**
 * Define a checkbox (boolean) property.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     completed: checkbox({ default: false }),
 *     archived: checkbox({})
 *   }
 * })
 * ```
 */
export function checkbox(options: CheckboxOptions = {}): PropertyBuilder<boolean> {
  return {
    definition: {
      type: 'checkbox',
      required: options.required ?? false,
      config: {
        default: options.default
      }
    },

    validate(value: unknown): value is boolean {
      if (value === null || value === undefined) {
        return !options.required
      }
      return typeof value === 'boolean'
    },

    coerce(value: unknown): boolean | null {
      if (value === null || value === undefined) {
        return options.default ?? null
      }
      if (typeof value === 'boolean') return value
      if (value === 'true' || value === 1) return true
      if (value === 'false' || value === 0) return false
      return Boolean(value)
    },

    _type: false as boolean
  }
}
