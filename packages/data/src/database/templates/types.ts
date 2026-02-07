/**
 * Template type definitions for database templates.
 *
 * Templates provide pre-built database structures that can be
 * instantiated to create new databases.
 */

import type { ColumnType } from '../column-types'
import type { ViewType, FilterGroup, SortConfig } from '../view-types'

// ─── Template Types ───────────────────────────────────────────────────────────

/**
 * A database template definition.
 */
export interface DatabaseTemplate {
  /** Unique template ID */
  id: string

  /** Human-readable name */
  name: string

  /** Short description */
  description: string

  /** Icon (emoji or icon name) */
  icon: string

  /** Category for organization */
  category: TemplateCategory

  /** Column definitions */
  columns: TemplateColumn[]

  /** View definitions */
  views: TemplateView[]

  /** Optional sample data rows */
  sampleData?: TemplateSampleRow[]

  /** Template metadata */
  metadata: TemplateMetadata
}

/**
 * Template categories for organization.
 */
export type TemplateCategory =
  | 'project-management'
  | 'crm'
  | 'inventory'
  | 'content'
  | 'personal'
  | 'education'
  | 'finance'
  | 'custom'

/**
 * Column definition within a template.
 * Uses placeholder IDs that are remapped on instantiation.
 */
export interface TemplateColumn {
  /** Placeholder ID (will be remapped on instantiation) */
  id: string

  /** Column name */
  name: string

  /** Column type */
  type: ColumnType

  /** Type-specific configuration */
  config: Record<string, unknown>

  /** Whether this is the title column */
  isTitle?: boolean

  /** Default width in pixels */
  width?: number
}

/**
 * View definition within a template.
 */
export interface TemplateView {
  /** Placeholder ID */
  id: string

  /** View name */
  name: string

  /** View type */
  type: ViewType

  /** Visible column IDs (placeholders) */
  visibleColumns: string[]

  /** Filter configuration */
  filters?: FilterGroup

  /** Sort configuration */
  sorts?: SortConfig[]

  /** Group by column ID (placeholder) */
  groupBy?: string

  /** Column widths */
  columnWidths?: Record<string, number>
}

/**
 * Sample data row within a template.
 */
export interface TemplateSampleRow {
  /** Cell values keyed by column placeholder ID */
  cells: Record<string, unknown>
}

/**
 * Template metadata.
 */
export interface TemplateMetadata {
  /** Template version */
  version: string

  /** Author DID (for user templates) */
  author?: string

  /** Creation timestamp */
  createdAt: string

  /** Last updated timestamp */
  updatedAt: string

  /** Usage count (for popularity sorting) */
  usageCount?: number

  /** Tags for search */
  tags: string[]
}

// ─── Instantiation Types ──────────────────────────────────────────────────────

/**
 * Options for instantiating a template.
 */
export interface InstantiateOptions {
  /** Include sample data rows (default: true) */
  includeSampleData?: boolean

  /** Override database name */
  name?: string
}

/**
 * Result of instantiating a template.
 */
export interface InstantiatedDatabase {
  /** New database ID */
  id: string

  /** Database name */
  name: string

  /** Column definitions with real IDs */
  columns: InstantiatedColumn[]

  /** View definitions with real IDs */
  views: InstantiatedView[]

  /** Sample data rows with real IDs */
  rows: InstantiatedRow[]

  /** Mapping from template column IDs to real IDs */
  columnIdMap: Map<string, string>

  /** Mapping from template view IDs to real IDs */
  viewIdMap: Map<string, string>
}

/**
 * Instantiated column with real ID.
 */
export interface InstantiatedColumn {
  id: string
  name: string
  type: ColumnType
  config: Record<string, unknown>
  isTitle?: boolean
  width?: number
}

/**
 * Instantiated view with real ID.
 */
export interface InstantiatedView {
  id: string
  name: string
  type: ViewType
  visibleColumns: string[]
  filters?: FilterGroup
  sorts?: SortConfig[]
  groupBy?: string
  columnWidths?: Record<string, number>
}

/**
 * Instantiated row with real ID.
 */
export interface InstantiatedRow {
  id: string
  sortKey: string
  cells: Record<string, unknown>
}

// ─── Save Template Types ──────────────────────────────────────────────────────

/**
 * Options for saving a database as a template.
 */
export interface SaveTemplateOptions {
  /** Template name */
  name: string

  /** Template description */
  description: string

  /** Template icon (default: clipboard emoji) */
  icon?: string

  /** Template category (default: custom) */
  category?: TemplateCategory

  /** Include current data as sample data (default: false) */
  includeSampleData?: boolean

  /** Maximum sample rows to include (default: 5) */
  maxSampleRows?: number

  /** Tags for search */
  tags?: string[]

  /** Author DID */
  authorDid?: string
}

/**
 * Database structure for creating a template.
 */
export interface DatabaseForTemplate {
  name: string
  columns: Array<{
    id: string
    name: string
    type: ColumnType
    config: Record<string, unknown>
    isTitle?: boolean
    width?: number
  }>
  views: Array<{
    id: string
    name: string
    type: ViewType
    visibleColumns: string[]
    filters?: FilterGroup
    sorts?: SortConfig[]
    groupBy?: string
    columnWidths?: Record<string, number>
  }>
  rows: Array<{
    id: string
    sortKey: string
    cells: Record<string, unknown>
  }>
}
