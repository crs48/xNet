/**
 * Database Schema Clone
 *
 * Utilities for cloning a database schema to create a new database
 * with the same structure but fresh data.
 */

import type { StoredColumn, DatabaseSchemaMetadata } from './schema-utils'
import type { ViewConfig, FilterGroup, FilterCondition, SortConfig } from './view-types'
import { nanoid } from 'nanoid'
import { createInitialSchemaMetadata } from './schema-utils'
import { isFilterGroup, isFilterCondition } from './view-types'

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * Options for cloning a database schema.
 */
export interface CloneSchemaOptions {
  /** Name for the new database (defaults to "Original Name (Copy)") */
  name?: string
  /** Description for the new database */
  description?: string
  /** Whether to include sample rows (default: false) */
  includeRows?: boolean
  /** Maximum number of sample rows to include (default: 10) */
  maxSampleRows?: number
}

/**
 * Result of cloning a database schema.
 */
export interface CloneSchemaResult {
  /** New column definitions with remapped IDs */
  columns: StoredColumn[]
  /** Mapping from old column IDs to new column IDs */
  columnIdMap: Map<string, string>
  /** New schema metadata */
  metadata: DatabaseSchemaMetadata
  /** Remapped view configurations */
  views: {
    tableView?: ViewConfig
    boardView?: ViewConfig
    [key: string]: ViewConfig | undefined
  }
  /** Sample rows (if includeRows was true) */
  sampleRows?: Array<Record<string, unknown>>
}

/**
 * Source data for cloning.
 */
export interface CloneSourceData {
  columns: StoredColumn[]
  metadata: DatabaseSchemaMetadata
  tableView?: ViewConfig
  boardView?: ViewConfig
  rows?: Array<Record<string, unknown>>
}

// ─── Column ID Remapping ────────────────────────────────────────────────────────

/**
 * Generate new column IDs for cloning.
 * Returns a map from old IDs to new IDs.
 */
export function generateColumnIdMap(columns: StoredColumn[]): Map<string, string> {
  const idMap = new Map<string, string>()
  for (const col of columns) {
    idMap.set(col.id, `col_${nanoid(10)}`)
  }
  return idMap
}

/**
 * Clone columns with new IDs.
 */
export function cloneColumns(columns: StoredColumn[], idMap: Map<string, string>): StoredColumn[] {
  return columns.map((col) => ({
    ...col,
    id: idMap.get(col.id) ?? col.id,
    // Deep clone config to avoid mutations
    config: col.config ? JSON.parse(JSON.stringify(col.config)) : undefined
  }))
}

// ─── View Config Remapping ──────────────────────────────────────────────────────

/**
 * Remap column IDs in a filter group.
 */
function remapFilterGroup(group: FilterGroup, idMap: Map<string, string>): FilterGroup {
  return {
    operator: group.operator,
    conditions: group.conditions.map((item) => {
      if (isFilterGroup(item)) {
        return remapFilterGroup(item, idMap)
      } else if (isFilterCondition(item)) {
        return remapFilterCondition(item, idMap)
      }
      return item
    })
  }
}

/**
 * Remap column IDs in a filter condition.
 */
function remapFilterCondition(
  condition: FilterCondition,
  idMap: Map<string, string>
): FilterCondition {
  return {
    ...condition,
    columnId: idMap.get(condition.columnId) ?? condition.columnId
  }
}

/**
 * Remap column IDs in sort configurations.
 */
function remapSorts(sorts: SortConfig[], idMap: Map<string, string>): SortConfig[] {
  return sorts.map((sort) => ({
    ...sort,
    columnId: idMap.get(sort.columnId) ?? sort.columnId
  }))
}

/**
 * Remap column IDs in a view configuration.
 * This handles all the places where column IDs are referenced.
 */
