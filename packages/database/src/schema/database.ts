/**
 * @xnet/database - Database Schema Operations
 *
 * Functions for creating, updating, and deleting databases.
 */

import type {
  Database,
  DatabaseId,
  PropertyDefinition,
  PropertyId,
  View,
  ViewId,
  FilterGroup,
  Filter
} from '../types'
import { generateDatabaseId, generateViewId, generatePropertyId } from '../utils'

// DID type - using local type to avoid import issues
type DID = `did:key:${string}`

/**
 * Options for creating a new database
 */
export interface CreateDatabaseOptions {
  /** Database name */
  name: string
  /** Optional icon (emoji or URL) */
  icon?: string
  /** Optional cover image URL */
  cover?: string
  /** Initial properties (besides the default title property) */
  properties?: Omit<PropertyDefinition, 'id'>[]
  /** Initial views (table view created by default) */
  views?: Omit<View, 'id'>[]
  /** Creator's DID */
  createdBy: DID
}

/**
 * Create a new database with default properties and views
 */
export function createDatabase(options: CreateDatabaseOptions): Database {
  const now = Date.now()
  const databaseId = generateDatabaseId()

  // Create default title property
  const titleProperty: PropertyDefinition = {
    id: generatePropertyId(),
    name: 'Title',
    type: 'text',
    config: {},
    required: true,
    hidden: false,
    width: 280
  }

  // Add any custom initial properties
  const customProperties: PropertyDefinition[] = (options.properties ?? []).map((prop) => ({
    ...prop,
    id: generatePropertyId()
  }))

  // Create default table view
  const defaultViewId = generateViewId()
  const defaultView: View = {
    id: defaultViewId,
    name: 'Table',
    type: 'table',
    config: {
      type: 'table',
      wrapCells: false,
      showRowNumbers: false,
      frozenColumns: 0
    },
    visibleProperties: [titleProperty.id, ...customProperties.map((p) => p.id)],
    propertyWidths: {
      [titleProperty.id]: 280
    },
    sorts: []
  }

  // Add any custom initial views
  const customViews: View[] = (options.views ?? []).map((view) => ({
    ...view,
    id: generateViewId()
  }))

  return {
    id: databaseId,
    name: options.name,
    icon: options.icon,
    cover: options.cover,
    properties: [titleProperty, ...customProperties],
    views: [defaultView, ...customViews],
    defaultViewId,
    created: now,
    updated: now,
    createdBy: options.createdBy
  }
}

/**
 * Options for updating a database
 */
export interface UpdateDatabaseOptions {
  /** New name */
  name?: string
  /** New icon */
  icon?: string | null
  /** New cover */
  cover?: string | null
  /** New default view ID */
  defaultViewId?: ViewId
}

/**
 * Update database metadata
 */
export function updateDatabase(database: Database, updates: UpdateDatabaseOptions): Database {
  return {
    ...database,
    name: updates.name ?? database.name,
    icon: updates.icon === null ? undefined : (updates.icon ?? database.icon),
    cover: updates.cover === null ? undefined : (updates.cover ?? database.cover),
    defaultViewId: updates.defaultViewId ?? database.defaultViewId,
    updated: Date.now()
  }
}

/**
 * Clone a database with a new ID
 */
export function cloneDatabase(database: Database, newName: string, createdBy: DID): Database {
  const now = Date.now()
  const newDatabaseId = generateDatabaseId()

  // Generate new IDs for properties
  const propertyIdMap = new Map<PropertyId, PropertyId>()
  const newProperties: PropertyDefinition[] = database.properties.map((prop) => {
    const newId = generatePropertyId()
    propertyIdMap.set(prop.id, newId)
    return { ...prop, id: newId }
  })

  // Generate new IDs for views and update property references
  const viewIdMap = new Map<ViewId, ViewId>()
  const newViews: View[] = database.views.map((view) => {
    const newId = generateViewId()
    viewIdMap.set(view.id, newId)

    const remappedVisibleProperties = view.visibleProperties.map(
      (pid) => propertyIdMap.get(pid) ?? pid
    )

    const remappedPropertyWidths: Record<PropertyId, number> = {}
    for (const [pid, width] of Object.entries(view.propertyWidths)) {
      const newPid = propertyIdMap.get(pid as PropertyId) ?? (pid as PropertyId)
      remappedPropertyWidths[newPid] = width
    }

    const remappedSorts = view.sorts.map((sort) => ({
      ...sort,
      propertyId: propertyIdMap.get(sort.propertyId) ?? sort.propertyId
    }))

    return {
      ...view,
      id: newId,
      visibleProperties: remappedVisibleProperties,
      propertyWidths: remappedPropertyWidths,
      sorts: remappedSorts,
      filter: view.filter ? remapFilterPropertyIds(view.filter, propertyIdMap) : undefined
    }
  })

  const newDefaultViewId: ViewId = viewIdMap.get(database.defaultViewId) ?? newViews[0]?.id

  return {
    id: newDatabaseId,
    name: newName,
    icon: database.icon,
    cover: database.cover,
    properties: newProperties,
    views: newViews,
    defaultViewId: newDefaultViewId,
    created: now,
    updated: now,
    createdBy
  }
}

/**
 * Helper to remap property IDs in a filter group
 */
function remapFilterPropertyIds(
  filter: FilterGroup,
  propertyIdMap: Map<PropertyId, PropertyId>
): FilterGroup {
  return {
    ...filter,
    filters: filter.filters.map((f): FilterGroup | Filter => {
      if ('filters' in f) {
        // It's a FilterGroup
        return remapFilterPropertyIds(f, propertyIdMap)
      }
      // It's a Filter
      return {
        ...f,
        propertyId: propertyIdMap.get(f.propertyId) ?? f.propertyId
      }
    })
  }
}

/**
 * Validate a database structure
 */
export function validateDatabase(database: Database): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Check required fields
  if (!database.id) errors.push('Database ID is required')
  if (!database.name) errors.push('Database name is required')
  if (!database.properties?.length) errors.push('At least one property is required')
  if (!database.views?.length) errors.push('At least one view is required')
  if (!database.defaultViewId) errors.push('Default view ID is required')
  if (!database.createdBy) errors.push('Creator DID is required')

  // Check that default view exists
  if (database.defaultViewId && database.views) {
    const hasDefaultView = database.views.some((v) => v.id === database.defaultViewId)
    if (!hasDefaultView) {
      errors.push('Default view ID does not match any view')
    }
  }

  // Check that visible properties in views reference valid properties
  const propertyIds = new Set(database.properties?.map((p) => p.id) ?? [])
  for (const view of database.views ?? []) {
    for (const pid of view.visibleProperties) {
      if (!propertyIds.has(pid)) {
        errors.push(`View "${view.name}" references unknown property: ${pid}`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}
