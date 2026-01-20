import type { DID } from '@xnet/core'
import type * as Y from 'yjs'

// ID Types
export type DatabaseId = `db:${string}`
export type PropertyId = `prop:${string}`
export type ViewId = `view:${string}`
export type ItemId = `item:${string}`

// Property Types (18 total)
export type PropertyType =
  // Basic
  | 'text'
  | 'number'
  | 'checkbox'
  // Temporal
  | 'date'
  | 'dateRange'
  // Selection
  | 'select'
  | 'multiSelect'
  // References
  | 'person'
  | 'relation'
  | 'rollup'
  // Computed
  | 'formula'
  // Rich
  | 'url'
  | 'email'
  | 'phone'
  | 'file'
  // Auto
  | 'created'
  | 'updated'
  | 'createdBy'

// Property Values
export type PropertyValue =
  | string
  | number
  | boolean
  | Date
  | null
  | string[] // multiSelect, person, relation
  | DateRange
  | FileValue[]

export interface DateRange {
  start: Date
  end: Date | null
}

export interface FileValue {
  id: string
  name: string
  type: string
  size: number
  url: string
}

// Property Configuration
export interface PropertyConfig {
  // Text
  richText?: boolean

  // Number
  numberFormat?: 'number' | 'percent' | 'currency' | 'duration'
  precision?: number
  currencyCode?: string

  // Date
  includeTime?: boolean
  dateFormat?: string
  timeFormat?: '12h' | '24h'

  // Select / MultiSelect
  options?: SelectOption[]

  // Relation
  targetDatabaseId?: DatabaseId
  relationPropertyId?: PropertyId // For bidirectional relations

  // Rollup
  rollupRelationId?: PropertyId
  rollupPropertyId?: PropertyId
  rollupFunction?: RollupFunction

  // Formula
  expression?: string

  // Person
  allowMultiple?: boolean

  // File
  acceptedTypes?: string[]
  maxSize?: number // bytes

  // Auto properties
  format?: 'relative' | 'absolute'
}

export interface SelectOption {
  id: string
  name: string
  color: string
}

export type RollupFunction =
  | 'count'
  | 'countValues'
  | 'countUniqueValues'
  | 'countEmpty'
  | 'countNotEmpty'
  | 'percentEmpty'
  | 'percentNotEmpty'
  | 'sum'
  | 'average'
  | 'median'
  | 'min'
  | 'max'
  | 'range'
  | 'showOriginal'
  | 'showUnique'

// Property Definition
export interface PropertyDefinition {
  id: PropertyId
  name: string
  type: PropertyType
  config: PropertyConfig
  required: boolean
  hidden: boolean
  width?: number
}

// Database
export interface Database {
  id: DatabaseId
  name: string
  icon?: string
  cover?: string
  properties: PropertyDefinition[]
  views: View[]
  defaultViewId: ViewId
  created: number
  updated: number
  createdBy: DID
}

// Database Item
export interface DatabaseItem {
  id: ItemId
  databaseId: DatabaseId
  properties: Record<PropertyId, PropertyValue>
  content?: Y.Doc // Rich text content
  created: number
  updated: number
  createdBy: DID
}

// View Types
export type ViewType = 'table' | 'board' | 'gallery' | 'timeline' | 'calendar' | 'list'

// View Definition
export interface View {
  id: ViewId
  name: string
  type: ViewType
  config: ViewConfig
  visibleProperties: PropertyId[]
  propertyWidths: Record<PropertyId, number>
  filter?: FilterGroup
  sorts: Sort[]
}

// View Configuration (type-specific)
export type ViewConfig =
  | TableViewConfig
  | BoardViewConfig
  | GalleryViewConfig
  | TimelineViewConfig
  | CalendarViewConfig
  | ListViewConfig

export interface TableViewConfig {
  type: 'table'
  wrapCells: boolean
  showRowNumbers: boolean
  frozenColumns: number
}

export interface BoardViewConfig {
  type: 'board'
  groupByPropertyId: PropertyId
  cardProperties: PropertyId[]
  showEmptyColumns: boolean
  columnOrder?: string[]
  cardSize: 'small' | 'medium' | 'large'
}

export interface GalleryViewConfig {
  type: 'gallery'
  coverPropertyId?: PropertyId
  cardProperties: PropertyId[]
  cardSize: 'small' | 'medium' | 'large'
  fitImage: 'cover' | 'contain'
  showTitle: boolean
}

export interface TimelineViewConfig {
  type: 'timeline'
  startDatePropertyId: PropertyId
  endDatePropertyId?: PropertyId
  titlePropertyId?: PropertyId
  colorPropertyId?: PropertyId
  showDependencies: boolean
  defaultZoom: 'day' | 'week' | 'month' | 'quarter' | 'year'
}

export interface CalendarViewConfig {
  type: 'calendar'
  datePropertyId: PropertyId
  endDatePropertyId?: PropertyId
  titlePropertyId?: PropertyId
  colorPropertyId?: PropertyId
  defaultView: 'month' | 'week' | 'day'
  weekStartsOn: 0 | 1 | 6 // Sunday, Monday, Saturday
}

export interface ListViewConfig {
  type: 'list'
  showCheckboxes: boolean
  groupByPropertyId?: PropertyId
}

// Filtering
export interface FilterGroup {
  operator: 'and' | 'or'
  filters: (Filter | FilterGroup)[]
}

export interface Filter {
  propertyId: PropertyId
  operator: FilterOperator
  value: unknown
}

export type FilterOperator =
  // Universal
  | 'isEmpty'
  | 'isNotEmpty'
  // Text
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  // Number
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  // Date
  | 'is'
  | 'isBefore'
  | 'isAfter'
  | 'isOnOrBefore'
  | 'isOnOrAfter'
  | 'isWithin'
  // Select
  | 'isAny'
  | 'isNone'
  // Checkbox
  | 'isChecked'
  | 'isNotChecked'

// Sorting
export interface Sort {
  propertyId: PropertyId
  direction: SortDirection
}

export type SortDirection = 'asc' | 'desc'
