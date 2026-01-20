/**
 * @xnet/database - Phone Property Handler
 */

import type { PropertyConfig, FilterOperator } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

// Basic phone validation - allows various formats
const PHONE_PATTERN = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/

export const phoneProperty: PropertyHandler<string> = {
  type: 'phone',

  validate(value: unknown): ValidationResult {
    if (value === null || value === undefined || value === '') {
      return { valid: true }
    }
    if (typeof value !== 'string') {
      return { valid: false, error: 'Must be a string' }
    }
    // Remove spaces/dashes for validation
    const normalized = value.replace(/[\s-]/g, '')
    if (normalized.length < 7 || normalized.length > 15) {
      return { valid: false, error: 'Invalid phone number length' }
    }
    if (!PHONE_PATTERN.test(value)) {
      return { valid: false, error: 'Invalid phone number format' }
    }
    return { valid: true }
  },

  coerce(value: unknown): string | null {
    if (value === null || value === undefined || value === '') {
      return null
    }
    // Keep original formatting but trim
    return String(value).trim()
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
    // Normalize for comparison (remove non-digits)
    const v = (value ?? '').replace(/\D/g, '')
    const f = String(filterValue ?? '').replace(/\D/g, '')

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
    // Compare normalized (digits only)
    const normA = (a ?? '').replace(/\D/g, '')
    const normB = (b ?? '').replace(/\D/g, '')
    return normA.localeCompare(normB)
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
 * Normalize phone number to E.164 format (if possible)
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  // If starts with country code, add +
  if (digits.length >= 10) {
    return `+${digits}`
  }
  return digits
}
