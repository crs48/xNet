/**
 * @xnet/records - Checkbox Property Handler
 */

import type { PropertyConfig, FilterOperator } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

export const checkboxProperty: PropertyHandler<boolean> = {
  type: 'checkbox',

  validate(value: unknown): ValidationResult {
    if (value === null || value === undefined) {
      return { valid: true }
    }
    if (typeof value !== 'boolean') {
      return { valid: false, error: 'Must be a boolean' }
    }
    return { valid: true }
  },

  coerce(value: unknown): boolean | null {
    if (value === null || value === undefined) {
      return false
    }
    return Boolean(value)
  },

  format(value: boolean | null): string {
    if (value === null || value === false) {
      return 'No'
    }
    return 'Yes'
  },

  getDefaultValue(): boolean | null {
    return false
  },

  isEmpty(value: boolean | null): boolean {
    // Checkbox is never considered "empty" - false is a valid state
    return value === null
  },

  filterOperators: ['isChecked', 'isNotChecked'] as const,

  applyFilter(value: boolean | null, operator: FilterOperator): boolean {
    const v = value ?? false

    switch (operator) {
      case 'isChecked':
        return v === true
      case 'isNotChecked':
        return v === false
      default:
        return true
    }
  },

  compare(a: boolean | null, b: boolean | null): number {
    const numA = a ? 1 : 0
    const numB = b ? 1 : 0
    return numA - numB
  },

  serialize(value: boolean | null): unknown {
    return value ?? false
  },

  deserialize(data: unknown): boolean | null {
    if (data === null || data === undefined) {
      return false
    }
    return Boolean(data)
  }
}
