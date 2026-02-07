/**
 * CSV exporter for database data.
 *
 * Exports database rows to CSV format with:
 * - Configurable column selection
 * - Proper escaping of special characters
 * - Type-aware value formatting
 */

import type { ColumnDefinition, SelectColumnConfig } from '../column-types'

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
 * Options for CSV export.
 */
export interface CsvExportOptions {
  /** Column IDs to include (default: all) */
  columns?: string[]
  /** Include header row (default: true) */
  includeHeaders?: boolean
  /** Delimiter character (default: comma) */
  delimiter?: string
  /** Line ending (default: CRLF for Windows compatibility) */
  lineEnding?: string
  /** Date format (default: ISO) */
  dateFormat?: 'iso' | 'locale' | 'short'
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

/**
 * Export database rows to CSV format.
 *
 * @example
 * const csv = exportToCsv(rows, columns)
 * // "Name,Age\r\nAlice,30\r\nBob,25"
 */
export function exportToCsv(
  rows: ExportRow[],
  columns: ColumnDefinition[],
  options: CsvExportOptions = {}
): string {
  const {
    columns: selectedColumns,
    includeHeaders = true,
    delimiter = ',',
    lineEnding = '\r\n',
    dateFormat = 'iso'
  } = options

  // Filter columns if specified
  const exportColumns = selectedColumns
    ? columns.filter((c) => selectedColumns.includes(c.id))
    : columns

  const lines: string[] = []

  // Header row
  if (includeHeaders) {
    const headerLine = exportColumns.map((c) => escapeCSV(c.name, delimiter)).join(delimiter)
    lines.push(headerLine)
  }

  // Data rows
  for (const row of rows) {
    const values = exportColumns.map((col) => {
      const value = row.cells[col.id]
      const formatted = formatValue(value, col, dateFormat)
      return escapeCSV(formatted, delimiter)
    })
    lines.push(values.join(delimiter))
  }

  return lines.join(lineEnding)
}

/**
 * Escape a value for CSV output.
 * Wraps in quotes if the value contains delimiter, quotes, or newlines.
 */
export function escapeCSV(value: string, delimiter = ','): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes('\n')) {
    // Escape quotes by doubling them
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Format a cell value for CSV output.
 */
export function formatValue(
  value: unknown,
  column: ColumnDefinition,
  dateFormat: 'iso' | 'locale' | 'short' = 'iso'
): string {
  if (value === null || value === undefined) return ''

  switch (column.type) {
    case 'date':
    case 'created':
    case 'updated':
      return formatDate(value as string, dateFormat)

    case 'dateRange': {
      const range = value as { start?: string; end?: string }
      const start = range.start ? formatDate(range.start, dateFormat) : ''
      const end = range.end ? formatDate(range.end, dateFormat) : ''
      return start && end ? `${start} - ${end}` : start || end
    }

    case 'checkbox':
      return value ? 'true' : 'false'

    case 'number':
      return String(value)

    case 'multiSelect':
    case 'relation':
      return Array.isArray(value) ? value.join(', ') : String(value)

    case 'select': {
      const config = column.config as SelectColumnConfig
      if (config?.options) {
        const option = config.options.find((o) => o.id === value)
        return option?.name ?? String(value)
      }
      return String(value)
    }

    case 'file': {
      if (Array.isArray(value)) {
        return value
          .map((f) => (typeof f === 'object' && f !== null ? f.name || f.url : f))
          .join(', ')
      }
      if (typeof value === 'object' && value !== null) {
        const file = value as { name?: string; url?: string }
        return file.name || file.url || ''
      }
      return String(value)
    }

    case 'person':
    case 'createdBy':
    case 'updatedBy':
      if (Array.isArray(value)) {
        return value.join(', ')
      }
      return String(value)

    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'richText':
    default:
      return String(value)
  }
}

/**
 * Format a date value.
 */
function formatDate(value: string, format: 'iso' | 'locale' | 'short'): string {
  try {
    const date = new Date(value)
    if (isNaN(date.getTime())) return value

    switch (format) {
      case 'iso':
        return date.toISOString().split('T')[0]
      case 'locale':
        return date.toLocaleDateString()
      case 'short':
        return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
      default:
        return date.toISOString().split('T')[0]
    }
  } catch {
    return String(value)
  }
}

/**
 * Create a downloadable CSV blob.
 */
export function createCsvBlob(csvContent: string): Blob {
  // Add BOM for Excel compatibility with UTF-8
  const bom = '\uFEFF'
  return new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' })
}

/**
 * Trigger a CSV file download in the browser.
 */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = createCsvBlob(csvContent)
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  URL.revokeObjectURL(url)
}
