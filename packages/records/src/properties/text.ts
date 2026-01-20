/**
 * @xnet/records - Text Property Handler
 */

import type { PropertyConfig, FilterOperator } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

export const textProperty: PropertyHandler<string> = {
  type: 'text',

  validate(value: unknown, config: PropertyConfig): ValidationResult {
    if (value === null || value === undefined) {
      return { valid: true }
    }
    if (typeof value !== 'string') {
      return { valid: false, error: 'Must be a string' }
    }
    // Check maxLength if configured (richText config could have maxLength)
    return { valid: true }
  },

  coerce(value: unknown): string | null {
    if (value === null || value === undefined || value === '') {
      return null
    }
    return String(value)
  },

  format(value: string | null): string {
    return value ?? ''
  },

  getDefaultValue(): string | null {
    return null
  },

  isEmpty(value: string | null): boolean {
    return value === null || value === ''
  },

  filterOperators: [
    'equals',
    'notEquals',
    'contains',
    'notContains',
    'startsWith',
    'endsWith',
    'isEmpty',
    'isNotEmpty'
  ] as const,

  applyFilter(value: string | null, operator: FilterOperator, filterValue: unknown): boolean {
    const v = (value ?? '').toLowerCase()
    const f = String(filterValue ?? '').toLowerCase()

    switch (operator) {
      case 'equals':
        return v === f
      case 'notEquals':
        return v !== f
      case 'contains':
        return v.includes(f)
      case 'notContains':
        return !v.includes(f)
      case 'startsWith':
        return v.startsWith(f)
      case 'endsWith':
        return v.endsWith(f)
      case 'isEmpty':
        return this.isEmpty(value)
      case 'isNotEmpty':
        return !this.isEmpty(value)
      default:
        return true
    }
  },

  compare(a: string | null, b: string | null): number {
    const strA = a ?? ''
    const strB = b ?? ''
    return strA.localeCompare(strB)
  },

  serialize(value: string | null): unknown {
    return value
  },

  deserialize(data: unknown): string | null {
    if (data === null || data === undefined) {
      return null
    }
    return String(data)
  }
}