export function remapViewColumnIds(view: ViewConfig, idMap: Map<string, string>): ViewConfig {
  const remapped: ViewConfig = {
    ...view,
    id: `view_${nanoid(10)}`, // New view ID
    // Remap visible columns
    visibleColumns: view.visibleColumns.map((id) => idMap.get(id) ?? id)
  }

  // Remap column widths
  if (view.columnWidths) {
    remapped.columnWidths = {}
    for (const [oldId, width] of Object.entries(view.columnWidths)) {
      const newId = idMap.get(oldId) ?? oldId
      remapped.columnWidths[newId] = width
    }
  }

  // Remap filters
  if (view.filters) {
    remapped.filters = remapFilterGroup(view.filters, idMap)
  }

  // Remap sorts
  if (view.sorts) {
    remapped.sorts = remapSorts(view.sorts, idMap)
  }

  // Remap groupBy
  if (view.groupBy) {
    remapped.groupBy = idMap.get(view.groupBy) ?? view.groupBy
  }

  // Remap collapsed groups (these are typically option IDs, not column IDs, so we don't remap them)
  // But if they're column IDs in some context, we'd need to update this

  // Remap gallery/board cover column
  if (view.coverColumn) {
    remapped.coverColumn = idMap.get(view.coverColumn) ?? view.coverColumn
  }

  // Remap calendar/timeline date columns
  if (view.dateColumn) {
    remapped.dateColumn = idMap.get(view.dateColumn) ?? view.dateColumn
  }
  if (view.endDateColumn) {
    remapped.endDateColumn = idMap.get(view.endDateColumn) ?? view.endDateColumn
  }

  return remapped
}

// ─── Row Remapping ──────────────────────────────────────────────────────────────

/**
 * Remap column IDs in a row.
 */
function remapRow(
  row: Record<string, unknown>,
  idMap: Map<string, string>
): Record<string, unknown> {
  const remapped: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(row)) {
    // Keep special keys (id, etc.) unchanged
    if (key === 'id') {
      remapped[key] = `row_${nanoid(10)}` // New row ID
    } else {
      // Try to remap column ID
      const newKey = idMap.get(key) ?? key
      remapped[newKey] = value
    }
  }

  return remapped
}

/**
 * Clone sample rows with new IDs.
 */
export function cloneSampleRows(
  rows: Array<Record<string, unknown>>,
  idMap: Map<string, string>,
  maxRows: number = 10
): Array<Record<string, unknown>> {
  return rows.slice(0, maxRows).map((row) => remapRow(row, idMap))
}

// ─── Main Clone Function ────────────────────────────────────────────────────────

/**
 * Clone a database schema to create a new database.
 *
 * This creates new column definitions, remapped view configs,
 * and fresh schema metadata with version 1.0.0.
 *
 * @param source - The source database data
 * @param options - Clone options
 * @returns The cloned schema data ready to be saved to a new Y.Doc
 *
 * @example
 * ```typescript
 * const source = {
 *   columns: getColumns(doc),
 *   metadata: getSchemaMetadata(doc),
 *   tableView: getTableView(doc),
 *   boardView: getBoardView(doc),
 *   rows: getRows(doc)
 * }
 *
 * const result = cloneSchema(source, { name: 'My New Database' })
 *
 * // Apply to new Y.Doc
 * newDoc.getMap('data').set('columns', result.columns)
 * newDoc.getMap('data').set('schema', result.metadata)
 * // etc.
 * ```
 */
export function cloneSchema(
  source: CloneSourceData,
  options: CloneSchemaOptions = {}
): CloneSchemaResult {
  // Generate new column IDs
  const columnIdMap = generateColumnIdMap(source.columns)

  // Clone columns with new IDs
  const columns = cloneColumns(source.columns, columnIdMap)

  // Create new metadata
  const name = options.name ?? `${source.metadata.name} (Copy)`
  const metadata = createInitialSchemaMetadata(name)
  if (options.description) {
    metadata.description = options.description
  }

  // Remap view configurations
  const views: CloneSchemaResult['views'] = {}

  if (source.tableView) {
    views.tableView = remapViewColumnIds(source.tableView, columnIdMap)
  }

  if (source.boardView) {
    views.boardView = remapViewColumnIds(source.boardView, columnIdMap)
  }

  // Clone sample rows if requested
  let sampleRows: Array<Record<string, unknown>> | undefined
  if (options.includeRows && source.rows && source.rows.length > 0) {
    sampleRows = cloneSampleRows(source.rows, columnIdMap, options.maxSampleRows ?? 10)
  }

  return {
    columns,
    columnIdMap,
    metadata,
    views,
    sampleRows
  }
}
