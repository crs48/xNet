/**
 * @xnet/database - Auto Properties (Created, Updated, CreatedBy)
 *
 * These properties are automatically managed by the system.
 */

import type { PropertyConfig, FilterOperator } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

// ============================================================================
// Created Time Property
// ============================================================================

export const createdProperty: PropertyHandler<number> = {
  type: 'created',

  // Always valid - system-managed
  validate(): ValidationResult {
    return { valid: true }
  },

  coerce(value: unknown): number | null {
    if (value === null || value === undefined) return null
    if (typeof value === 'number') return value
    if (value instanceof Date) return value.getTime()
    return null
  },

  format(value: number | null, config: PropertyConfig): string {
    if (value === null) return ''

    if (config.format === 'relative') {
      return formatRelativeTime(value)
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))
  },

  getDefaultValue(): number | null {
    return Date.now()
  },

  isEmpty(value: number | null): boolean {
    return value === null
  },

  filterOperators: ['isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isWithin'] as const,

  applyFilter(value: number | null, operator: FilterOperator, filterValue: unknown): boolean {
    if (value === null) return false

    const f = Number(filterValue)
    if (Number.isNaN(f)) return false

    switch (operator) {
      case 'isBefore':
        return value < f
      case 'isAfter':
        return value > f
      case 'isOnOrBefore':
        return value <= f
      case 'isOnOrAfter':
        return value >= f
      case 'isWithin': {
        // filterValue is days from now
        const days = Number(filterValue) || 7
        const now = Date.now()
        return value >= now - days * 24 * 60 * 60 * 1000
      }
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
    if (data === null || data === undefined) return null
    return Number(data)
  }
}

// ============================================================================
// Updated Time Property
// ============================================================================

export const updatedProperty: PropertyHandler<number> = {
  type: 'updated',

  validate(): ValidationResult {
    return { valid: true }
  },

  coerce(value: unknown): number | null {
    if (value === null || value === undefined) return null
    if (typeof value === 'number') return value
    if (value instanceof Date) return value.getTime()
    return null
  },

  format(value: number | null, config: PropertyConfig): string {
    if (value === null) return ''

    if (config.format === 'relative') {
      return formatRelativeTime(value)
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(value))
  },

  getDefaultValue(): number | null {
    return Date.now()
  },

  isEmpty(value: number | null): boolean {
    return value === null
  },

  filterOperators: ['isBefore', 'isAfter', 'isOnOrBefore', 'isOnOrAfter', 'isWithin'] as const,

  applyFilter(value: number | null, operator: FilterOperator, filterValue: unknown): boolean {
    if (value === null) return false

    const f = Number(filterValue)
    if (Number.isNaN(f)) return false

    switch (operator) {
      case 'isBefore':
        return value < f
      case 'isAfter':
        return value > f
      case 'isOnOrBefore':
        return value <= f
      case 'isOnOrAfter':
        return value >= f
      case 'isWithin': {
        const days = Number(filterValue) || 7
        const now = Date.now()
        return value >= now - days * 24 * 60 * 60 * 1000
      }
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
    if (data === null || data === undefined) return null
    return Number(data)
  }
}

// ============================================================================
// Created By Property
// ============================================================================

export const createdByProperty: PropertyHandler<string> = {
  type: 'createdBy',

  validate(): ValidationResult {
    return { valid: true }
  },

  coerce(value: unknown): string | null {
    if (value === null || value === undefined) return null
    return String(value)
  },

  format(value: string | null): string {
    if (value === null) return ''
    // Truncate DID for display
    if (value.startsWith('did:key:')) {
      const short = value.replace('did:key:', '').slice(0, 8)
      return `@${short}...`
    }
    return value
  },

  getDefaultValue(): string | null {
    return null // Set by system with current user's DID
  },

  isEmpty(value: string | null): boolean {
    return value === null || value === ''
  },

  filterOperators: ['equals', 'notEquals', 'isEmpty', 'isNotEmpty'] as const,

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
    if (data === null || data === undefined) return null
    return String(data)
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Format a timestamp as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return days === 1 ? 'Yesterday' : `${days} days ago`
  }
  if (hours > 0) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  if (minutes > 0) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  }
  return 'Just now'
}
