/**
 * Relation (node reference) property helper.
 *
 * Stores a reference to another node by ID. Can optionally constrain the
 * target to a specific schema (typed relation) or leave it unconstrained
 * (untyped relation that can reference any node).
 *
 * This is the xNet equivalent of Datomic's `:db.type/ref` — it tells the
 * system that a property value is a node ID, enabling:
 * - Temp ID resolution in transactions
 * - Reverse lookups and cascade operations (future)
 * - Graph traversal through relation edges (future)
 */

import type { SchemaIRI } from '../node'
import type { PropertyBuilder } from '../types'

export interface RelationOptions {
  /**
   * Target schema IRI to constrain this relation to a specific node type.
   * When omitted, the relation can reference any node regardless of schema.
   *
   * @example
   * // Typed: only references Task nodes
   * parent: relation({ target: 'xnet://xnet.fyi/Task' })
   *
   * // Untyped: references any node
   * target: relation({ required: true })
   */
  target?: SchemaIRI
  required?: boolean
  /** Allow multiple relations */
  multiple?: boolean
}

/**
 * Define a relation property that references other nodes.
 *
 * When `target` is specified, the relation is typed — it declares that
 * values should be node IDs of the given schema. When omitted, the
 * relation is untyped and can reference any node.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     // Typed relation (references Task nodes only)
 *     parent: relation({ target: 'xnet://xnet.fyi/Task' }),
 *     subtasks: relation({ target: 'xnet://xnet.fyi/Task', multiple: true }),
 *
 *     // Untyped relation (references any node)
 *     target: relation({ required: true }),
 *     inReplyTo: relation({})
 *   }
 * })
 * ```
 */
export function relation(options: RelationOptions & { multiple: true }): PropertyBuilder<string[]>
export function relation(options: RelationOptions): PropertyBuilder<string>
export function relation(options: RelationOptions = {}): PropertyBuilder<string | string[]> {
  const isMultiple = options.multiple ?? false

  return {
    definition: {
      type: 'relation',
      required: options.required ?? false,
      config: {
        ...(options.target !== undefined && { target: options.target }),
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
