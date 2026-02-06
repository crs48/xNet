/**
 * Lens Builder Utilities - Helper functions for creating schema lenses.
 *
 * These utilities make it easy to define common schema transformations
 * like renaming properties, converting values, or adding defaults.
 *
 * @example
 * ```typescript
 * import { composeLens, rename, convert, addDefault } from '@xnet/data'
 *
 * const taskV1toV2 = composeLens(
 *   'xnet://xnet.fyi/Task@1.0.0',
 *   'xnet://xnet.fyi/Task@2.0.0',
 *   rename('complete', 'status'),
 *   convert('status', { true: 'done', false: 'todo' }, { done: true, todo: false }),
 *   addDefault('priority', 'medium')
 * )
 * ```
 */

import type { SchemaLens, LensOperation } from './lens'
import type { SchemaIRI } from './node'

// ─── Property Operations ─────────────────────────────────────────────────────

/**
 * Rename a property from one name to another.
 *
 * @example
 * ```typescript
 * rename('complete', 'status')
 * // { complete: true } → { status: true }
 * ```
 */
export function rename(from: string, to: string): LensOperation {
  return {
    forward: (data) => {
      const { [from]: value, ...rest } = data
      return value !== undefined ? { ...rest, [to]: value } : rest
    },
    backward: (data) => {
      const { [to]: value, ...rest } = data
      return value !== undefined ? { ...rest, [from]: value } : rest
    },
    lossless: true
  }
}

/**
 * Convert property values using a mapping.
 *
 * @example
 * ```typescript
 * convert('status',
 *   { true: 'done', false: 'todo' },     // forward map
 *   { done: true, todo: false }           // backward map
 * )
 * // { status: true } → { status: 'done' }
 * ```
 */
export function convert<T extends string | number | boolean, U extends string | number | boolean>(
  prop: string,
  forwardMap: Record<string, U>,
  backwardMap: Record<string, T>
): LensOperation {
  return {
    forward: (data) => {
      const value = data[prop]
      if (value === undefined) return data
      const key = String(value)
      const mapped = forwardMap[key]
      return mapped !== undefined ? { ...data, [prop]: mapped } : data
    },
    backward: (data) => {
      const value = data[prop]
      if (value === undefined) return data
      const key = String(value)
      const mapped = backwardMap[key]
      return mapped !== undefined ? { ...data, [prop]: mapped } : data
    },
    lossless: true
  }
}

/**
 * Add a property with a default value if it doesn't exist.
 * On backward transform, the property is removed.
 *
 * @example
 * ```typescript
 * addDefault('priority', 'medium')
 * // {} → { priority: 'medium' }
 * // { priority: 'high' } → { priority: 'high' } (unchanged)
 * ```
 */
export function addDefault(prop: string, defaultValue: unknown): LensOperation {
  return {
    forward: (data) => ({
      ...data,
      [prop]: data[prop] ?? defaultValue
    }),
    backward: (data) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [prop]: _, ...rest } = data
      return rest
    },
    lossless: false // Data is lost in backward transform
  }
}

/**
 * Remove a property from the data.
 * On backward transform, the property is restored with undefined.
 *
 * @example
 * ```typescript
 * remove('legacyField')
 * // { legacyField: 'old', other: 1 } → { other: 1 }
 * ```
 */
export function remove(prop: string): LensOperation {
  return {
    forward: (data) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [prop]: _, ...rest } = data
      return rest
    },
    backward: (data) => data, // Cannot restore removed data
    lossless: false // Data is lost when property is removed
  }
}

/**
 * Transform a property value using custom functions.
 *
 * @example
 * ```typescript
 * transform('count',
 *   (v) => v * 100,    // forward: multiply by 100
 *   (v) => v / 100     // backward: divide by 100
 * )
 * // { count: 5 } → { count: 500 }
 * ```
 */
export function transform(
  prop: string,
  forwardFn: (value: unknown) => unknown,
  backwardFn: (value: unknown) => unknown,
  options?: { lossless?: boolean }
): LensOperation {
  return {
    forward: (data) => {
      const value = data[prop]
      if (value === undefined) return data
      return { ...data, [prop]: forwardFn(value) }
    },
    backward: (data) => {
      const value = data[prop]
      if (value === undefined) return data
      return { ...data, [prop]: backwardFn(value) }
    },
    lossless: options?.lossless ?? true
  }
}

