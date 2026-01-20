/**
 * @xnet/records - Rollup Property Handler
 *
 * Computes aggregations over related items via a relation property.
 * Rollup values are computed at query time, not stored.
 */

import type { PropertyConfig, FilterOperator, RollupFunction } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

/**
 * Rollup result can be various types depending on the aggregation
 */
export type RollupValue = number | string | boolean | string[] | null

export const rollupProperty: PropertyHandler<RollupValue> = {
  type: 'rollup',

  // Rollups are computed, so validation always passes
  validate(): ValidationResult {
    return { valid: true }
  },

  coerce(value: unknown): RollupValue | null {
    // Passthrough - rollups are computed by the engine
    return value as RollupValue
  },

  format(value: RollupValue | null, config: PropertyConfig): string {
    if (value === null || value === undefined) {
      return ''
    }

    const fn = config.rollupFunction as RollupFunction | undefined

    switch (fn) {
      case 'count':
      case 'countValues':
      case 'countUniqueValues':
      case 'countEmpty':
      case 'countNotEmpty':
        return String(value)

      case 'percentEmpty':
      case 'percentNotEmpty':
        return typeof value === 'number' ? `${(value * 100).toFixed(0)}%` : ''

      case 'sum':
      case 'average':
      case 'median':
      case 'min':
      case 'max':
      case 'range':
        return typeof value === 'number' ? value.toFixed(2) : ''

      case 'showOriginal':
      case 'showUnique':
        return Array.isArray(value) ? value.join(', ') : String(value)

      default:
        if (typeof value === 'boolean') {
          return value ? 'Yes' : 'No'
        }
        return String(value)
    }
  },

  getDefaultValue(): RollupValue | null {
    return null
  },

  isEmpty(value: RollupValue | null): boolean {
    return value === null
  },

  filterOperators: [
    'equals',
    'notEquals',
    'gt',
    'gte',
    'lt',
    'lte',
    'isEmpty',
    'isNotEmpty'
  ] as const,

  applyFilter(value: RollupValue | null, operator: FilterOperator, filterValue: unknown): boolean {
    if (operator === 'isEmpty') {
      return this.isEmpty(value)
    }
    if (operator === 'isNotEmpty') {
      return !this.isEmpty(value)
    }
    if (value === null) {
      return false
    }

    // For numeric comparisons
    if (typeof value === 'number') {
      const f = Number(filterValue)
      if (Number.isNaN(f)) return false

      switch (operator) {
        case 'equals':
          return value === f
        case 'notEquals':
          return value !== f
        case 'gt':
          return value > f
        case 'gte':
          return value >= f
        case 'lt':
          return value < f
        case 'lte':
          return value <= f
        default:
          return true
      }
    }

    // For string/boolean comparisons
    switch (operator) {
      case 'equals':
        return value === filterValue
      case 'notEquals':
        return value !== filterValue
      default:
        return true
    }
  },

  compare(a: RollupValue | null, b: RollupValue | null): number {
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1

    // Numeric comparison
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b
    }

    // String comparison
    return String(a).localeCompare(String(b))
  },

  // Rollups aren't stored, but we support serialization for caching
  serialize(value: RollupValue | null): unknown {
    return value
  },

  deserialize(data: unknown): RollupValue | null {
    return data as RollupValue
  }
}

/**
 * Compute a rollup aggregation over values
 */
export function computeRollup(values: unknown[], fn: RollupFunction): RollupValue {
  switch (fn) {
    case 'count':
      return values.length

    case 'countValues':
      return values.filter((v) => v !== null && v !== undefined).length

    case 'countUniqueValues':
      return new Set(values.filter((v) => v !== null && v !== undefined)).size

    case 'countEmpty':
      return values.filter((v) => v === null || v === undefined || v === '').length

    case 'countNotEmpty':
      return values.filter((v) => v !== null && v !== undefined && v !== '').length

    case 'percentEmpty': {
      if (values.length === 0) return 0
      const empty = values.filter((v) => v === null || v === undefined || v === '').length
      return empty / values.length
    }

    case 'percentNotEmpty': {
      if (values.length === 0) return 0
      const notEmpty = values.filter((v) => v !== null && v !== undefined && v !== '').length
      return notEmpty / values.length
    }

    case 'sum': {
      const nums = values.filter((v): v is number => typeof v === 'number')
      return nums.reduce((a, b) => a + b, 0)
    }

    case 'average': {
      const nums = values.filter((v): v is number => typeof v === 'number')
      if (nums.length === 0) return null
      return nums.reduce((a, b) => a + b, 0) / nums.length
    }

    case 'median': {
      const nums = values.filter((v): v is number => typeof v === 'number').sort((a, b) => a - b)
      if (nums.length === 0) return null
      const mid = Math.floor(nums.length / 2)
      return nums.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
    }

    case 'min': {
      const nums = values.filter((v): v is number => typeof v === 'number')
      if (nums.length === 0) return null
      return Math.min(...nums)
    }

    case 'max': {
      const nums = values.filter((v): v is number => typeof v === 'number')
      if (nums.length === 0) return null
      return Math.max(...nums)
    }

    case 'range': {
      const nums = values.filter((v): v is number => typeof v === 'number')
      if (nums.length === 0) return null
      return Math.max(...nums) - Math.min(...nums)
    }

    case 'showOriginal':
      return values.map(String)

    case 'showUnique':
      return [...new Set(values.map(String))]

    default:
      return null
  }
}
