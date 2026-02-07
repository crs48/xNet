/**
 * CSV parser for database import.
 *
 * Parses CSV text into headers and rows, with support for:
 * - Quoted values with commas
 * - Escaped quotes (doubled quotes)
 * - Column type inference
 * - Value parsing by type
 */

import type { ColumnType } from '../column-types'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of parsing a CSV file.
 */
export interface ParsedCSV {
  /** Column headers from the first row */
  headers: string[]
  /** Data rows (each row is an array of string values) */
  rows: string[][]
}

/**
 * Options for CSV parsing.
 */
export interface CsvParseOptions {
  /** Delimiter character (default: comma) */
  delimiter?: string
  /** Whether the first row contains headers (default: true) */
  hasHeaders?: boolean
  /** Skip empty lines (default: true) */
  skipEmptyLines?: boolean
}

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse CSV text into headers and rows.
 *
 * @example
 * const csv = `name,age,active
 * Alice,30,true
 * Bob,25,false`
 *
 * const result = parseCSV(csv)
 * // { headers: ['name', 'age', 'active'], rows: [['Alice', '30', 'true'], ['Bob', '25', 'false']] }
 */
export function parseCSV(text: string, options: CsvParseOptions = {}): ParsedCSV {
  const { delimiter = ',', hasHeaders = true, skipEmptyLines = true } = options

  const lines = text.split(/\r?\n/)
  const filteredLines = skipEmptyLines ? lines.filter((line) => line.trim() !== '') : lines

  if (filteredLines.length === 0) {
    return { headers: [], rows: [] }
  }

  if (hasHeaders) {
    const headers = parseCSVLine(filteredLines[0], delimiter)
    const rows = filteredLines.slice(1).map((line) => parseCSVLine(line, delimiter))
    return { headers, rows }
  }

  // No headers - generate column names
  const firstRow = parseCSVLine(filteredLines[0], delimiter)
  const headers = firstRow.map((_, i) => `Column ${i + 1}`)
  const rows = filteredLines.map((line) => parseCSVLine(line, delimiter))

  return { headers, rows }
}

/**
 * Parse a single CSV line into an array of values.
 * Handles quoted values and escaped quotes.
 */
export function parseCSVLine(line: string, delimiter = ','): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    const nextChar = line[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        current += '"'
        i++ // Skip next quote
      } else if (char === '"') {
        // End of quoted value
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        // Start of quoted value
        inQuotes = true
      } else if (char === delimiter) {
        // End of field
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
  }

  // Push the last field
  result.push(current.trim())

  return result
}

// ─── Type Inference ───────────────────────────────────────────────────────────

/**
 * Guess the column type from sample values.
 *
 * @example
 * guessColumnType(['1', '2.5', '100']) // 'number'
 * guessColumnType(['true', 'false', 'yes']) // 'checkbox'
 * guessColumnType(['2024-01-01', '2024-06-15']) // 'date'
 */
export function guessColumnType(values: string[]): ColumnType {
  const nonEmpty = values.filter((v) => v.trim() !== '')

  if (nonEmpty.length === 0) return 'text'

  // Check for boolean
  const booleanValues = ['true', 'false', 'yes', 'no', '1', '0']
  if (nonEmpty.every((v) => booleanValues.includes(v.toLowerCase()))) {
    return 'checkbox'
  }

  // Check for number
  if (nonEmpty.every((v) => !isNaN(parseFloat(v)) && isFinite(Number(v)))) {
    return 'number'
  }

  // Check for date (ISO format or common date formats)
  if (nonEmpty.every((v) => isValidDate(v))) {
    return 'date'
  }

  // Check for email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (nonEmpty.every((v) => emailRegex.test(v))) {
    return 'email'
  }

  // Check for URL
  const urlRegex = /^https?:\/\//i
  if (nonEmpty.every((v) => urlRegex.test(v))) {
    return 'url'
  }

  // Check for phone (basic pattern)
  const phoneRegex = /^[+]?[\d\s\-().]{7,}$/
  if (nonEmpty.every((v) => phoneRegex.test(v))) {
    return 'phone'
  }

  return 'text'
}

/**
 * Check if a string is a valid date.
 */
function isValidDate(value: string): boolean {
  // Try ISO format first
  const date = new Date(value)
  if (!isNaN(date.getTime())) {
    // Make sure it's not just a number being parsed as a date
    if (!/^\d+$/.test(value)) {
      return true
    }
  }
  return false
}

// ─── Value Parsing ────────────────────────────────────────────────────────────

/**
 * Parse a string value to the appropriate type.
 *
 * @example
 * parseValue('42', 'number') // 42
 * parseValue('true', 'checkbox') // true
 * parseValue('2024-01-15', 'date') // '2024-01-15T00:00:00.000Z'
 */
export function parseValue(value: string, type: ColumnType): unknown {
  const trimmed = value.trim()

  if (trimmed === '') return null

  switch (type) {
    case 'number': {
      const num = parseFloat(trimmed)
      return isNaN(num) ? null : num
    }

    case 'checkbox':
      return ['true', 'yes', '1'].includes(trimmed.toLowerCase())

    case 'date':
    case 'dateRange': {
      const date = new Date(trimmed)
      return isNaN(date.getTime()) ? null : date.toISOString()
    }

    case 'multiSelect':
      // Split by comma and trim each value
      return trimmed
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)

    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    default:
      return trimmed
  }
}

/**
 * Parse all values in a row according to column types.
 */
export function parseRow(
  row: string[],
  headers: string[],
  columnTypes: Map<string, ColumnType>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]
    const value = row[i] ?? ''
    const type = columnTypes.get(header) ?? 'text'
    result[header] = parseValue(value, type)
  }

  return result
}

/**
 * Infer column types from all rows.
 */
export function inferColumnTypes(headers: string[], rows: string[][]): Map<string, ColumnType> {
  const columnTypes = new Map<string, ColumnType>()

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]
    const values = rows.map((row) => row[i] ?? '')
    columnTypes.set(header, guessColumnType(values))
  }

  return columnTypes
}
