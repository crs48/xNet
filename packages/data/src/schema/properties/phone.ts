/**
 * Phone property helper.
 */

import type { PropertyBuilder } from '../types'

export interface PhoneOptions {
  required?: boolean
  placeholder?: string
}

// Accepts various phone formats: +1-234-567-8900, (234) 567-8900, 234.567.8900, etc.
const PHONE_PATTERN = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/

/**
 * Define a phone number property.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     phone: phone({ placeholder: '+1 (555) 123-4567' })
 *   }
 * })
 * ```
 */
export function phone(options: PhoneOptions = {}): PropertyBuilder<string> {
  return {
    definition: {
      type: 'phone',
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
      // At least 7 digits for a valid phone number
      const digitCount = value.replace(/\D/g, '').length
      return PHONE_PATTERN.test(value) && digitCount >= 7
    },

    coerce(value: unknown): string | null {
      if (value === null || value === undefined || value === '') return null
      // Remove extra whitespace but preserve formatting
      const str = String(value).trim().replace(/\s+/g, ' ')
      return str || null
    },

    _type: '' as string
  }
}
