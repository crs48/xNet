/**
 * Updated timestamp property helper.
 *
 * This is an auto-populated property that stores when a node was last modified.
 * The value is automatically updated on each change.
 */

import type { PropertyBuilder } from '../types'

export interface UpdatedOptions {
  /** Custom label for UI display */
  label?: string
}

/**
 * Define an updated timestamp property (auto-populated).
 *
 * The value is automatically updated to Date.now() whenever the node is modified.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     updatedAt: updated({ label: 'Last Modified' })
 *   }
 * })
 * // updatedAt is automatically updated on each change
 * ```
 */
export function updated(options: UpdatedOptions = {}): PropertyBuilder<number> {
  return {
    definition: {
      type: 'updated',
      required: false, // Auto-populated, not user-required
      config: {
        label: options.label,
        auto: true,
        readonly: true
      }
    },

    validate(value: unknown): value is number {
      // Updated timestamp should always be a valid number once set
      if (value === null || value === undefined) {
        return true // Will be auto-populated
      }
      return typeof value === 'number' && value > 0 && Number.isFinite(value)
    },

    coerce(value: unknown): number | null {
      if (value === null || value === undefined) {
        return Date.now() // Auto-populate
      }
      if (typeof value === 'number' && value > 0) {
        return value
      }
      // Try to parse date string
      if (typeof value === 'string') {
        const parsed = Date.parse(value)
        if (!isNaN(parsed)) return parsed
      }
      return Date.now()
    },

    _type: 0 as number
  }
}
