/**
 * @xnet/database - Email Property Handler
 */

import type { PropertyConfig, FilterOperator } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

// Simple email validation pattern
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const emailProperty: PropertyHandler<string> = {
  type: 'email',

  validate(value: unknown): ValidationResult {
    if (value === null || value === undefined || value === '') {
      return { valid: true }
    }
    if (typeof value !== 'string') {
      return { valid: false, error: 'Must be a string' }
    }
    if (!EMAIL_PATTERN.test(value)) {
      return { valid: false, error: 'Invalid email format' }
    }
    return { valid: true }
  },

  coerce(value: unknown): string | null {
    if (value === null || value === undefined || value === '') {
      return null
    }
    return String(value).trim().toLowerCase()
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
    'isEmpty',
    'isNotEmpty'
  ] as const,

  applyFilter(value: string | null, operator: FilterOperator, filterValue: unknown): boolean {
    const v = (value ?? '').toLowerCase()
    const f = String(filterValue ?? '').toLowerCase()

    switch (operator) {
      case 'isEmpty':
        return this.isEmpty(value)
      case 'isNotEmpty':
        return !this.isEmpty(value)
      case 'equals':
        return v === f
      case 'notEquals':
        return v !== f
      case 'contains':
        return v.includes(f)
      case 'notContains':
        return !v.includes(f)
      default:
        return true
    }
  },

  compare(a: string | null, b: string | null): number {
    return (a ?? '').localeCompare(b ?? '')
  },

  serialize(value: string | null): unknown {
    return value
  },

  deserialize(data: unknown): string | null {
    if (data === null || data === undefined || data === '') {
      return null
    }
    return String(data)
  }
}

/**
 * Check if a string is a valid email
 */
export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email)
}
