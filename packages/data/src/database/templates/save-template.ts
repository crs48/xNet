/**
 * Save database as template.
 *
 * Converts an existing database structure into a reusable template.
 * Handles:
 * - Converting real IDs to stable placeholder IDs
 * - Optionally including sample data
 * - Sanitizing sensitive values
 */

import type {
  DatabaseTemplate,
  TemplateColumn,
  TemplateView,
  TemplateSampleRow,
  SaveTemplateOptions,
  DatabaseForTemplate
} from './types'
import type { FilterGroup, FilterCondition, SortConfig } from '../view-types'
import { nanoid } from 'nanoid'

// ─── Create Template from Database ────────────────────────────────────────────

/**
 * Create a template from an existing database.
 *
 * @example
 * const template = createTemplateFromDatabase(database, {
 *   name: 'My Template',
 *   description: 'A custom template',
 *   tags: ['custom', 'project']
 * })
 */
export function createTemplateFromDatabase(
  database: DatabaseForTemplate,
  options: SaveTemplateOptions
): DatabaseTemplate {
  const {
    name,
    description,
    icon = '📋',
    category = 'custom',
    includeSampleData = false,
    maxSampleRows = 5,
    tags = [],
    authorDid
  } = options

  // Create stable placeholder IDs for columns
  const columnIdMap = new Map<string, string>()
  for (let i = 0; i < database.columns.length; i++) {
    columnIdMap.set(database.columns[i].id, `col-${i}`)
  }

  // Create stable placeholder IDs for views
  const viewIdMap = new Map<string, string>()
  for (let i = 0; i < database.views.length; i++) {
    viewIdMap.set(database.views[i].id, `view-${i}`)
  }

  // Convert columns to template format
  const columns: TemplateColumn[] = database.columns.map((col, i) => ({
    id: `col-${i}`,
    name: col.name,
    type: col.type,
    config: remapColumnConfigForTemplate(col.config, columnIdMap),
    isTitle: col.isTitle,
    width: col.width
  }))

  // Convert views to template format
  const views: TemplateView[] = database.views.map((view, i) => ({
    id: `view-${i}`,
    name: view.name,
    type: view.type,
    visibleColumns: view.visibleColumns.map((id) => columnIdMap.get(id) ?? id),
    filters: view.filters ? remapFiltersForTemplate(view.filters, columnIdMap) : undefined,
    sorts: view.sorts?.map((s) => remapSortForTemplate(s, columnIdMap)),
    groupBy: view.groupBy ? columnIdMap.get(view.groupBy) : undefined,
    columnWidths: view.columnWidths
      ? remapColumnWidthsForTemplate(view.columnWidths, columnIdMap)
      : undefined
  }))

  // Convert sample data
  const sampleData: TemplateSampleRow[] | undefined = includeSampleData
    ? database.rows.slice(0, maxSampleRows).map((row) => {
        const cells: Record<string, unknown> = {}
        for (const [colId, value] of Object.entries(row.cells)) {
          const templateColId = columnIdMap.get(colId)
          if (templateColId) {
            cells[templateColId] = sanitizeValueForTemplate(value)
          }
        }
        return { cells }
      })
    : undefined

  const now = new Date().toISOString()

  return {
    id: nanoid(),
    name,
    description,
    icon,
    category,
    columns,
    views,
    sampleData,
    metadata: {
      version: '1.0.0',
      author: authorDid,
      createdAt: now,
      updatedAt: now,
      tags
    }
  }
}

// ─── Remapping Helpers ────────────────────────────────────────────────────────

/**
 * Remap column config for template (convert real IDs to placeholders).
 */
