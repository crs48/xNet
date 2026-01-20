/**
 * @xnet/records - Property Schema Operations
 *
 * Functions for creating, updating, and deleting properties within a database.
 */

import type {
  Database,
  PropertyDefinition,
  PropertyId,
  PropertyType,
  PropertyConfig,
  SelectOption
} from '../types'
import { generatePropertyId, generateOptionId } from '../utils'
import { getPropertyHandler, isComputedProperty } from '../properties/registry'

/**
 * Options for creating a new property
 */
export interface CreatePropertyOptions {
  /** Property name */
  name: string
  /** Property type */
  type: PropertyType
  /** Type-specific configuration */
  config?: PropertyConfig
  /** Whether the property is required */
  required?: boolean
  /** Whether the property is hidden by default */
  hidden?: boolean
  /** Default column width in pixels */
  width?: number
  /** Position to insert (default: end) */
  position?: number
}

/**
 * Add a new property to a database
 */
export function createProperty(database: Database, options: CreatePropertyOptions): Database {
  const propertyId = generatePropertyId()

  const property: PropertyDefinition = {
    id: propertyId,
    name: options.name,
    type: options.type,
    config: options.config ?? {},
    required: options.required ?? false,
    hidden: options.hidden ?? false,
    width: options.width ?? getDefaultWidth(options.type)
  }

  // Insert at position or append
  const properties = [...database.properties]
  const position = options.position ?? properties.length
  properties.splice(position, 0, property)

  // Add to visible properties in all views (unless hidden)
  const views = database.views.map((view) => {
    if (options.hidden) return view
    return {
      ...view,
      visibleProperties: [...view.visibleProperties, propertyId],
      propertyWidths: {
        ...view.propertyWidths,
        [propertyId]: property.width ?? getDefaultWidth(options.type)
      }
    }
  })

  return {
    ...database,
    properties,
    views,
    updated: Date.now()
  }
}

/**
 * Options for updating a property
 */
export interface UpdatePropertyOptions {
  /** New name */
  name?: string
  /** New configuration */
  config?: PropertyConfig
  /** New required state */
  required?: boolean
  /** New hidden state */
  hidden?: boolean
  /** New default width */
  width?: number
}

/**
 * Update an existing property
 */
export function updateProperty(
  database: Database,
  propertyId: PropertyId,
  updates: UpdatePropertyOptions
): Database {
  const propertyIndex = database.properties.findIndex((p) => p.id === propertyId)
  if (propertyIndex === -1) {
    throw new Error(`Property not found: ${propertyId}`)
  }

  const existingProperty = database.properties[propertyIndex]
  const updatedProperty: PropertyDefinition = {
    ...existingProperty,
    name: updates.name ?? existingProperty.name,
    config: updates.config ?? existingProperty.config,
    required: updates.required ?? existingProperty.required,
    hidden: updates.hidden ?? existingProperty.hidden,
    width: updates.width ?? existingProperty.width
  }

  const properties = [...database.properties]
  properties[propertyIndex] = updatedProperty

  // Update hidden state in views
  let views = database.views
  if (updates.hidden !== undefined) {
    views = views.map((view) => {
      if (updates.hidden) {
        // Remove from visible properties
        return {
          ...view,
          visibleProperties: view.visibleProperties.filter((pid) => pid !== propertyId)
        }
      } else if (!view.visibleProperties.includes(propertyId)) {
        // Add to visible properties
        return {
          ...view,
          visibleProperties: [...view.visibleProperties, propertyId]
        }
      }
      return view
    })
  }

  return {
    ...database,
    properties,
    views,
    updated: Date.now()
  }
}

/**
 * Delete a property from a database
 */
export function deleteProperty(database: Database, propertyId: PropertyId): Database {
  const propertyIndex = database.properties.findIndex((p) => p.id === propertyId)
  if (propertyIndex === -1) {
    throw new Error(`Property not found: ${propertyId}`)
  }

  const property = database.properties[propertyIndex]

  // Don't allow deleting the title property (first property with type 'text' and required)
  if (property.required && property.type === 'text' && propertyIndex === 0) {
    throw new Error('Cannot delete the title property')
  }

  const properties = database.properties.filter((p) => p.id !== propertyId)

  // Remove from all views
  const views = database.views.map((view) => ({
    ...view,
    visibleProperties: view.visibleProperties.filter((pid) => pid !== propertyId),
    propertyWidths: Object.fromEntries(
      Object.entries(view.propertyWidths).filter(([pid]) => pid !== propertyId)
    ),
    sorts: view.sorts.filter((s) => s.propertyId !== propertyId),
    // Remove filters referencing this property
    filter: view.filter ? removePropertyFromFilter(view.filter, propertyId) : undefined
  }))

  return {
    ...database,
    properties,
    views,
    updated: Date.now()
  }
}

