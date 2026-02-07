/**
 * JSON exporter for database data.
 *
 * Exports database rows to JSON format with:
 * - Optional schema/column definitions
 * - Configurable column selection
 * - Pretty printing option
 */

import type { ColumnDefinition } from '../column-types'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A database row for export.
 */
export interface ExportRow {
  id: string
  sortKey: string
  cells: Record<string, unknown>
}

/**
 * Options for JSON export.
 */
export interface JsonExportOptions {
  /** Column IDs to include (default: all) */
  columns?: string[]
  /** Include column definitions in output (default: true) */
  includeSchema?: boolean
  /** Pretty print with indentation (default: true) */
  pretty?: boolean
  /** Include row IDs (default: false) */
  includeIds?: boolean
  /** Use column names as keys instead of IDs (default: true) */
  useColumnNames?: boolean
}

/**
 * Exported JSON structure.
 */
export interface ExportedJSON {
  /** Column definitions (if includeSchema is true) */
  columns?: ExportedColumn[]
  /** Data rows */
  rows: Record<string, unknown>[]
  /** Export metadata */
  metadata?: {
    exportedAt: string
    rowCount: number
    columnCount: number
  }
}

/**
 * Exported column definition.
 */
export interface ExportedColumn {
  name: string
  type: string
  config?: Record<string, unknown>
}

// ─── JSON Export ──────────────────────────────────────────────────────────────

/**
 * Export database rows to JSON format.
 *
 * @example
 * const json = exportToJson(rows, columns)
 * // { "columns": [...], "rows": [...] }
 */
export function exportToJson(
  rows: ExportRow[],
  columns: ColumnDefinition[],
  options: JsonExportOptions = {}
): string {
  const {
    columns: selectedColumns,
    includeSchema = true,
    pretty = true,
    includeIds = false,
    useColumnNames = true
  } = options

  // Filter columns if specified
  const exportColumns = selectedColumns
    ? columns.filter((c) => selectedColumns.includes(c.id))
    : columns

  // Create column ID to name mapping
  const columnNameMap = new Map<string, string>()
  for (const col of exportColumns) {
    columnNameMap.set(col.id, col.name)
  }

  // Transform rows
  const exportRows = rows.map((row) => {
    const obj: Record<string, unknown> = {}

    if (includeIds) {
      obj._id = row.id
    }

    for (const col of exportColumns) {
      const key = useColumnNames ? col.name : col.id
      obj[key] = row.cells[col.id] ?? null
    }

    return obj
  })

  // Build result object
  const result: ExportedJSON = {
    rows: exportRows
  }

  if (includeSchema) {
    result.columns = exportColumns.map((col) => ({
      name: col.name,
      type: col.type,
      config:
        Object.keys(col.config).length > 0 ? (col.config as Record<string, unknown>) : undefined
    }))

    result.metadata = {
      exportedAt: new Date().toISOString(),
      rowCount: rows.length,
      columnCount: exportColumns.length
    }
  }

  return JSON.stringify(result, null, pretty ? 2 : undefined)
}

/**
 * Export rows as a simple array of objects (no schema).
 */
export function exportToJsonArray(
  rows: ExportRow[],
  columns: ColumnDefinition[],
  options: Omit<JsonExportOptions, 'includeSchema'> = {}
): string {
  const { columns: selectedColumns, pretty = true, useColumnNames = true } = options

  // Filter columns if specified
  const exportColumns = selectedColumns
    ? columns.filter((c) => selectedColumns.includes(c.id))
    : columns

  // Transform rows
  const exportRows = rows.map((row) => {
    const obj: Record<string, unknown> = {}

    for (const col of exportColumns) {
      const key = useColumnNames ? col.name : col.id
      obj[key] = row.cells[col.id] ?? null
    }

    return obj
  })

  return JSON.stringify(exportRows, null, pretty ? 2 : undefined)
}

/**
 * Create a downloadable JSON blob.
 */
export function createJsonBlob(jsonContent: string): Blob {
  return new Blob([jsonContent], { type: 'application/json;charset=utf-8' })
}

/**
 * Trigger a JSON file download in the browser.
 */
export function downloadJson(jsonContent: string, filename: string): void {
  const blob = createJsonBlob(jsonContent)
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.json') ? filename : `${filename}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  URL.revokeObjectURL(url)
}

/**
 * Export to NDJSON (Newline Delimited JSON) format.
 * Useful for streaming large datasets.
 */
export function exportToNdjson(
  rows: ExportRow[],
  columns: ColumnDefinition[],
  options: Omit<JsonExportOptions, 'pretty' | 'includeSchema'> = {}
): string {
  const { columns: selectedColumns, useColumnNames = true } = options

  // Filter columns if specified
  const exportColumns = selectedColumns
    ? columns.filter((c) => selectedColumns.includes(c.id))
    : columns

  // Transform and stringify each row
  const lines = rows.map((row) => {
    const obj: Record<string, unknown> = {}

    for (const col of exportColumns) {
      const key = useColumnNames ? col.name : col.id
      obj[key] = row.cells[col.id] ?? null
    }

    return JSON.stringify(obj)
  })

  return lines.join('\n')
}