/**
 * Copy a property to a new name (keeping the original).
 *
 * @example
 * ```typescript
 * copy('name', 'displayName')
 * // { name: 'John' } → { name: 'John', displayName: 'John' }
 * ```
 */
export function copy(from: string, to: string): LensOperation {
  return {
    forward: (data) => {
      const value = data[from]
      return value !== undefined ? { ...data, [to]: value } : data
    },
    backward: (data) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [to]: _, ...rest } = data
      return rest
    },
    lossless: true
  }
}

/**
 * Merge multiple properties into a new property.
 *
 * @example
 * ```typescript
 * merge(['firstName', 'lastName'], 'fullName', (first, last) => `${first} ${last}`)
 * // { firstName: 'John', lastName: 'Doe' } → { firstName: 'John', lastName: 'Doe', fullName: 'John Doe' }
 * ```
 */
export function merge(
  fromProps: string[],
  toProp: string,
  mergeFn: (...values: unknown[]) => unknown,
  splitFn?: (value: unknown) => unknown[]
): LensOperation {
  return {
    forward: (data) => {
      const values = fromProps.map((prop) => data[prop])
      if (values.every((v) => v === undefined)) return data
      return { ...data, [toProp]: mergeFn(...values) }
    },
    backward: (data) => {
      if (!splitFn) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [toProp]: _, ...rest } = data
        return rest
      }
      const value = data[toProp]
      if (value === undefined) return data
      const values = splitFn(value)
      const result = { ...data }
      delete result[toProp]
      fromProps.forEach((prop, i) => {
        if (values[i] !== undefined) {
          result[prop] = values[i]
        }
      })
      return result
    },
    lossless: splitFn !== undefined
  }
}

/**
 * Apply a condition to determine whether to apply an operation.
 *
 * @example
 * ```typescript
 * when(
 *   (data) => data.type === 'task',
 *   addDefault('priority', 'medium')
 * )
 * ```
 */
export function when(
  condition: (data: Record<string, unknown>) => boolean,
  operation: LensOperation
): LensOperation {
  return {
    forward: (data) => (condition(data) ? operation.forward(data) : data),
    backward: (data) => (condition(data) ? operation.backward(data) : data),
    lossless: operation.lossless
  }
}

// ─── Composition ─────────────────────────────────────────────────────────────

/**
 * Compose multiple lens operations into a single SchemaLens.
 *
 * @example
 * ```typescript
 * const taskV1toV2 = composeLens(
 *   'xnet://xnet.fyi/Task@1.0.0',
 *   'xnet://xnet.fyi/Task@2.0.0',
 *   rename('complete', 'status'),
 *   convert('status', { true: 'done', false: 'todo' }, { done: true, todo: false }),
 *   addDefault('priority', 'medium')
 * )
 * ```
 */
export function composeLens(
  source: SchemaIRI,
  target: SchemaIRI,
  ...operations: LensOperation[]
): SchemaLens {
  return {
    source,
    target,
    forward: (data) => operations.reduce((d, op) => op.forward(d), data),
    backward: (data) => operations.reduceRight((d, op) => op.backward(d), data),
    lossless: operations.every((op) => op.lossless !== false)
  }
}

/**
 * Create a lens from just operations (without source/target).
 * Useful for testing or when IRIs will be added later.
 */
export function createOperations(...operations: LensOperation[]): {
  forward: (data: Record<string, unknown>) => Record<string, unknown>
  backward: (data: Record<string, unknown>) => Record<string, unknown>
  lossless: boolean
} {
  return {
    forward: (data) => operations.reduce((d, op) => op.forward(d), data),
    backward: (data) => operations.reduceRight((d, op) => op.backward(d), data),
    lossless: operations.every((op) => op.lossless !== false)
  }
}

/**
 * Create an identity lens that does no transformation.
 * Useful as a placeholder or for testing.
 */
export function identity(source: SchemaIRI, target: SchemaIRI): SchemaLens {
  return {
    source,
    target,
    forward: (data) => data,
    backward: (data) => data,
    lossless: true
  }
}
