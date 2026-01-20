/**
 * Select property helper with literal type inference.
 */

import type { PropertyBuilder } from '../types'

export interface SelectOption {
  id: string
  name: string
  color?: string
}

export interface SelectOptions<T extends readonly SelectOption[]> {
  options: T
  required?: boolean
  default?: T[number]['id']
}

/**
 * Define a select (single choice) property.
 * Use `as const` on the options array for literal type inference.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     status: select({
 *       options: [
 *         { id: 'todo', name: 'To Do', color: 'gray' },
 *         { id: 'done', name: 'Done', color: 'green' }
 *       ] as const,
 *       default: 'todo'
 *     }),
 *   }
 * })
 * // status type is 'todo' | 'done'
 * ```
 */
export function select<T extends readonly SelectOption[]>(
  options: SelectOptions<T>
): PropertyBuilder<T[number]['id']> {
  type OptionId = T[number]['id']
  const validIds = new Set(options.options.map((o) => o.id))

  return {
    definition: {
      type: 'select',
      required: options.required ?? false,
      config: {
        options: options.options as unknown as SelectOption[],
        default: options.default
      }
    },

    validate(value: unknown): value is OptionId {
      if (value === null || value === undefined) {
        return !options.required
      }
      return typeof value === 'string' && validIds.has(value)
    },

    coerce(value: unknown): OptionId | null {
      if (value === null || value === undefined) {
        return (options.default as OptionId) ?? null
      }
      if (typeof value === 'string' && validIds.has(value)) {
        return value as OptionId
      }
      // Try to match by name
      const byName = options.options.find(
        (o) => o.name.toLowerCase() === String(value).toLowerCase()
      )
      if (byName) return byName.id as OptionId
      return null
    },

    _type: '' as OptionId
  }
}
