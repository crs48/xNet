/**
 * JSON parser for database import.
 *
 * Parses JSON data into rows and inferred column definitions.
 * Supports:
 * - Array of objects: [{ name: 'Alice', age: 30 }, ...]
 * - Object with rows property: { rows: [...], columns?: [...] }
 */

import type { ColumnType, ColumnDefinition } from '../column-types'
import { nanoid } from 'nanoid'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of parsing a JSON file.
 */
export interface ParsedJSON {
  /** Data rows as objects */
  rows: Record<string, unknown>[]
  /** Inferred or provided column definitions */
  inferredColumns: InferredColumn[]
}

/**
 * Inferred column from JSON data.
 */
export interface InferredColumn {
  /** Column name (from object keys) */
  name: string
  /** Inferred column type */
  type: ColumnType
  /** Sample values for preview */
  sampleValues?: unknown[]
}

/**
 * Options for JSON parsing.
 */
export interface JsonParseOptions {
  /** Maximum rows to parse (for large files) */
  maxRows?: number
  /** Sample size for type inference */
  sampleSize?: number
}

// ─── JSON Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse JSON text into rows and inferred columns.
 *
 * @example
 * // Array of objects
 * parseJSON('[{"name": "Alice", "age": 30}]')
 *
 * // Object with rows
 * parseJSON('{"rows": [{"name": "Alice"}], "columns": [...]}')
 */
export function parseJSON(text: string, options: JsonParseOptions = {}): ParsedJSON {
  const { maxRows, sampleSize = 100 } = options

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Handle array of objects
  if (Array.isArray(data)) {
    const rows = maxRows ? data.slice(0, maxRows) : data
    return {
      rows: rows as Record<string, unknown>[],
      inferredColumns: inferColumnsFromRows(rows as Record<string, unknown>[], sampleSize)
    }
  }

  // Handle object with 'rows' property
  if (data && typeof data === 'object' && 'rows' in data) {
    const obj = data as { rows: unknown[]; columns?: ColumnDefinition[] }

    if (!Array.isArray(obj.rows)) {
      throw new Error('Invalid JSON format: "rows" must be an array')
    }

    const rows = maxRows ? obj.rows.slice(0, maxRows) : obj.rows

    // Use provided columns or infer from data
    if (obj.columns && Array.isArray(obj.columns)) {
      return {
        rows: rows as Record<string, unknown>[],
        inferredColumns: obj.columns.map((col) => ({
          name: col.name,
          type: col.type
        }))
      }
    }

    return {
      rows: rows as Record<string, unknown>[],
      inferredColumns: inferColumnsFromRows(rows as Record<string, unknown>[], sampleSize)
    }
  }

  throw new Error('Invalid JSON format. Expected array of objects or { rows: [...] }')
}

/**
 * Infer column definitions from rows.
 */
export function inferColumnsFromRows(
  rows: Record<string, unknown>[],
  sampleSize = 100
): InferredColumn[] {
  const columnMap = new Map<string, { values: unknown[] }>()

  // Collect values for each column
  const sampleRows = rows.slice(0, sampleSize)
  for (const row of sampleRows) {
    for (const [key, value] of Object.entries(row)) {
      if (!columnMap.has(key)) {
        columnMap.set(key, { values: [] })
      }
      columnMap.get(key)!.values.push(value)
    }
  }

  // Infer types and create column definitions
  return Array.from(columnMap.entries()).map(([name, { values }]) => ({
    name,
    type: inferTypeFromValues(values),
    sampleValues: values.slice(0, 5)
  }))
}

/**
 * Infer column type from JavaScript values.
 */
export function inferTypeFromValues(values: unknown[]): ColumnType {
  const nonNull = values.filter((v) => v !== null && v !== undefined)

  if (nonNull.length === 0) return 'text'

  // Check for boolean
  if (nonNull.every((v) => typeof v === 'boolean')) {
    return 'checkbox'
  }

  // Check for number
  if (nonNull.every((v) => typeof v === 'number')) {
    return 'number'
  }

  // Check for array (multiSelect)
  if (nonNull.every((v) => Array.isArray(v))) {
    return 'multiSelect'
  }

  // Check for date strings
  if (
    nonNull.every(
      (v) => typeof v === 'string' && !isNaN(Date.parse(v)) && isLikelyDateString(v as string)
    )
  ) {
    return 'date'
  }

  // Check for email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (nonNull.every((v) => typeof v === 'string' && emailRegex.test(v))) {
    return 'email'
  }

  // Check for URL
  const urlRegex = /^https?:\/\//i
  if (nonNull.every((v) => typeof v === 'string' && urlRegex.test(v))) {
    return 'url'
  }

  return 'text'
}

/**
 * Check if a string looks like a date (not just any parseable string).
 */
function isLikelyDateString(value: string): boolean {
  // ISO date format
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return true
  // Common date formats
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(value)) return true
  // Month name formats
  if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(value)) return true
  return false
}

/**
 * Convert parsed JSON to column definitions with IDs.
 */
export function toColumnDefinitions(inferredColumns: InferredColumn[]): ColumnDefinition[] {
  return inferredColumns.map((col) => ({
    id: nanoid(),
    name: col.name,
    type: col.type,
    config: {}
  }))
}

/**
 * Validate JSON data structure.
 */
export function validateJsonData(data: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (data === null || data === undefined) {
    errors.push('Data is null or undefined')
    return { valid: false, errors }
  }

  if (Array.isArray(data)) {
    // Validate array of objects
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      if (typeof data[i] !== 'object' || data[i] === null) {
        errors.push(`Row ${i} is not an object`)
      }
    }
  } else if (typeof data === 'object') {
    // Validate object with rows
    const obj = data as Record<string, unknown>
    if (!('rows' in obj)) {
      errors.push('Object must have a "rows" property')
    } else if (!Array.isArray(obj.rows)) {
      errors.push('"rows" must be an array')
    }
  } else {
    errors.push('Data must be an array or object with "rows" property')
  }

  return { valid: errors.length === 0, errors }
}
