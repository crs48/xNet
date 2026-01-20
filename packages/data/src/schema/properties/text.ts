/**
 * Text property helper.
 */

import type { PropertyBuilder } from '../types'

export interface TextOptions {
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  placeholder?: string
}

/**
 * Define a text property.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     title: text({ required: true, maxLength: 500 }),
 *     description: text({})
 *   }
 * })
 * ```
 */
export function text(options: TextOptions = {}): PropertyBuilder<string> {
  return {
    definition: {
      type: 'text',
      required: options.required ?? false,
      config: {
        minLength: options.minLength,
        maxLength: options.maxLength,
        pattern: options.pattern?.source,
        placeholder: options.placeholder
      }
    },

    validate(value: unknown): value is string {
      if (value === null || value === undefined) {
        return !options.required
      }
      if (typeof value !== 'string') return false
      if (options.minLength !== undefined && value.length < options.minLength) return false
      if (options.maxLength !== undefined && value.length > options.maxLength) return false
      if (options.pattern && !options.pattern.test(value)) return false
      return true
    },

    coerce(value: unknown): string | null {
      if (value === null || value === undefined) return null
      return String(value)
    },

    _type: '' as string
  }
}
