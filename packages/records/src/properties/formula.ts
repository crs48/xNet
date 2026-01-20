/**
 * @xnet/records - Formula Property Handler
 *
 * Computes values using expressions over other properties.
 * This is a stub - full implementation in @xnet/formula package.
 */

import type { PropertyConfig, FilterOperator } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

/**
 * Formula result can be various types depending on the expression
 */
export type FormulaValue = string | number | boolean | Date | null

/**
 * Return type hint for formulas
 */
export type FormulaReturnType = 'text' | 'number' | 'boolean' | 'date'

export const formulaProperty: PropertyHandler<FormulaValue> = {
  type: 'formula',

  // Formulas are computed, so validation always passes
  validate(): ValidationResult {
    return { valid: true }
  },

  coerce(value: unknown): FormulaValue | null {
    // Passthrough - formulas are computed by the engine
    return value as FormulaValue
  },

  format(value: FormulaValue | null, config: PropertyConfig): string {
    if (value === null || value === undefined) {
      return ''
    }

    // Infer type from value
    if (typeof value === 'number') {
      return value.toString()
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    if (value instanceof Date) {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium'
      }).format(value)
    }
    return String(value)
  },

  getDefaultValue(): FormulaValue | null {
    return null
  },

  isEmpty(value: FormulaValue | null): boolean {
    return value === null || value === undefined || value === ''
  },

  filterOperators: [
    'equals',
    'notEquals',
    'contains',
    'gt',
    'gte',
    'lt',
    'lte',
    'isEmpty',
    'isNotEmpty'
  ] as const,

  applyFilter(value: FormulaValue | null, operator: FilterOperator, filterValue: unknown): boolean {
    if (operator === 'isEmpty') {
      return this.isEmpty(value)
    }
    if (operator === 'isNotEmpty') {
      return !this.isEmpty(value)
    }
    if (value === null) {
      return false
    }

    // Numeric filters
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

    // String filters
    if (typeof value === 'string') {
      const f = String(filterValue)
      switch (operator) {
        case 'equals':
          return value === f
        case 'notEquals':
          return value !== f
        case 'contains':
          return value.toLowerCase().includes(f.toLowerCase())
        default:
          return true
      }
    }

    // Boolean filters
    if (typeof value === 'boolean') {
      return value === Boolean(filterValue)
    }

    return true
  },

  compare(a: FormulaValue | null, b: FormulaValue | null): number {
    if (a === null && b === null) return 0
    if (a === null) return 1
    if (b === null) return -1

    // Type-specific comparisons
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b
    }
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime()
    }
    if (typeof a === 'boolean' && typeof b === 'boolean') {
      return (a ? 1 : 0) - (b ? 1 : 0)
    }

    return String(a).localeCompare(String(b))
  },

  // Formulas aren't stored, but we support serialization for caching
  serialize(value: FormulaValue | null): unknown {
    if (value instanceof Date) {
      return value.getTime()
    }
    return value
  },

  deserialize(data: unknown): FormulaValue | null {
    return data as FormulaValue
  }
}

/**
 * Placeholder for formula evaluation - will be implemented in @xnet/formula
 */
export function evaluateFormula(
  _expression: string,
  _context: Record<string, unknown>
): FormulaValue {
  // TODO: Implement in @xnet/formula package
  throw new Error('Formula evaluation not yet implemented')
}
