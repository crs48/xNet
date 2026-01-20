/**
 * Created timestamp property helper.
 *
 * This is an auto-populated property that stores when a node was created.
 * The value is set automatically at node creation time and cannot be modified.
 */

import type { PropertyBuilder } from '../types'

export interface CreatedOptions {
  /** Custom label for UI display */
  label?: string
}

/**
 * Define a created timestamp property (auto-populated).
 *
 * The value is automatically set to Date.now() when the node is created
 * and cannot be modified afterward.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     createdAt: created({ label: 'Created' })
 *   }
 * })
 * // createdAt is automatically set to creation timestamp
 * ```
 */
export function created(options: CreatedOptions = {}): PropertyBuilder<number> {
  return {
    definition: {
      type: 'created',
      required: false, // Auto-populated, not user-required
      config: {
        label: options.label,
        auto: true,
        readonly: true
      }
    },

    validate(value: unknown): value is number {
      // Created timestamp should always be a valid number once set
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
