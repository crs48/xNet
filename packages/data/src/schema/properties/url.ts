/**
 * URL property helper.
 */

import type { PropertyBuilder } from '../types'

export interface UrlOptions {
  required?: boolean
  placeholder?: string
}

const URL_PATTERN = /^https?:\/\/.+/i

/**
 * Define a URL property.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     website: url({ placeholder: 'https://example.com' }),
 *     sourceRepo: url({ required: true })
 *   }
 * })
 * ```
 */
export function url(options: UrlOptions = {}): PropertyBuilder<string> {
  return {
    definition: {
      type: 'url',
      required: options.required ?? false,
      config: {
        placeholder: options.placeholder
      }
    },

    validate(value: unknown): value is string {
      if (value === null || value === undefined || value === '') {
        return !options.required
      }
      if (typeof value !== 'string') return false
      return URL_PATTERN.test(value)
    },

    coerce(value: unknown): string | null {
      if (value === null || value === undefined || value === '') return null
      const str = String(value).trim()
      // Auto-add https:// if missing protocol
      if (str && !str.match(/^https?:\/\//i)) {
        return `https://${str}`
      }
      return str || null
    },

    _type: '' as string
  }
}