function remapColumnConfigForTemplate(
  config: Record<string, unknown>,
  columnIdMap: Map<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(config)) {
    if (key === 'targetColumn' && typeof value === 'string') {
      result[key] = columnIdMap.get(value) ?? value
    } else if (key === 'relationColumn' && typeof value === 'string') {
      result[key] = columnIdMap.get(value) ?? value
    } else if (key === 'options' && Array.isArray(value)) {
      // Regenerate stable option IDs
      result[key] = value.map((opt, i) => ({
        ...opt,
        id: `opt-${i}`
      }))
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Remap filters for template.
 */
function remapFiltersForTemplate(
  filters: FilterGroup,
  columnIdMap: Map<string, string>
): FilterGroup {
  return {
    operator: filters.operator,
    conditions: filters.conditions.map((cond) => {
      if ('conditions' in cond) {
        return remapFiltersForTemplate(cond as FilterGroup, columnIdMap)
      }
      const condition = cond as FilterCondition
      return {
        ...condition,
        columnId: columnIdMap.get(condition.columnId) ?? condition.columnId
      }
    })
  }
}

/**
 * Remap sort for template.
 */
function remapSortForTemplate(sort: SortConfig, columnIdMap: Map<string, string>): SortConfig {
  return {
    ...sort,
    columnId: columnIdMap.get(sort.columnId) ?? sort.columnId
  }
}

/**
 * Remap column widths for template.
 */
function remapColumnWidthsForTemplate(
  widths: Record<string, number>,
  columnIdMap: Map<string, string>
): Record<string, number> {
  const result: Record<string, number> = {}

  for (const [colId, width] of Object.entries(widths)) {
    const templateColId = columnIdMap.get(colId) ?? colId
    result[templateColId] = width
  }

  return result
}

// ─── Value Sanitization ───────────────────────────────────────────────────────

/**
 * Remove sensitive data from values for template sample data.
 */
export function sanitizeValueForTemplate(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    // Check for email patterns
    if (isEmailLike(value)) {
      return 'example@example.com'
    }
    // Check for phone patterns
    if (isPhoneLike(value)) {
      return '+1 555-0123'
    }
    // Check for credit card patterns
    if (isCreditCardLike(value)) {
      return '****-****-****-0000'
    }
    // Check for SSN patterns
    if (isSSNLike(value)) {
      return '***-**-0000'
    }
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValueForTemplate)
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      result[k] = sanitizeValueForTemplate(v)
    }
    return result
  }

  return value
}

/**
 * Check if a string looks like an email.
 */
function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
 * Check if a string looks like a phone number.
 */
function isPhoneLike(value: string): boolean {
  // Remove common formatting
  const digits = value.replace(/[\s\-().+]/g, '')
  return /^\d{10,15}$/.test(digits)
}

/**
 * Check if a string looks like a credit card number.
 */
function isCreditCardLike(value: string): boolean {
  const digits = value.replace(/[\s-]/g, '')
  return /^\d{13,19}$/.test(digits)
}

/**
 * Check if a string looks like a US SSN.
 */
function isSSNLike(value: string): boolean {
  return /^\d{3}-?\d{2}-?\d{4}$/.test(value)
}

// ─── Template Validation ──────────────────────────────────────────────────────

/**
 * Validate a template structure.
 */
export function validateTemplate(template: DatabaseTemplate): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!template.id) {
    errors.push('Template must have an id')
  }

  if (!template.name) {
    errors.push('Template must have a name')
  }

  if (!template.columns || template.columns.length === 0) {
    errors.push('Template must have at least one column')
  }

  if (!template.views || template.views.length === 0) {
    errors.push('Template must have at least one view')
  }

  // Validate columns
  const columnIds = new Set<string>()
  for (const col of template.columns) {
    if (!col.id) {
      errors.push(`Column missing id: ${col.name}`)
    }
    if (!col.name) {
      errors.push(`Column missing name: ${col.id}`)
    }
    if (!col.type) {
      errors.push(`Column missing type: ${col.id}`)
    }
    if (columnIds.has(col.id)) {
      errors.push(`Duplicate column id: ${col.id}`)
    }
    columnIds.add(col.id)
  }

  // Validate views
  const viewIds = new Set<string>()
  for (const view of template.views) {
    if (!view.id) {
      errors.push(`View missing id: ${view.name}`)
    }
    if (!view.name) {
      errors.push(`View missing name: ${view.id}`)
    }
    if (!view.type) {
      errors.push(`View missing type: ${view.id}`)
    }
    if (viewIds.has(view.id)) {
      errors.push(`Duplicate view id: ${view.id}`)
    }
    viewIds.add(view.id)

    // Check visible columns reference valid columns
    for (const colId of view.visibleColumns) {
      if (!columnIds.has(colId)) {
        errors.push(`View ${view.id} references unknown column: ${colId}`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
