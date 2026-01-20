/**
 * @xnet/database - View Schema Operations
 *
 * Functions for creating, updating, and deleting views within a database.
 */

import type {
  Database,
  View,
  ViewId,
  ViewType,
  ViewConfig,
  PropertyId,
  FilterGroup,
  Sort,
  TableViewConfig,
  BoardViewConfig,
  GalleryViewConfig,
  TimelineViewConfig,
  CalendarViewConfig,
  ListViewConfig
} from '../types'
import { generateViewId } from '../utils'

/**
 * Options for creating a new view
 */
export interface CreateViewOptions {
  /** View name */
  name: string
  /** View type */
  type: ViewType
  /** Type-specific configuration */
  config?: Partial<ViewConfig>
  /** Properties to show (default: all non-hidden) */
  visibleProperties?: PropertyId[]
  /** Initial filters */
  filter?: FilterGroup
  /** Initial sorts */
  sorts?: Sort[]
}

/**
 * Create a new view in a database
 */
export function createView(database: Database, options: CreateViewOptions): Database {
  const viewId = generateViewId()

  // Default to showing all non-hidden properties
  const visibleProperties =
    options.visibleProperties ?? database.properties.filter((p) => !p.hidden).map((p) => p.id)

  // Default property widths from property definitions
  const propertyWidths: Record<PropertyId, number> = {}
  for (const prop of database.properties) {
    if (visibleProperties.includes(prop.id)) {
      propertyWidths[prop.id] = prop.width ?? 150
    }
  }

  // Create type-specific config with defaults
  const config = createDefaultViewConfig(options.type, options.config, database)

  const view: View = {
    id: viewId,
    name: options.name,
    type: options.type,
    config,
    visibleProperties,
    propertyWidths,
    filter: options.filter,
    sorts: options.sorts ?? []
  }

  return {
    ...database,
    views: [...database.views, view],
    updated: Date.now()
  }
}

/**
 * Options for updating a view
 */
export interface UpdateViewOptions {
  /** New name */
  name?: string
  /** Updated configuration */
  config?: Partial<ViewConfig>
  /** Updated visible properties */
  visibleProperties?: PropertyId[]
  /** Updated property widths */
  propertyWidths?: Record<PropertyId, number>
  /** Updated filter */
  filter?: FilterGroup | null
  /** Updated sorts */
  sorts?: Sort[]
}

/**
 * Update an existing view
 */
export function updateView(
  database: Database,
  viewId: ViewId,
  updates: UpdateViewOptions
): Database {
  const viewIndex = database.views.findIndex((v) => v.id === viewId)
  if (viewIndex === -1) {
    throw new Error(`View not found: ${viewId}`)
  }

  const existingView = database.views[viewIndex]
  const updatedView: View = {
    ...existingView,
    name: updates.name ?? existingView.name,
    config:
      updates.config !== undefined
        ? ({ ...existingView.config, ...updates.config } as ViewConfig)
        : existingView.config,
    visibleProperties: updates.visibleProperties ?? existingView.visibleProperties,
    propertyWidths: updates.propertyWidths
      ? { ...existingView.propertyWidths, ...updates.propertyWidths }
      : existingView.propertyWidths,
    filter: updates.filter === null ? undefined : (updates.filter ?? existingView.filter),
    sorts: updates.sorts ?? existingView.sorts
  }

  const views = [...database.views]
  views[viewIndex] = updatedView

  return {
    ...database,
    views,
    updated: Date.now()
  }
}

/**
 * Delete a view from a database
 */
export function deleteView(database: Database, viewId: ViewId): Database {
  const viewIndex = database.views.findIndex((v) => v.id === viewId)
  if (viewIndex === -1) {
    throw new Error(`View not found: ${viewId}`)
  }

  // Don't allow deleting the last view
  if (database.views.length === 1) {
    throw new Error('Cannot delete the last view')
  }

  const views = database.views.filter((v) => v.id !== viewId)

  // Update default view if we're deleting it
  let defaultViewId = database.defaultViewId
  if (defaultViewId === viewId) {
    defaultViewId = views[0].id
  }

  return {
    ...database,
    views,
    defaultViewId,
    updated: Date.now()
  }
}

/**
 * Duplicate a view
 */
export function duplicateView(database: Database, viewId: ViewId, newName?: string): Database {
  const sourceView = database.views.find((v) => v.id === viewId)
  if (!sourceView) {
    throw new Error(`View not found: ${viewId}`)
  }

  const newView: View = {
    ...sourceView,
    id: generateViewId(),
    name: newName ?? `${sourceView.name} (copy)`
  }

  return {
    ...database,
    views: [...database.views, newView],
    updated: Date.now()
  }
}

