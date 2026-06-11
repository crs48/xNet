/**
 * JSON property helper.
 *
 * Stores an arbitrary JSON-serializable value (object, array, or primitive).
 * Used for structured configuration blobs where the shape is owned by the
 * application layer rather than the schema system — e.g. database field
 * configs, view filter trees, per-view layout overrides.
 *
 * The whole value merges with last-write-wins semantics. Do not use json()
 * for data that needs per-key concurrent merging — model those as separate
 * properties or separate nodes instead.
 */

import type { PropertyBuilder } from '../types'

export interface JsonOptions {
  required?: boolean
}

/**
 * Check that a value is composed only of JSON-compatible parts
 * (no functions, symbols, bigints, or class instances beyond plain
 * objects/arrays).
 */
function isJsonValue(value: unknown, depth = 0): boolean {
  // Guard against pathological nesting
  if (depth > 64) return false
  if (value === null) return true
  const t = typeof value
  if (t === 'string' || t === 'boolean') return true
  if (t === 'number') return Number.isFinite(value as number)
  if (Array.isArray(value)) {
    return value.every((v) => isJsonValue(v, depth + 1))
  }
  if (t === 'object') {
    const proto = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return false
    return Object.values(value as Record<string, unknown>).every((v) => isJsonValue(v, depth + 1))
  }
  return false
}

/**
 * Define a JSON property.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     config: json<FieldConfig>({}),
 *     filters: json<FilterGroup>({})
 *   }
 * })
 * ```
 */
export function json<T = unknown>(options: JsonOptions = {}): PropertyBuilder<T> {
  return {
    definition: {
      type: 'json',
      required: options.required ?? false,
      config: {}
    },

    validate(value: unknown): value is T {
      if (value === null || value === undefined) {
        return !options.required
      }
      return isJsonValue(value)
    },

    coerce(value: unknown): T | null {
      if (value === null || value === undefined) return null
      return value as T
    },

    _type: undefined as T
  }
}
