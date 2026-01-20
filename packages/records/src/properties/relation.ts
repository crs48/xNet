/**
 * @xnet/records - Relation Property Handler
 *
 * References items in another database (or the same database for self-relations)
 */

import type { PropertyConfig, FilterOperator, DatabaseId, ItemId } from '../types'
import type { PropertyHandler, ValidationResult } from './types'

export const relationProperty: PropertyHandler<ItemId[]> = {
  type: 'relation',

  validate(value: unknown, config: PropertyConfig): ValidationResult {
    if (value === null || value === undefined) {
      return { valid: true }
    }
    if (!Array.isArray(value)) {
      return { valid: false, error: 'Must be an array of item IDs' }
    }
    for (const itemId of value) {
      if (typeof itemId !== 'string') {
        return { valid: false, error: 'Each value must be an item ID string' }
      }
      if (!itemId.startsWith('item:')) {
        return { valid: false, error: `Invalid item ID format: ${itemId}` }
      }
    }
    return { valid: true }
  },

  coerce(value: unknown): ItemId[] | null {
    if (value === null || value === undefined) {
      return []
    }
    if (Array.isArray(value)) {
      return value.filter((v): v is ItemId => typeof v === 'string' && v.startsWith('item:'))
    }
    if (typeof value === 'string' && value.startsWith('item:')) {
      return [value as ItemId]
    }
    return []
  },

  format(value: ItemId[] | null): string {
    if (value === null || value.length === 0) {
      return ''
    }
    return `${value.length} linked item${value.length === 1 ? '' : 's'}`
  },

  getDefaultValue(): ItemId[] | null {
    return []
  },

  isEmpty(value: ItemId[] | null): boolean {
    return value === null || value.length === 0
  },

  filterOperators: ['contains', 'notContains', 'isEmpty', 'isNotEmpty'] as const,

  applyFilter(value: ItemId[] | null, operator: FilterOperator, filterValue: unknown): boolean {
    const values = value ?? []

    switch (operator) {
      case 'isEmpty':
        return this.isEmpty(value)
      case 'isNotEmpty':
        return !this.isEmpty(value)
      case 'contains': {
        const itemId = String(filterValue) as ItemId
        return values.includes(itemId)
      }
      case 'notContains': {
        const itemId = String(filterValue) as ItemId
        return !values.includes(itemId)
      }
      default:
        return true
    }
  },

  compare(a: ItemId[] | null, b: ItemId[] | null): number {
    const aLen = a?.length ?? 0
    const bLen = b?.length ?? 0
    return aLen - bLen
  },

  serialize(value: ItemId[] | null): unknown {
    return value ?? []
  },

  deserialize(data: unknown): ItemId[] | null {
    if (data === null || data === undefined) {
      return []
    }
    if (Array.isArray(data)) {
      return data.filter((v): v is ItemId => typeof v === 'string' && v.startsWith('item:'))
    }
    return []
  }
}

/**
 * Configuration for relation property
 */
export interface RelationConfig {
  /** Target database for the relation */
  targetDatabaseId: DatabaseId
  /** If true, creates a reverse relation in the target database */
  bidirectional: boolean
  /** Property ID of the reverse relation (if bidirectional) */
  reversePropertyId?: string
  /** Display name of the reverse relation property */
  reversePropertyName?: string
}
