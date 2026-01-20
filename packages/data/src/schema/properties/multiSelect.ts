/**
 * Multi-select property helper with literal type inference.
 */

import type { PropertyBuilder } from '../types'
import type { SelectOption } from './select'

export interface MultiSelectOptions<T extends readonly SelectOption[]> {
  options: T
  required?: boolean
  default?: T[number]['id'][]
}

/**
 * Define a multi-select (multiple choice) property.
 * Use `as const` on the options array for literal type inference.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     tags: multiSelect({
 *       options: [
 *         { id: 'bug', name: 'Bug', color: 'red' },
 *         { id: 'feature', name: 'Feature', color: 'blue' },
 *         { id: 'docs', name: 'Documentation', color: 'green' }
 *       ] as const
 *     }),
 *   }
 * })
 * // tags type is ('bug' | 'feature' | 'docs')[]
 * ```
 */
export function multiSelect<T extends readonly SelectOption[]>(
  options: MultiSelectOptions<T>
): PropertyBuilder<T[number]['id'][]> {
  type OptionId = T[number]['id']
  const validIds = new Set(options.options.map((o) => o.id))

  return {
    definition: {
      type: 'multiSelect',
      required: options.required ?? false,
      config: {
        options: options.options as unknown as SelectOption[],
        default: options.default
      }
    },

    validate(value: unknown): value is OptionId[] {
      if (value === null || value === undefined) {
        return !options.required
      }
      if (!Array.isArray(value)) return false
      return value.every((v) => typeof v === 'string' && validIds.has(v))
    },

    coerce(value: unknown): OptionId[] | null {
      if (value === null || value === undefined) {
        return (options.default as OptionId[]) ?? []
      }
      if (!Array.isArray(value)) {
        // Try to coerce single value to array
        if (typeof value === 'string' && validIds.has(value)) {
          return [value as OptionId]
        }
        return null
      }
      const result: OptionId[] = []
      for (const v of value) {
        if (typeof v === 'string' && validIds.has(v)) {
          result.push(v as OptionId)
        } else {
          // Try to match by name
          const byName = options.options.find(
            (o) => o.name.toLowerCase() === String(v).toLowerCase()
          )
          if (byName) result.push(byName.id as OptionId)
        }
      }
      return result
    },

    _type: [] as OptionId[]
  }
}
