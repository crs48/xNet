/**
 * @xnet/views - Types for database views
 */

import type { PropertyType, PropertyDefinition } from '@xnet/data'

/**
 * Disposable interface for cleanup
 */
export interface Disposable {
  dispose(): void
}

/**
 * View type identifiers
 */
export type ViewType = 'table' | 'board' | 'gallery' | 'timeline' | 'calendar' | 'list'

/**
 * Sort configuration
 */
export interface SortConfig {
  propertyId: string
  direction: 'asc' | 'desc'
}

/**
 * Filter operator types
 */
export type FilterOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterOrEqual'
  | 'lessOrEqual'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'before'
  | 'after'
  | 'between'

/**
 * A single filter condition
 */
export interface Filter {
  id: string
  propertyId: string
  operator: FilterOperator
  value: unknown
}

/**
 * A group of filters with AND/OR logic
 */
export interface FilterGroup {
  type: 'and' | 'or'
  filters: Filter[]
}

/**
 * Gallery card size options
 */
export type GalleryCardSize = 'small' | 'medium' | 'large'

/**
 * Gallery image fit options
 */
export type GalleryImageFit = 'cover' | 'contain'

/**
 * View configuration stored with the database
 */
export interface ViewConfig {
  id: string
  name: string
  type: ViewType

  /** Which properties are visible (ordered) */
  visibleProperties: string[]

  /** Property widths for table view */
  propertyWidths?: Record<string, number>

  /** Active sorts */
  sorts: SortConfig[]

  /** Active filter group */
  filter?: FilterGroup

  /** Board view: property to group by */
  groupByProperty?: string

  /** Gallery view: property for cover image */
  coverProperty?: string

  /** Gallery view: card size */
  galleryCardSize?: GalleryCardSize

  /** Gallery view: image fit mode */
  galleryImageFit?: GalleryImageFit

  /** Gallery view: show title on cards */
  galleryShowTitle?: boolean

  /** Timeline/Calendar: date property to use */
  dateProperty?: string

  /** Timeline: end date property for ranges */
  endDateProperty?: string
}

/**
 * Property handler interface for rendering and editing
 */
export interface PropertyHandler<T = unknown> {
  /** Property type this handler is for */
  type: PropertyType

  /** Render display value */
  render(value: T | null | undefined, config?: Record<string, unknown>): React.ReactNode

  /** Compare two values for sorting */
  compare(
    a: T | null | undefined,
    b: T | null | undefined,
    config?: Record<string, unknown>
  ): number

  /** Available filter operators for this type */
  filterOperators: FilterOperator[]

  /** Apply a filter to a value */
  applyFilter(value: T | null | undefined, operator: FilterOperator, filterValue: unknown): boolean

  /** Editor component for inline editing */
  Editor: React.ComponentType<PropertyEditorProps<T>>

  /** Filter value input component */
  FilterInput?: React.ComponentType<FilterInputProps<T>>
}

/**
 * Props for property editor components
 */
export interface PropertyEditorProps<T = unknown> {
  value: T | null | undefined
  config?: Record<string, unknown>
  onChange: (value: T | null) => void
  onCommit?: (value?: T | null, reason?: EditorCommitReason) => void
  onCancel?: () => void
  onBlur?: () => void
  autoFocus?: boolean
  disabled?: boolean
}

export type EditorCommitReason = 'enter' | 'tab' | 'blur' | 'picker-select' | 'programmatic'

/**
 * Props for filter value input components
 */
export interface FilterInputProps<T = unknown> {
  value: T | null | undefined
  config?: Record<string, unknown>
  operator: FilterOperator
  onChange: (value: T | null) => void
}

/**
 * Column meta for TanStack Table
 */
export interface ColumnMeta {
  property: PropertyDefinition
  handler: PropertyHandler
  onUpdate: (rowId: string, value: unknown) => void
}

/**
 * Remote user's cell focus presence
 */
export interface CellPresence {
  /** Row ID the remote user is focused on */
  rowId: string
  /** Column/property ID the remote user is focused on */
  columnId: string
  /** User's cursor color */
  color: string
  /** User's DID */
  did: string
  /** Display name */
  name: string
}