/**
 * Move a view to a new position
 */
export function moveView(database: Database, viewId: ViewId, newPosition: number): Database {
  const currentIndex = database.views.findIndex((v) => v.id === viewId)
  if (currentIndex === -1) {
    throw new Error(`View not found: ${viewId}`)
  }

  const views = [...database.views]
  const [view] = views.splice(currentIndex, 1)
  views.splice(newPosition, 0, view)

  return {
    ...database,
    views,
    updated: Date.now()
  }
}

/**
 * Set the default view
 */
export function setDefaultView(database: Database, viewId: ViewId): Database {
  const view = database.views.find((v) => v.id === viewId)
  if (!view) {
    throw new Error(`View not found: ${viewId}`)
  }

  return {
    ...database,
    defaultViewId: viewId,
    updated: Date.now()
  }
}

/**
 * Toggle property visibility in a view
 */
export function togglePropertyInView(
  database: Database,
  viewId: ViewId,
  propertyId: PropertyId,
  visible: boolean
): Database {
  const viewIndex = database.views.findIndex((v) => v.id === viewId)
  if (viewIndex === -1) {
    throw new Error(`View not found: ${viewId}`)
  }

  const view = database.views[viewIndex]
  const visibleProperties = visible
    ? [...view.visibleProperties, propertyId]
    : view.visibleProperties.filter((pid) => pid !== propertyId)

  const views = [...database.views]
  views[viewIndex] = {
    ...view,
    visibleProperties
  }

  return {
    ...database,
    views,
    updated: Date.now()
  }
}

/**
 * Reorder properties in a view
 */
export function reorderPropertiesInView(
  database: Database,
  viewId: ViewId,
  propertyIds: PropertyId[]
): Database {
  const viewIndex = database.views.findIndex((v) => v.id === viewId)
  if (viewIndex === -1) {
    throw new Error(`View not found: ${viewId}`)
  }

  const views = [...database.views]
  views[viewIndex] = {
    ...views[viewIndex],
    visibleProperties: propertyIds
  }

  return {
    ...database,
    views,
    updated: Date.now()
  }
}

/**
 * Create default view configuration based on type
 */
function createDefaultViewConfig(
  type: ViewType,
  partial: Partial<ViewConfig> | undefined,
  database: Database
): ViewConfig {
  switch (type) {
    case 'table':
      return {
        type: 'table',
        wrapCells: false,
        showRowNumbers: false,
        frozenColumns: 0,
        ...(partial as Partial<TableViewConfig>)
      } as TableViewConfig

    case 'board': {
      // Find first select property for grouping
      const selectProperty = database.properties.find((p) => p.type === 'select')
      return {
        type: 'board',
        groupByPropertyId: selectProperty?.id ?? ('' as PropertyId),
        cardProperties: database.properties.slice(0, 3).map((p) => p.id),
        showEmptyColumns: true,
        cardSize: 'medium',
        ...(partial as Partial<BoardViewConfig>)
      } as BoardViewConfig
    }

    case 'gallery': {
      // Find first file property for cover
      const fileProperty = database.properties.find((p) => p.type === 'file')
      return {
        type: 'gallery',
        coverPropertyId: fileProperty?.id,
        cardProperties: database.properties.slice(0, 3).map((p) => p.id),
        cardSize: 'medium',
        fitImage: 'cover',
        showTitle: true,
        ...(partial as Partial<GalleryViewConfig>)
      } as GalleryViewConfig
    }

    case 'timeline': {
      // Find first date property
      const dateProperty = database.properties.find((p) => p.type === 'date')
      const titleProperty = database.properties[0]
      return {
        type: 'timeline',
        startDatePropertyId: dateProperty?.id ?? ('' as PropertyId),
        titlePropertyId: titleProperty?.id,
        showDependencies: false,
        defaultZoom: 'month',
        ...(partial as Partial<TimelineViewConfig>)
      } as TimelineViewConfig
    }

    case 'calendar': {
      // Find first date property
      const dateProperty = database.properties.find((p) => p.type === 'date')
      const titleProperty = database.properties[0]
      return {
        type: 'calendar',
        datePropertyId: dateProperty?.id ?? ('' as PropertyId),
        titlePropertyId: titleProperty?.id,
        defaultView: 'month',
        weekStartsOn: 0,
        ...(partial as Partial<CalendarViewConfig>)
      } as CalendarViewConfig
    }

    case 'list':
      return {
        type: 'list',
        showCheckboxes: false,
        ...(partial as Partial<ListViewConfig>)
      } as ListViewConfig

    default:
      throw new Error(`Unknown view type: ${type}`)
  }
}
