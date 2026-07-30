/**
 * Geographic point property helper (exploration 0339, Map sub-decision B).
 *
 * A single first-class location value — `{ lat, lng }` in WGS84 decimal
 * degrees — instead of the paired-number-columns convention. One field,
 * one picker; the database Map view binds to it directly and
 * right-click-to-create writes one cell.
 */

import type { PropertyBuilder } from '../types'

/** A geographic point in WGS84 decimal degrees. */
export interface GeoPoint {
  /** Latitude in decimal degrees, -90..90 */
  lat: number
  /** Longitude in decimal degrees, -180..180 */
  lng: number
}

export interface GeoOptions {
  required?: boolean
}

/** Narrow an unknown value to a structurally-valid GeoPoint. */
export function isGeoPoint(value: unknown): value is GeoPoint {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.lat === 'number' &&
    Number.isFinite(v.lat) &&
    Math.abs(v.lat) <= 90 &&
    typeof v.lng === 'number' &&
    Number.isFinite(v.lng) &&
    Math.abs(v.lng) <= 180
  )
}

/**
 * Define a geographic point property.
 *
 * @example
 * ```typescript
 * const schema = defineSchema({
 *   properties: {
 *     location: geo(),
 *     hq: geo({ required: true })
 *   }
 * })
 * ```
 */
export function geo(options: GeoOptions = {}): PropertyBuilder<GeoPoint> {
  return {
    definition: {
      type: 'geo',
      required: options.required ?? false
    },

    validate(value: unknown): value is GeoPoint {
      if (value === null || value === undefined) {
        return !options.required
      }
      return isGeoPoint(value)
    },

    coerce(value: unknown): GeoPoint | null {
      if (value === null || value === undefined) return null

      if (isGeoPoint(value)) {
        return { lat: value.lat, lng: value.lng }
      }

      // Common alternate spellings ({ latitude, longitude }, { lat, lon })
      if (typeof value === 'object') {
        const obj = value as Record<string, unknown>
        const candidate = {
          lat: obj.lat ?? obj.latitude,
          lng: obj.lng ?? obj.lon ?? obj.longitude
        }
        if (isGeoPoint(candidate)) return candidate as GeoPoint
      }

      // "lat, lng" text (clipboard, CSV)
      if (typeof value === 'string') {
        const parts = value.split(',').map((s) => Number(s.trim()))
        if (parts.length === 2) {
          const candidate = { lat: parts[0], lng: parts[1] }
          if (isGeoPoint(candidate)) return candidate
        }
      }

      return null
    },

    _type: {} as GeoPoint
  }
}
