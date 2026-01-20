/**
 * @xnet/records - Select Property Handler
 *
 * Single-select from a list of options with colors
 */

import type { PropertyConfig, FilterOperator, SelectOption } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

export const selectProperty: PropertyHandler<string> = {
  type: 'select',

  validate(value: unknown, config: PropertyConfig): ValidationResult {
    if (value === null || value === undefined || value === '') {
      return { valid: true }
    }
    if (typeof value !== 'string') {
      return { valid: false, error: 'Must be a string option ID' }
    }
    // Validate against options if configured
    const options = config.options ?? []
    if (options.length > 0) {
      const optionIds = options.map((o: SelectOption) => o.id)
      if (!optionIds.includes(value)) {
        return { valid: false, error: 'Invalid option selected' }
      }
    }
    return { valid: true }
  },

  coerce(value: unknown): string | null {
    if (value === null || value === undefined || value === '') {
      return null
    }
    return String(value)
  },

  format(value: string | null, config: PropertyConfig): string {
    if (value === null) {
      return ''
    }
    const options = config.options ?? []
    const option = options.find((o: SelectOption) => o.id === value)
    return option?.name ?? value
  },

  getDefaultValue(): string | null {
    return null
  },

  isEmpty(value: string | null): boolean {
    return value === null || value === ''
  },

  filterOperators: ['equals', 'notEquals', 'isAny', 'isNone', 'isEmpty', 'isNotEmpty'] as const,

  applyFilter(value: string | null, operator: FilterOperator, filterValue: unknown): boolean {
    switch (operator) {
      case 'isEmpty':
        return this.isEmpty(value)
      case 'isNotEmpty':
        return !this.isEmpty(value)
      case 'equals':
        return value === filterValue
      case 'notEquals':
        return value !== filterValue
      case 'isAny': {
        // filterValue should be an array of option IDs
        const allowed = Array.isArray(filterValue) ? filterValue : [filterValue]
        return value !== null && allowed.includes(value)
      }
      case 'isNone': {
        // filterValue should be an array of option IDs to exclude
        const excluded = Array.isArray(filterValue) ? filterValue : [filterValue]
        return value === null || !excluded.includes(value)
      }
      default:
        return true
    }
  },

  compare(a: string | null, b: string | null, config: PropertyConfig): number {
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1

    // Sort by option order in config
    const options = config.options ?? []
    const indexA = options.findIndex((o: SelectOption) => o.id === a)
    const indexB = options.findIndex((o: SelectOption) => o.id === b)

    // Unknown options go to the end
    const posA = indexA === -1 ? options.length : indexA
    const posB = indexB === -1 ? options.length : indexB

    return posA - posB
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
 * Get the color for a select option
 */
export function getSelectOptionColor(value: string | null, config: PropertyConfig): string | null {
  if (value === null) {
    return null
  }
  const options = config.options ?? []
  const option = options.find((o: SelectOption) => o.id === value)
  return option?.color ?? null
}
