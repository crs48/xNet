/**
 * CreatedBy (author DID) property helper.
 *
 * This is an auto-populated property that stores who created a node.
 * The value is set automatically at node creation time and cannot be modified.
 */

import type { DID } from '../node'
import type { PropertyBuilder } from '../types'

export interface CreatedByOptions {
  /** Custom label for UI display */
  label?: string
}

// DID pattern: did:key:z6Mk... or did:web:... etc.
const DID_PATTERN = /^did:[a-z]+:[a-zA-Z0-9._:-]+$/

/**
 * Define a createdBy (author) property (auto-populated).
 *
 * The value is automatically set to the creator's DID when the node is created
 * and cannot be modified afterward.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     author: createdBy({ label: 'Author' })
 *   }
 * })
 * // author is automatically set to the creator's DID
 * ```
 */
export function createdBy(options: CreatedByOptions = {}): PropertyBuilder<DID> {
  return {
    definition: {
      type: 'createdBy',
      required: false, // Auto-populated, not user-required
      config: {
        label: options.label,
        auto: true,
        readonly: true
      }
    },

    validate(value: unknown): value is DID {
      // CreatedBy should always be a valid DID once set
      if (value === null || value === undefined) {
        return true // Will be auto-populated
      }
      return typeof value === 'string' && DID_PATTERN.test(value)
    },

    coerce(value: unknown): DID | null {
      if (value === null || value === undefined) {
        return null // Must be provided by system
      }
      if (typeof value === 'string' && DID_PATTERN.test(value)) {
        return value as DID
      }
      return null
    },

    _type: '' as DID
  }
}
