/**
 * @xnet/database - URL Property Handler
 */

import type { PropertyConfig, FilterOperator } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

export const urlProperty: PropertyHandler<string> = {
  type: 'url',

  validate(value: unknown): ValidationResult {
    if (value === null || value === undefined || value === '') {
      return { valid: true }
    }
    if (typeof value !== 'string') {
      return { valid: false, error: 'Must be a string' }
    }
    try {
      new URL(value)
      return { valid: true }
    } catch {
      return { valid: false, error: 'Invalid URL format' }
    }
  },

  coerce(value: unknown): string | null {
    if (value === null || value === undefined || value === '') {
      return null
    }
    const str = String(value)
    // Add https:// if no protocol
    if (str && !str.includes('://')) {
      return `https://${str}`
    }
    return str
  },

  format(value: string | null): string {
    if (!value) return ''
    try {
      const url = new URL(value)
      return url.hostname
    } catch {
      return value
    }
  },

  getDefaultValue(): string | null {
    return null
  },

  isEmpty(value: string | null): boolean {
    return value === null || value === ''
  },

  filterOperators: ['contains', 'notContains', 'isEmpty', 'isNotEmpty'] as const,

  applyFilter(value: string | null, operator: FilterOperator, filterValue: unknown): boolean {
    switch (operator) {
      case 'isEmpty':
        return this.isEmpty(value)
      case 'isNotEmpty':
        return !this.isEmpty(value)
      case 'contains':
        return (value ?? '').toLowerCase().includes(String(filterValue).toLowerCase())
      case 'notContains':
        return !(value ?? '').toLowerCase().includes(String(filterValue).toLowerCase())
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
