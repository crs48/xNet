/**
 * @xnet/database - Date Property Handler
 *
 * Stores dates as Unix timestamps (milliseconds)
 */

import type { PropertyConfig, FilterOperator } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

// Helper functions
function startOfDay(ts: number): number {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function endOfDay(ts: number): number {
  const date = new Date(ts)
  date.setHours(23, 59, 59, 999)
  return date.getTime()
}

function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b)
}

export const dateProperty: PropertyHandler<number> = {
  type: 'date',

  validate(value: unknown): ValidationResult {
    if (value === null || value === undefined) {
      return { valid: true }
    }
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return { valid: false, error: 'Must be a valid timestamp' }
    }
    return { valid: true }
  },

  coerce(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null
    }
    if (typeof value === 'number') {
      return Number.isNaN(value) ? null : value
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value)
      return Number.isNaN(parsed) ? null : parsed
    }
    if (value instanceof Date) {
      return value.getTime()
    }
    return null
  },

  format(value: number | null, config: PropertyConfig): string {
    if (value === null) {
      return ''
    }

    const date = new Date(value)
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }

    if (config.includeTime) {
      options.hour = 'numeric'
      options.minute = '2-digit'
      options.hour12 = config.timeFormat !== '24h'
    }

    return new Intl.DateTimeFormat(undefined, options).format(date)
  },

  getDefaultValue(): number | null {
    return null
  },

  isEmpty(value: number | null): boolean {
    return value === null
  },

  filterOperators: [
    'is',
    'isBefore',
    'isAfter',
    'isOnOrBefore',
    'isOnOrAfter',
    'isWithin',
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
      case 'is':
        return isSameDay(value, f)
      case 'isBefore':
        return value < startOfDay(f)
      case 'isAfter':
        return value > endOfDay(f)
      case 'isOnOrBefore':
        return value <= endOfDay(f)
      case 'isOnOrAfter':
        return value >= startOfDay(f)
      case 'isWithin':
        // filterValue should be an object { start, end } but for simplicity
        // we treat it as a range in days from now
        const days = Number(filterValue) || 7
        const now = Date.now()
        return value >= now - days * 24 * 60 * 60 * 1000 && value <= now
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
