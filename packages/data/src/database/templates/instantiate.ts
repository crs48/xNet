/**
 * Template instantiation - create a new database from a template.
 *
 * Handles:
 * - Remapping placeholder IDs to real IDs
 * - Creating column definitions
 * - Creating view definitions
 * - Optionally including sample data
 */

import type {
  DatabaseTemplate,
  InstantiateOptions,
  InstantiatedDatabase,
  InstantiatedColumn,
  InstantiatedView,
  InstantiatedRow
} from './types'
import type { FilterGroup, FilterCondition, SortConfig } from '../view-types'
import { nanoid } from 'nanoid'
import { generateSortKey } from '../fractional-index'

// ─── Template Instantiation ───────────────────────────────────────────────────

/**
 * Create a new database from a template.
 *
 * @example
 * const template = getTemplateById('project-tracker')
 * const db = instantiateTemplate(template, { includeSampleData: true })
 */
export function instantiateTemplate(
  template: DatabaseTemplate,
  options: InstantiateOptions = {}
): InstantiatedDatabase {
  const { includeSampleData = true, name = template.name } = options

  // Create ID mappings for columns (template ID -> real ID)
  const columnIdMap = new Map<string, string>()
  for (const col of template.columns) {
    columnIdMap.set(col.id, nanoid())
  }

  // Create ID mappings for views
  const viewIdMap = new Map<string, string>()
  for (const view of template.views) {
    viewIdMap.set(view.id, nanoid())
  }

  // Instantiate columns
  const columns: InstantiatedColumn[] = template.columns.map((col) => ({
    id: columnIdMap.get(col.id)!,
    name: col.name,
    type: col.type,
    config: remapColumnConfig(col.config, columnIdMap),
    isTitle: col.isTitle,
    width: col.width
  }))

  // Instantiate views
  const views: InstantiatedView[] = template.views.map((view) => ({
    id: viewIdMap.get(view.id)!,
    name: view.name,
    type: view.type,
    visibleColumns: view.visibleColumns.map((id) => columnIdMap.get(id) ?? id),
    filters: view.filters ? remapFilters(view.filters, columnIdMap) : undefined,
    sorts: view.sorts?.map((s) => remapSort(s, columnIdMap)),
    groupBy: view.groupBy ? columnIdMap.get(view.groupBy) : undefined,
    columnWidths: view.columnWidths ? remapColumnWidths(view.columnWidths, columnIdMap) : undefined
  }))

  // Instantiate sample data
  const rows: InstantiatedRow[] = []
  if (includeSampleData && template.sampleData) {
    let prevKey: string | undefined

    for (const sampleRow of template.sampleData) {
      const sortKey = generateSortKey(prevKey, undefined)
      prevKey = sortKey

      const cells: Record<string, unknown> = {}
      for (const [templateColId, value] of Object.entries(sampleRow.cells)) {
        const realColId = columnIdMap.get(templateColId)
        if (realColId) {
          cells[realColId] = value
        }
      }

      rows.push({
        id: nanoid(),
        sortKey,
        cells
      })
    }
  }

  return {
    id: nanoid(),
    name,
    columns,
    views,
    rows,
    columnIdMap,
    viewIdMap
  }
}

// ─── Remapping Helpers ────────────────────────────────────────────────────────

/**
 * Remap column references in config (e.g., relation targets).
 */
function remapColumnConfig(
  config: Record<string, unknown>,
  columnIdMap: Map<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(config)) {
    if (key === 'targetColumn' && typeof value === 'string') {
      // Remap relation target column
      result[key] = columnIdMap.get(value) ?? value
    } else if (key === 'relationColumn' && typeof value === 'string') {
      // Remap rollup relation column
      result[key] = columnIdMap.get(value) ?? value
    } else if (key === 'options' && Array.isArray(value)) {
      // Regenerate option IDs for select/multiSelect
      result[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null && 'id' in item) {
          return { ...item, id: nanoid() }
        }
        return item
      })
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Remap column references in filter conditions.
 */
function remapFilters(filters: FilterGroup, columnIdMap: Map<string, string>): FilterGroup {
  return {
    operator: filters.operator,
    conditions: filters.conditions.map((cond) => {
      if ('conditions' in cond) {
        // Nested group
        return remapFilters(cond as FilterGroup, columnIdMap)
      }
      // Single condition
      const condition = cond as FilterCondition
      return {
        ...condition,
        columnId: columnIdMap.get(condition.columnId) ?? condition.columnId
      }
    })
  }
}

/**
 * Remap column reference in sort config.
 */
function remapSort(sort: SortConfig, columnIdMap: Map<string, string>): SortConfig {
  return {
    ...sort,
    columnId: columnIdMap.get(sort.columnId) ?? sort.columnId
  }
}

/**
 * Remap column widths.
 */
function remapColumnWidths(
  widths: Record<string, number>,
  columnIdMap: Map<string, string>
): Record<string, number> {
  const result: Record<string, number> = {}

  for (const [templateColId, width] of Object.entries(widths)) {
    const realColId = columnIdMap.get(templateColId) ?? templateColId
    result[realColId] = width
  }

  return result
}

// ─── Empty Template ───────────────────────────────────────────────────────────

/**
 * Create an empty database template.
 * Useful for "start from scratch" option.
 */
export function createEmptyTemplate(): DatabaseTemplate {
  return {
    id: 'empty',
    name: 'Untitled Database',
    description: 'Empty database',
    icon: '📋',
    category: 'custom',
    columns: [{ id: 'title', name: 'Name', type: 'text', config: {}, isTitle: true }],
    views: [
      {
        id: 'default',
        name: 'All',
        type: 'table',
        visibleColumns: ['title']
      }
    ],
    metadata: {
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: []
    }
  }
}

/**
 * Create an empty database (instantiated).
 */
export function createEmptyDatabase(name = 'Untitled Database'): InstantiatedDatabase {
  return instantiateTemplate(createEmptyTemplate(), { name, includeSampleData: false })
}
