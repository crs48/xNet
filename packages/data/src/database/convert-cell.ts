/**
 * Cell value conversion for field type changes (exploration 0159,
 * spreadsheet-UX follow-up).
 *
 * When a field is retyped, existing cell values convert rather than
 * orphan: numeric strings become numbers, comma-separated text becomes
 * multi-select names, option IDs stringify back to their names, etc.
 *
 * Pure: select/multiSelect targets return the *names* to resolve —
 * the caller creates/looks up SelectOption nodes and maps names to IDs.
 */

import type { CellValue, FileRef } from './cell-types'
import type { FieldType } from './field-types'
import { isDateRange, isFileRef, isGeoPoint } from './cell-types'

export interface ConvertContext {
  /** Resolve an option ID to its display name (source select fields) */
  optionName?: (id: string) => string | undefined
}

export interface ConvertedCell {
  /** The converted value (null clears the cell) */
  value: CellValue
  /**
   * For select/multiSelect targets: display names that need resolving to
   * option IDs (create-if-missing). The caller replaces `value` with the
   * resolved ID(s).
   */
  optionNames?: string[]
}

const TRUTHY = new Set(['true', 'yes', 'y', '1', 'checked', 'x', '✓'])

/** Render any cell value as plain text (the universal intermediate). */
export function cellValueToText(
  value: CellValue,
  sourceType: FieldType,
  ctx: ConvertContext = {}
): string {
  if (value === null || value === undefined) return ''
  switch (sourceType) {
    case 'checkbox':
      return value === true ? 'true' : 'false'
    case 'select':
      return ctx.optionName?.(String(value)) ?? String(value)
    case 'multiSelect': {
      const ids = Array.isArray(value) ? value : [String(value)]
      return ids.map((id) => ctx.optionName?.(id) ?? id).join(', ')
    }
    case 'dateRange':
      return isDateRange(value) ? `${value.start} → ${value.end}` : String(value)
    case 'geo':
      return isGeoPoint(value) ? `${value.lat}, ${value.lng}` : ''
    case 'file':
      return isFileRef(value as FileRef) ? (value as FileRef).name : ''
    default:
      return Array.isArray(value) ? value.join(', ') : String(value)
  }
}

/**
 * Convert a cell value from one field type to another.
 * Unconvertible values become null (never garbage).
 */
export function convertCellValue(
  value: CellValue,
  sourceType: FieldType,
  targetType: FieldType,
  ctx: ConvertContext = {}
): ConvertedCell {
  if (value === null || value === undefined) return { value: null }
  if (sourceType === targetType) return { value }

  const text = cellValueToText(value, sourceType, ctx).trim()
  if (text === '') return { value: null }

  switch (targetType) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
      return { value: text }

    case 'number': {
      if (typeof value === 'number') return { value }
      if (typeof value === 'boolean') return { value: value ? 1 : 0 }
      const cleaned = text.replace(/[$€£¥,%\s]/g, '')
      const num = Number(cleaned)
      if (!Number.isFinite(num)) return { value: null }
      return { value: text.endsWith('%') ? num / 100 : num }
    }

    case 'checkbox': {
      if (typeof value === 'boolean') return { value }
      if (typeof value === 'number') return { value: value !== 0 }
      return { value: TRUTHY.has(text.toLowerCase()) }
    }

    case 'date': {
      if (typeof value === 'number') {
        // Treat large numbers as epoch ms
        const fromEpoch = new Date(value)
        return Number.isNaN(fromEpoch.getTime())
          ? { value: null }
          : { value: fromEpoch.toISOString() }
      }
      const parsed = new Date(text)
      return Number.isNaN(parsed.getTime()) ? { value: null } : { value: parsed.toISOString() }
    }

    case 'select': {
      // First comma-separated entry becomes the single option
      const name = text.split(/[,;]/)[0]?.trim()
      return name ? { value: null, optionNames: [name] } : { value: null }
    }

    case 'multiSelect': {
      // Comma/semicolon-separated values become the tags
      const names = [
        ...new Set(
          text
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
        )
      ]
      return names.length > 0 ? { value: null, optionNames: names } : { value: null }
    }

    case 'dateRange': {
      const parts = text.split(/\s*(?:→|->|–|to)\s*/i)
      if (parts.length === 2) {
        const start = new Date(parts[0])
        const end = new Date(parts[1])
        if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
          return { value: { start: start.toISOString(), end: end.toISOString() } }
        }
      }
      const single = new Date(text)
      if (!Number.isNaN(single.getTime())) {
        const iso = single.toISOString()
        return { value: { start: iso, end: iso } }
      }
      return { value: null }
    }

    case 'geo': {
      // "lat, lng" text (the geo cell's own text rendering) round-trips
      const parts = text.split(',').map((s) => Number(s.trim()))
      if (parts.length === 2) {
        const point = { lat: parts[0], lng: parts[1] }
        if (isGeoPoint(point)) return { value: point }
      }
      return { value: null }
    }

    // Identity-style targets where text can't be trusted
    case 'person':
      return /^did:[a-z]+:/.test(text) ? { value: text } : { value: null }

    // Non-convertible targets
    case 'relation':
    case 'file':
    case 'richText':
    case 'rollup':
    case 'formula':
    case 'created':
    case 'createdBy':
    case 'updated':
    case 'updatedBy':
      return { value: null }

    default:
      return { value: text }
  }
}
