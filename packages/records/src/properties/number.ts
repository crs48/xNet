/**
 * @xnet/records - Number Property Handler
 */

import type { PropertyConfig, FilterOperator } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

export const numberProperty: PropertyHandler<number> = {
  type: 'number',

  validate(value: unknown, config: PropertyConfig): ValidationResult {
    if (value === null || value === undefined) {
      return { valid: true }
    }
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return { valid: false, error: 'Must be a number' }
    }
    return { valid: true }
  },

  coerce(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null
    }
    const num = Number(value)
    return Number.isNaN(num) ? null : num
  },

  format(value: number | null, config: PropertyConfig): string {
    if (value === null) {
      return ''
    }

    const { numberFormat, precision = 0, currencyCode = 'USD' } = config

    switch (numberFormat) {
      case 'percent':
        return `${(value * 100).toFixed(precision)}%`

      case 'currency':
        return new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: currencyCode,
          minimumFractionDigits: precision,
          maximumFractionDigits: precision
        }).format(value)

      case 'duration':
        // Format as hours:minutes
        const hours = Math.floor(value / 60)
        const minutes = Math.round(value % 60)
        return `${hours}:${minutes.toString().padStart(2, '0')}`

      default:
        return precision > 0 ? value.toFixed(precision) : String(value)
    }
  },

  getDefaultValue(): number | null {
    return null
  },

  isEmpty(value: number | null): boolean {
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

  applyFilter(value: number | null, operator: FilterOperator, filterValue: unknown): boolean {
    if (operator === 'isEmpty') {
      return this.isEmpty(value)
    }
    if (operator === 'isNotEmpty') {
      return !this.isEmpty(value)
    }
    if (value === null) {
      return false
    }

    const f = Number(filterValue)
    if (Number.isNaN(f)) {
      return false
    }

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
  },

  compare(a: number | null, b: number | null): number {
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1
    return a - b
  },

  serialize(value: number | null): unknown {
    return value
  },

  deserialize(data: unknown): number | null {
    if (data === null || data === undefined) {
      return null
    }
    const num = Number(data)
    return Number.isNaN(num) ? null : num
  }
}
