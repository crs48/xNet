/**
 * @xnet/database - Person Property Handler
 *
 * References users by DID (Decentralized Identifier)
 */

import type { PropertyConfig, FilterOperator } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

// DID:key pattern validation
const DID_KEY_PATTERN = /^did:key:z[a-km-zA-HJ-NP-Z1-9]+$/

export const personProperty: PropertyHandler<string[]> = {
  type: 'person',

  validate(value: unknown, config: PropertyConfig): ValidationResult {
    if (value === null || value === undefined) {
      return { valid: true }
    }
    if (!Array.isArray(value)) {
      return { valid: false, error: 'Must be an array of DIDs' }
    }
    if (!config.allowMultiple && value.length > 1) {
      return { valid: false, error: 'Only one person allowed' }
    }
    for (const did of value) {
      if (typeof did !== 'string') {
        return { valid: false, error: 'Each value must be a DID string' }
      }
      if (!DID_KEY_PATTERN.test(did)) {
        return { valid: false, error: `Invalid DID format: ${did}` }
      }
    }
    return { valid: true }
  },

  coerce(value: unknown): string[] | null {
    if (value === null || value === undefined) {
      return []
    }
    if (Array.isArray(value)) {
      return value.filter((v) => typeof v === 'string')
    }
    if (typeof value === 'string' && value !== '') {
      return [value]
    }
    return []
  },

  format(value: string[] | null): string {
    if (value === null || value.length === 0) {
      return ''
    }
    // In a real app, this would look up user names
    // For now, just show truncated DIDs
    return value
      .map((did) => {
        const short = did.replace('did:key:', '').slice(0, 8)
        return `@${short}...`
      })
      .join(', ')
  },

  getDefaultValue(): string[] | null {
    return []
  },

  isEmpty(value: string[] | null): boolean {
    return value === null || value.length === 0
  },

  filterOperators: ['contains', 'notContains', 'isEmpty', 'isNotEmpty'] as const,

  applyFilter(value: string[] | null, operator: FilterOperator, filterValue: unknown): boolean {
    const values = value ?? []

    switch (operator) {
      case 'isEmpty':
        return this.isEmpty(value)
      case 'isNotEmpty':
        return !this.isEmpty(value)
      case 'contains': {
        const did = String(filterValue)
        return values.includes(did)
      }
      case 'notContains': {
        const did = String(filterValue)
        return !values.includes(did)
      }
      default:
        return true
    }
  },

  compare(a: string[] | null, b: string[] | null): number {
    const aLen = a?.length ?? 0
    const bLen = b?.length ?? 0
    return aLen - bLen
  },

  serialize(value: string[] | null): unknown {
    return value ?? []
  },

  deserialize(data: unknown): string[] | null {
    if (data === null || data === undefined) {
      return []
    }
    if (Array.isArray(data)) {
      return data.filter((v) => typeof v === 'string')
    }
    return []
  }
}

/**
 * Check if a string is a valid DID:key
 */
export function isValidDID(did: string): boolean {
  return DID_KEY_PATTERN.test(did)
}
