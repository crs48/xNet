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
 * Same shape as the blob-layer FileRef (schema/properties/file.ts):
 * content-addressed, resolved to URLs through the BlobService.
 */
export interface FileRef {
  /** Content-addressed ID (CID) of the file */
  cid: string
  /** Original file name */
  name: string
  /** MIME type */
  mimeType: string
  /** File size in bytes */
  size: number
  /**
   * Optional preview metadata (exploration 0385 W4). All additive: refs
   * written before this existed stay valid.
   */
  /** Intrinsic width in pixels, for images and video */
  width?: number
  /** Intrinsic height in pixels, for images and video */
  height?: number
  /**
   * CID of a small preview image stored as its own blob. Uploaded ahead of
   * the full file so a remote cell can render before the bytes arrive.
   */
  thumbCid?: string
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
 * A geographic point in WGS84 decimal degrees.
 * Same shape as the schema-layer GeoPoint (schema/properties/geo.ts).
 */
export interface GeoPoint {
  /** Latitude in decimal degrees, -90..90 */
  lat: number
  /** Longitude in decimal degrees, -180..180 */
  lng: number
}

/**
 * All possible cell value types.
 *
 * - string: text, url, email, phone, select (option ID), person (DID)
 * - number: number
 * - boolean: checkbox
 * - string (ISO 8601): date
 * - DateRange: dateRange
 * - GeoPoint: geo
 * - string[]: multiSelect (option IDs), relation (row IDs)
 * - FileRef: file
 * - null: empty cell
 */
export type CellValue = string | number | boolean | DateRange | GeoPoint | string[] | FileRef | null

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
 * Check if a value is a valid GeoPoint.
 */
export function isGeoPoint(value: unknown): value is GeoPoint {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.lat === 'number' &&
    Number.isFinite(obj.lat) &&
    Math.abs(obj.lat) <= 90 &&
    typeof obj.lng === 'number' &&
    Number.isFinite(obj.lng) &&
    Math.abs(obj.lng) <= 180
  )
}

/**
 * Check if a value is a valid FileRef.
 */
export function isFileRef(value: unknown): value is FileRef {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  return (
    typeof obj.cid === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.mimeType === 'string' &&
    typeof obj.size === 'number'
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
  if (isGeoPoint(value)) return true
  if (isFileRef(value)) return true
  return false
}
