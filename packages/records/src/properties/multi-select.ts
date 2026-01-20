/**
 * @xnet/records - Multi-Select Property Handler
 *
 * Multi-select from a list of options with colors
 */

import type { PropertyConfig, FilterOperator, SelectOption } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

export const multiSelectProperty: PropertyHandler<string[]> = {
  type: 'multiSelect',

  validate(value: unknown, config: PropertyConfig): ValidationResult {
    if (value === null || value === undefined) {
      return { valid: true }
    }
    if (!Array.isArray(value)) {
      return { valid: false, error: 'Must be an array of option IDs' }
    }
    // Validate each value against options if configured
    const options = config.options ?? []
    if (options.length > 0) {
      const optionIds = options.map((o: SelectOption) => o.id)
      for (const v of value) {
        if (typeof v !== 'string') {
          return { valid: false, error: 'Each value must be a string' }
        }
        if (!optionIds.includes(v)) {
          return { valid: false, error: `Invalid option: ${v}` }
        }
      }
    }
    return { valid: true }
  },

  coerce(value: unknown): string[] | null {
    if (value === null || value === undefined) {
      return []
    }
    if (Array.isArray(value)) {
      return value.map(String)
    }
    if (typeof value === 'string' && value !== '') {
      return [value]
    }
    return []
  },

  format(value: string[] | null, config: PropertyConfig): string {
    if (value === null || value.length === 0) {
      return ''
    }
    const options = config.options ?? []
    return value
      .map((v) => {
        const option = options.find((o: SelectOption) => o.id === v)
        return option?.name ?? v
      })
      .join(', ')
  },

  getDefaultValue(): string[] | null {
    return []
  },

  isEmpty(value: string[] | null): boolean {
    return value === null || value.length === 0
  },

  filterOperators: ['isAny', 'isNone', 'contains', 'notContains', 'isEmpty', 'isNotEmpty'] as const,

  applyFilter(value: string[] | null, operator: FilterOperator, filterValue: unknown): boolean {
    const values = value ?? []

    switch (operator) {
      case 'isEmpty':
        return this.isEmpty(value)
      case 'isNotEmpty':
        return !this.isEmpty(value)
      case 'contains': {
        // Value contains any of the filter values
        const targets = Array.isArray(filterValue) ? filterValue : [filterValue]
        return targets.some((t) => values.includes(String(t)))
      }
      case 'notContains': {
        // Value contains none of the filter values
        const targets = Array.isArray(filterValue) ? filterValue : [filterValue]
        return !targets.some((t) => values.includes(String(t)))
      }
      case 'isAny': {
        // Value contains at least one of the filter values
        const allowed = Array.isArray(filterValue) ? filterValue : [filterValue]
        return values.some((v) => allowed.includes(v))
      }
      case 'isNone': {
        // Value contains none of the filter values
        const excluded = Array.isArray(filterValue) ? filterValue : [filterValue]
        return !values.some((v) => excluded.includes(v))
      }
      default:
        return true
    }
  },

  compare(a: string[] | null, b: string[] | null, config: PropertyConfig): number {
    const aLen = a?.length ?? 0
    const bLen = b?.length ?? 0

    // First, compare by count
    if (aLen !== bLen) {
      return aLen - bLen
    }

    // If same count, compare by first option position
    if (aLen === 0) return 0

    const options = config.options ?? []
    const getPosition = (id: string) => {
      const idx = options.findIndex((o: SelectOption) => o.id === id)
      return idx === -1 ? options.length : idx
    }

    const aFirst = Math.min(...(a ?? []).map(getPosition))
    const bFirst = Math.min(...(b ?? []).map(getPosition))

    return aFirst - bFirst
  },

  serialize(value: string[] | null): unknown {
    return value ?? []
  },

  deserialize(data: unknown): string[] | null {
    if (data === null || data === undefined) {
      return []
    }
    if (Array.isArray(data)) {
      return data.map(String)
    }
    return []
  }
}

/**
 * Get colors for multi-select options
 */
export function getMultiSelectOptionColors(
  value: string[] | null,
  config: PropertyConfig
): Array<{ id: string; name: string; color: string }> {
  if (value === null || value.length === 0) {
    return []
  }
  const options = config.options ?? []
  return value
    .map((v) => {
      const option = options.find((o: SelectOption) => o.id === v)
      return option ? { id: option.id, name: option.name, color: option.color } : null
    })
    .filter((o): o is { id: string; name: string; color: string } => o !== null)
}
