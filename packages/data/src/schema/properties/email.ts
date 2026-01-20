/**
 * Email property helper.
 */

import type { PropertyBuilder } from '../types'

export interface EmailOptions {
  required?: boolean
  placeholder?: string
}

// Simple email pattern - not exhaustive but catches most valid emails
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Define an email property.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     email: email({ required: true, placeholder: 'user@example.com' })
 *   }
 * })
 * ```
 */
export function email(options: EmailOptions = {}): PropertyBuilder<string> {
  return {
    definition: {
      type: 'email',
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
      return EMAIL_PATTERN.test(value)
    },

    coerce(value: unknown): string | null {
      if (value === null || value === undefined || value === '') return null
      const str = String(value).trim().toLowerCase()
      return str || null
    },

    _type: '' as string
  }
}
