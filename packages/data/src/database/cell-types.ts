/**
 * Cell value types for database rows.
 *
 * Cell values are stored as dynamic properties on DatabaseRow nodes,
 * keyed by column ID with a `cell_` prefix to avoid collisions with
 * schema-defined properties.
 */

// ─── Cell Value Types ────────────────────────────────────────────────────────

/**
 * Reference to a file stored in the system.
 */
export interface FileRef {
  /** Unique file identifier */
  id: string
  /** Original file name */
  name: string
  /** File size in bytes */
  size: number
  /** MIME type */
  type: string
  /** URL to access the file */
  url: string
}

/**
 * A date range with start and end dates.
 */
export interface DateRange {
  /** Start date (ISO 8601 string) */
  start: string
  /** End date (ISO 8601 string) */
  end: string
}

/**
 * All possible cell value types.
 *
 * - string: text, url, email, phone, select (option ID), person (DID)
 * - number: number
 * - boolean: checkbox
 * - string (ISO 8601): date
 * - DateRange: dateRange
 * - string[]: multiSelect (option IDs), relation (row IDs)
 * - FileRef: file
 * - null: empty cell
 */
export type CellValue = string | number | boolean | DateRange | string[] | FileRef | null

// ─── Cell Key Utilities ──────────────────────────────────────────────────────

/**
 * Prefix for cell value property keys.
 * This prevents collisions with schema-defined properties like 'database' and 'sortKey'.
 */
export const CELL_PREFIX = 'cell_'

/**
 * Convert a column ID to a cell property key.
 *
 * @example
 * cellKey('name') // 'cell_name'
 * cellKey('status') // 'cell_status'
 */
export function cellKey(columnId: string): string {
  return CELL_PREFIX + columnId
}

/**
 * Check if a property key is a cell value key.
 *
 * @example
 * isCellKey('cell_name') // true
 * isCellKey('database') // false
 */
export function isCellKey(key: string): boolean {
  return key.startsWith(CELL_PREFIX)
}

/**
 * Extract the column ID from a cell property key.
 *
 * @example
 * columnIdFromKey('cell_name') // 'name'
 * columnIdFromKey('cell_status') // 'status'
 */
export function columnIdFromKey(key: string): string {
  if (!isCellKey(key)) {
    throw new Error(`Not a cell key: ${key}`)
  }
  return key.slice(CELL_PREFIX.length)
}

/**
 * Convert a record of column ID -> value to cell key -> value.
 *
 * @example
 * toCellProperties({ name: 'John', age: 30 })
 * // { cell_name: 'John', cell_age: 30 }
 */
export function toCellProperties(cells: Record<string, CellValue>): Record<string, CellValue> {
  const result: Record<string, CellValue> = {}
  for (const [columnId, value] of Object.entries(cells)) {
    result[cellKey(columnId)] = value
  }
  return result
}

/**
 * Extract cell values from a node's properties, converting cell keys back to column IDs.
 *
 * @example
 * fromCellProperties({ cell_name: 'John', cell_age: 30, database: 'db1' })
 * // { name: 'John', age: 30 }
 */
export function fromCellProperties(properties: Record<string, unknown>): Record<string, CellValue> {
  const result: Record<string, CellValue> = {}
  for (const [key, value] of Object.entries(properties)) {
    if (isCellKey(key)) {
      result[columnIdFromKey(key)] = value as CellValue
    }
  }
  return result
}

// ─── Type Guards ─────────────────────────────────────────────────────────────

/**
 * Check if a value is a valid DateRange.
 */
export function isDateRange(value: unknown): value is DateRange {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return typeof obj.start === 'string' && typeof obj.end === 'string'
}

/**
 * Check if a value is a valid FileRef.
 */
export function isFileRef(value: unknown): value is FileRef {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.size === 'number' &&
    typeof obj.type === 'string' &&
    typeof obj.url === 'string'
  )
}

/**
 * Check if a value is a valid CellValue.
 */
export function isCellValue(value: unknown): value is CellValue {
  if (value === null) return true
  if (typeof value === 'string') return true
  if (typeof value === 'number') return true
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) {
    return value.every((v) => typeof v === 'string')
  }
  if (isDateRange(value)) return true
  if (isFileRef(value)) return true
  return false
}
