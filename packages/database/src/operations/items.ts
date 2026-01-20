/**
 * @xnet/database - Database Item Operations
 *
 * Functions for creating, reading, updating, and deleting database items.
 */

import type {
  Database,
  DatabaseItem,
  DatabaseId,
  ItemId,
  PropertyId,
  PropertyValue,
  FilterGroup,
  Filter,
  Sort,
  SortDirection
} from '../types'
import { generateItemId } from '../utils'
import { getPropertyHandler } from '../properties/registry'

// DID type - using local type to avoid import issues
type DID = `did:key:${string}`

/**
 * Options for creating a new item
 */
export interface CreateItemOptions {
  /** Database ID */
  databaseId: DatabaseId
  /** Initial property values */
  properties?: Record<PropertyId, PropertyValue>
  /** Creator's DID */
  createdBy: DID
}

/**
 * Create a new database item
 */
export function createItem(database: Database, options: CreateItemOptions): DatabaseItem {
  const now = Date.now()
  const itemId = generateItemId()

  // Initialize with default values for all properties
  const properties: Record<PropertyId, PropertyValue> = {}

  for (const propDef of database.properties) {
    const handler = getPropertyHandler(propDef.type)
    const providedValue = options.properties?.[propDef.id]

    if (providedValue !== undefined) {
      // Validate and coerce provided value
      const coerced = handler.coerce(providedValue, propDef.config)
      properties[propDef.id] = coerced as PropertyValue
    } else {
      // Use default value
      const defaultValue = handler.getDefaultValue(propDef.config)
      properties[propDef.id] = defaultValue as PropertyValue
    }
  }

  // Set auto properties
  for (const propDef of database.properties) {
    if (propDef.type === 'created') {
      properties[propDef.id] = now
    } else if (propDef.type === 'updated') {
      properties[propDef.id] = now
    } else if (propDef.type === 'createdBy') {
      properties[propDef.id] = options.createdBy
    }
  }

  return {
    id: itemId,
    databaseId: options.databaseId,
    properties,
    created: now,
    updated: now,
    createdBy: options.createdBy
  }
}

/**
 * Options for updating an item
 */
export interface UpdateItemOptions {
  /** Property values to update */
  properties: Partial<Record<PropertyId, PropertyValue>>
}

/**
 * Update an existing item
 */
export function updateItem(
  database: Database,
  item: DatabaseItem,
  updates: UpdateItemOptions
): DatabaseItem {
  const now = Date.now()
  const newProperties = { ...item.properties }

  // Apply updates with validation
  for (const [propId, value] of Object.entries(updates.properties)) {
    const propDef = database.properties.find((p) => p.id === propId)
    if (!propDef) {
      console.warn(`Property not found: ${propId}`)
      continue
    }

    // Skip auto properties
    if (
      propDef.type === 'created' ||
      propDef.type === 'createdBy' ||
      propDef.type === 'formula' ||
      propDef.type === 'rollup'
    ) {
      continue
    }

    const handler = getPropertyHandler(propDef.type)
    const coerced = handler.coerce(value, propDef.config)
    newProperties[propId as PropertyId] = coerced as PropertyValue
  }

  // Update 'updated' auto property
  for (const propDef of database.properties) {
    if (propDef.type === 'updated') {
      newProperties[propDef.id] = now
    }
  }

  return {
    ...item,
    properties: newProperties,
    updated: now
  }
}

/**
 * Validate an item against database schema
 */
export function validateItem(
  database: Database,
  item: DatabaseItem
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Check required properties
  for (const propDef of database.properties) {
    if (propDef.required) {
      const value = item.properties[propDef.id]
      const handler = getPropertyHandler(propDef.type)

      if (handler.isEmpty(value)) {
        errors.push(`Property "${propDef.name}" is required`)
      }
    }
  }

  // Validate property values
  for (const propDef of database.properties) {
    const value = item.properties[propDef.id]
    if (value === null || value === undefined) continue

    const handler = getPropertyHandler(propDef.type)
    const result = handler.validate(value, propDef.config)

    if (!result.valid) {
      errors.push(`Property "${propDef.name}": ${result.error}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Query options for filtering and sorting items
 */
export interface QueryItemsOptions {
  /** Filter to apply */
  filter?: FilterGroup
  /** Sorts to apply (in order) */
  sorts?: Sort[]
  /** Maximum number of items to return */
  limit?: number
  /** Number of items to skip */
  offset?: number
}

/**
 * Query items with filtering and sorting
 */
export function queryItems(
  database: Database,
  items: DatabaseItem[],
  options: QueryItemsOptions = {}
): DatabaseItem[] {
  let result = [...items]

  // Apply filter
  if (options.filter) {
    result = result.filter((item) => evaluateFilterGroup(database, item, options.filter!))
  }

  // Apply sorts
  if (options.sorts?.length) {
    result = sortItems(database, result, options.sorts)
  }

  // Apply pagination
  if (options.offset !== undefined) {
    result = result.slice(options.offset)
  }
  if (options.limit !== undefined) {
    result = result.slice(0, options.limit)
  }

  return result
}

/**
 * Evaluate a filter group against an item
 */
function evaluateFilterGroup(
  database: Database,
  item: DatabaseItem,
  filterGroup: FilterGroup
): boolean {
  const { operator, filters } = filterGroup

  if (operator === 'and') {
    return filters.every((f) => {
      if ('filters' in f) {
        return evaluateFilterGroup(database, item, f)
      }
      return evaluateFilter(database, item, f)
    })
  } else {
    return filters.some((f) => {
      if ('filters' in f) {
        return evaluateFilterGroup(database, item, f)
      }
      return evaluateFilter(database, item, f)
    })
  }
}

/**
 * Evaluate a single filter against an item
 */
function evaluateFilter(database: Database, item: DatabaseItem, filter: Filter): boolean {
  const propDef = database.properties.find((p) => p.id === filter.propertyId)
  if (!propDef) return true

  const value = item.properties[filter.propertyId]
  const handler = getPropertyHandler(propDef.type)

  return handler.applyFilter(value, filter.operator, filter.value, propDef.config)
}

/**
 * Sort items by multiple properties
 */
function sortItems(database: Database, items: DatabaseItem[], sorts: Sort[]): DatabaseItem[] {
  return [...items].sort((a, b) => {
    for (const sort of sorts) {
      const propDef = database.properties.find((p) => p.id === sort.propertyId)
      if (!propDef) continue

      const handler = getPropertyHandler(propDef.type)
      const valueA = a.properties[sort.propertyId]
      const valueB = b.properties[sort.propertyId]

      let comparison = handler.compare(valueA, valueB, propDef.config)

      if (sort.direction === 'desc') {
        comparison = -comparison
      }

      if (comparison !== 0) {
        return comparison
      }
    }
    return 0
  })
}

/**
 * Get a property value from an item with formatting
 */
export function getFormattedValue(
  database: Database,
  item: DatabaseItem,
  propertyId: PropertyId
): string {
  const propDef = database.properties.find((p) => p.id === propertyId)
  if (!propDef) return ''

  const value = item.properties[propertyId]
  const handler = getPropertyHandler(propDef.type)

  return handler.format(value, propDef.config)
}

/**
 * Get all items grouped by a select property
 */
export function groupItemsByProperty(
  database: Database,
  items: DatabaseItem[],
  propertyId: PropertyId
): Map<string | null, DatabaseItem[]> {
  const groups = new Map<string | null, DatabaseItem[]>()

  for (const item of items) {
    const value = item.properties[propertyId]
    const key = value === null || value === undefined ? null : String(value)

    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(item)
  }

  return groups
}
