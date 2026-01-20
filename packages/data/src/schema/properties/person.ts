/**
 * Person (DID reference) property helper.
 */

import type { PropertyBuilder } from '../types'
import type { DID } from '../node'

export interface PersonOptions {
  required?: boolean
  /** Allow multiple people */
  multiple?: boolean
}

// DID pattern: did:key:z6Mk... or did:web:... etc.
const DID_PATTERN = /^did:[a-z]+:[a-zA-Z0-9._:-]+$/

/**
 * Define a person reference property.
 * Stores DIDs (decentralized identifiers) that reference users.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     assignee: person({}),
 *     watchers: person({ multiple: true })
 *   }
 * })
 * ```
 */
export function person(options: PersonOptions & { multiple: true }): PropertyBuilder<DID[]>
export function person(options?: PersonOptions): PropertyBuilder<DID>
export function person(options: PersonOptions = {}): PropertyBuilder<DID | DID[]> {
  const isMultiple = options.multiple ?? false

  return {
    definition: {
      type: 'person',
      required: options.required ?? false,
      config: {
        multiple: isMultiple
      }
    },

    validate(value: unknown): value is DID | DID[] {
      if (value === null || value === undefined) {
        return !options.required
      }

      if (isMultiple) {
        if (!Array.isArray(value)) return false
        return value.every((v) => typeof v === 'string' && DID_PATTERN.test(v))
      } else {
        return typeof value === 'string' && DID_PATTERN.test(value)
      }
    },

    coerce(value: unknown): DID | DID[] | null {
      if (value === null || value === undefined) {
        return isMultiple ? [] : null
      }

      if (isMultiple) {
        const arr = Array.isArray(value) ? value : [value]
        return arr.filter((v): v is DID => typeof v === 'string' && DID_PATTERN.test(v))
      } else {
        if (typeof value === 'string' && DID_PATTERN.test(value)) {
          return value as DID
        }
        return null
      }
    },

    _type: (isMultiple ? [] : '') as DID | DID[]
  }
}