/**
 * Move a property to a new position
 */
export function moveProperty(
  database: Database,
  propertyId: PropertyId,
  newPosition: number
): Database {
  const currentIndex = database.properties.findIndex((p) => p.id === propertyId)
  if (currentIndex === -1) {
    throw new Error(`Property not found: ${propertyId}`)
  }

  const properties = [...database.properties]
  const [property] = properties.splice(currentIndex, 1)
  properties.splice(newPosition, 0, property)

  return {
    ...database,
    properties,
    updated: Date.now()
  }
}

/**
 * Add an option to a select or multi-select property
 */
export function addSelectOption(
  database: Database,
  propertyId: PropertyId,
  option: Omit<SelectOption, 'id'>
): Database {
  const propertyIndex = database.properties.findIndex((p) => p.id === propertyId)
  if (propertyIndex === -1) {
    throw new Error(`Property not found: ${propertyId}`)
  }

  const property = database.properties[propertyIndex]
  if (property.type !== 'select' && property.type !== 'multiSelect') {
    throw new Error('Property is not a select or multi-select type')
  }

  const newOption: SelectOption = {
    id: generateOptionId(),
    name: option.name,
    color: option.color
  }

  const existingOptions = property.config.options ?? []
  const updatedProperty: PropertyDefinition = {
    ...property,
    config: {
      ...property.config,
      options: [...existingOptions, newOption]
    }
  }

  const properties = [...database.properties]
  properties[propertyIndex] = updatedProperty

  return {
    ...database,
    properties,
    updated: Date.now()
  }
}

/**
 * Update a select option
 */
export function updateSelectOption(
  database: Database,
  propertyId: PropertyId,
  optionId: string,
  updates: Partial<Omit<SelectOption, 'id'>>
): Database {
  const propertyIndex = database.properties.findIndex((p) => p.id === propertyId)
  if (propertyIndex === -1) {
    throw new Error(`Property not found: ${propertyId}`)
  }

  const property = database.properties[propertyIndex]
  const options = property.config.options ?? []
  const optionIndex = options.findIndex((o: SelectOption) => o.id === optionId)
  if (optionIndex === -1) {
    throw new Error(`Option not found: ${optionId}`)
  }

  const updatedOptions = [...options]
  updatedOptions[optionIndex] = {
    ...updatedOptions[optionIndex],
    ...updates
  }

  const updatedProperty: PropertyDefinition = {
    ...property,
    config: {
      ...property.config,
      options: updatedOptions
    }
  }

  const properties = [...database.properties]
  properties[propertyIndex] = updatedProperty

  return {
    ...database,
    properties,
    updated: Date.now()
  }
}

/**
 * Delete a select option
 */
export function deleteSelectOption(
  database: Database,
  propertyId: PropertyId,
  optionId: string
): Database {
  const propertyIndex = database.properties.findIndex((p) => p.id === propertyId)
  if (propertyIndex === -1) {
    throw new Error(`Property not found: ${propertyId}`)
  }

  const property = database.properties[propertyIndex]
  const options = property.config.options ?? []

  const updatedProperty: PropertyDefinition = {
    ...property,
    config: {
      ...property.config,
      options: options.filter((o: SelectOption) => o.id !== optionId)
    }
  }

  const properties = [...database.properties]
  properties[propertyIndex] = updatedProperty

  return {
    ...database,
    properties,
    updated: Date.now()
  }
}

/**
 * Get default width for a property type
 */
function getDefaultWidth(type: PropertyType): number {
  switch (type) {
    case 'text':
      return 200
    case 'number':
      return 100
    case 'checkbox':
      return 60
    case 'date':
    case 'dateRange':
      return 150
    case 'select':
    case 'multiSelect':
      return 150
    case 'person':
      return 120
    case 'relation':
      return 200
    case 'rollup':
    case 'formula':
      return 150
    case 'url':
    case 'email':
      return 200
    case 'phone':
      return 120
    case 'file':
      return 200
    case 'created':
    case 'updated':
      return 150
    case 'createdBy':
      return 120
    default:
      return 150
  }
}

/**
 * Helper to remove a property from filters
 */
function removePropertyFromFilter(
  filter: NonNullable<Database['views'][0]['filter']>,
  propertyId: PropertyId
): Database['views'][0]['filter'] {
  const newFilters = filter.filters
    .map((f) => {
      if ('operator' in f && 'filters' in f) {
        // It's a FilterGroup
        return removePropertyFromFilter(f, propertyId)
      }
      // It's a Filter - remove if it references the property
      if (f.propertyId === propertyId) {
        return null
      }
      return f
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)

  // If no filters left, return undefined
  if (newFilters.length === 0) {
    return undefined
  }

  return {
    ...filter,
    filters: newFilters
  }
}
