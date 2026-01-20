/**
 * Relation (node reference) property helper.
 */

import type { PropertyBuilder } from '../types'
import type { SchemaIRI } from '../node'

export interface RelationOptions {
  /** The target schema IRI (e.g., 'xnet://xnet.dev/Task') */
  target: SchemaIRI
  required?: boolean
  /** Allow multiple relations */
  multiple?: boolean
}

/**
 * Define a relation property that references other nodes.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     parent: relation({ target: 'xnet://xnet.dev/Task' }),
 *     subtasks: relation({ target: 'xnet://xnet.dev/Task', multiple: true })
 *   }
 * })
 * ```
 */
export function relation(options: RelationOptions & { multiple: true }): PropertyBuilder<string[]>
export function relation(options: RelationOptions): PropertyBuilder<string>
export function relation(options: RelationOptions): PropertyBuilder<string | string[]> {
  const isMultiple = options.multiple ?? false

  return {
    definition: {
      type: 'relation',
      required: options.required ?? false,
      config: {
        target: options.target,
        multiple: isMultiple
      }
    },

    validate(value: unknown): value is string | string[] {
      if (value === null || value === undefined) {
        return !options.required
      }

      if (isMultiple) {
        if (!Array.isArray(value)) return false
        return value.every((v) => typeof v === 'string' && v.length > 0)
      } else {
        return typeof value === 'string' && value.length > 0
      }
    },

    coerce(value: unknown): string | string[] | null {
      if (value === null || value === undefined) {
        return isMultiple ? [] : null
      }

      if (isMultiple) {
        const arr = Array.isArray(value) ? value : [value]
        return arr.filter((v): v is string => typeof v === 'string' && v.length > 0)
      } else {
        if (typeof value === 'string' && value.length > 0) {
          return value
        }
        return null
      }
    },

    _type: (isMultiple ? [] : '') as string | string[]
  }
}
