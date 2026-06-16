/**
 * GeoJSON & CSV ingestion (pure, dependency-free at runtime).
 *
 * Type imports from @xnetjs/data are erased at compile time, so this module
 * has no runtime dependency on the data layer — it stays a fast, isolated unit.
 */

import type { GeoFeature, GeoFeatureCollection, GeoGeometry, MapLayerGeometry } from '@xnetjs/data'

/** Longitude/latitude bounds as `[west, south, east, north]`. */
export type GeoBounds = [number, number, number, number]

const GEOMETRY_TYPES = new Set([
  'Point',
  'MultiPoint',
  'LineString',
  'MultiLineString',
  'Polygon',
  'MultiPolygon',
  'GeometryCollection'
])

function isGeometry(value: unknown): value is GeoGeometry {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string' &&
    GEOMETRY_TYPES.has((value as { type: string }).type)
  )
}

function asFeature(value: unknown): GeoFeature | null {
  if (typeof value !== 'object' || value === null) return null
  const obj = value as Record<string, unknown>
  if (obj.type === 'Feature') {
    const geometry = obj.geometry
    return {
      type: 'Feature',
      geometry: isGeometry(geometry) ? geometry : null,
      properties:
        typeof obj.properties === 'object' && obj.properties !== null
          ? (obj.properties as Record<string, unknown>)
          : {},
      ...(obj.id === undefined ? {} : { id: obj.id as string | number })
    }
  }
  // A bare geometry → wrap as a feature with empty properties.
  if (isGeometry(obj)) {
    return { type: 'Feature', geometry: obj, properties: {} }
  }
  return null
}

/**
 * Parse a GeoJSON string into a normalized FeatureCollection.
 *
 * Accepts a FeatureCollection, a single Feature, a bare Geometry, or an array
 * of any of those. Throws on syntactically invalid JSON or when no features
 * can be recovered.
 */
export function parseGeoJson(text: string): GeoFeatureCollection {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`)
  }
  return normalizeToFeatureCollection(parsed)
}

/** Normalize an already-parsed GeoJSON value into a FeatureCollection. */
export function normalizeToFeatureCollection(parsed: unknown): GeoFeatureCollection {
  const features: GeoFeature[] = []

  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(collect)
      return
    }
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>
      if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
        obj.features.forEach(collect)
        return
      }
      const feature = asFeature(obj)
      if (feature) features.push(feature)
    }
  }
  collect(parsed)

  if (features.length === 0) {
    throw new Error('No GeoJSON features found')
  }
  return { type: 'FeatureCollection', features }
}

// ─── CSV → point features ────────────────────────────────────────────────────

/** Candidate column names for latitude / longitude, lowercased. */
const LAT_KEYS = ['latitude', 'lat', 'y']
const LON_KEYS = ['longitude', 'longitud', 'long', 'lng', 'lon', 'x']

/**
 * A minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes,
 * and CRLF/LF line endings. Kept local so this module has no runtime deps.
 */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushField()
    } else if (ch === '\n') {
      pushRow()
    } else if (ch === '\r') {
      // swallow; the following \n (if any) triggers the row push
      if (text[i + 1] !== '\n') pushRow()
    } else {
      field += ch
    }
  }
  // trailing field/row (file not ending in newline)
  if (field.length > 0 || row.length > 0) pushRow()

  const nonEmpty = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
  const headers = nonEmpty.shift() ?? []
  return { headers: headers.map((h) => h.trim()), rows: nonEmpty }
}

/** Find the index of the first header matching one of `candidates`. */
function findColumn(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase())
  for (const candidate of candidates) {
    const idx = lower.indexOf(candidate)
    if (idx !== -1) return idx
  }
  return -1
}

export interface CsvParseResult {
  collection: GeoFeatureCollection
  latField: string
  lonField: string
  skipped: number
}

/**
 * Parse a CSV string of points into a FeatureCollection.
 *
 * Latitude/longitude columns are auto-detected by name (`lat`/`latitude`/`y`,
 * `lon`/`lng`/`longitude`/`x`) unless `latField`/`lonField` are given. Every
 * other column becomes a feature property. Rows with unparseable coordinates
 * are skipped and counted.
 */
export function parseCsvToFeatures(
  text: string,
  opts: { latField?: string; lonField?: string } = {}
): CsvParseResult {
  const { headers, rows } = parseCsv(text)
  if (headers.length === 0) throw new Error('CSV has no header row')

  const latIdx = opts.latField ? headers.indexOf(opts.latField) : findColumn(headers, LAT_KEYS)
  const lonIdx = opts.lonField ? headers.indexOf(opts.lonField) : findColumn(headers, LON_KEYS)

  if (latIdx === -1 || lonIdx === -1) {
    throw new Error('Could not find latitude/longitude columns in CSV')
  }

  const features: GeoFeature[] = []
  let skipped = 0
  for (const cells of rows) {
    const lat = Number(cells[latIdx])
    const lon = Number(cells[lonIdx])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      skipped++
      continue
    }
    const properties: Record<string, unknown> = {}
    headers.forEach((header, i) => {
      if (i === latIdx || i === lonIdx) return
      properties[header] = cells[i] ?? ''
    })
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties
    })
  }

  if (features.length === 0) throw new Error('No rows with valid coordinates')

  return {
    collection: { type: 'FeatureCollection', features },
    latField: headers[latIdx],
    lonField: headers[lonIdx],
    skipped
  }
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

/** Walk every `[lng, lat]` position inside a geometry's coordinate nesting. */
function eachPosition(coords: unknown, fn: (lng: number, lat: number) => void): void {
  if (!Array.isArray(coords)) return
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    fn(coords[0], coords[1])
    return
  }
  for (const c of coords) eachPosition(c, fn)
}

/** Compute `[west, south, east, north]` bounds, or null if empty. */
export function featureCollectionBounds(fc: GeoFeatureCollection): GeoBounds | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity
  for (const feature of fc.features) {
    const geom = feature.geometry
    if (!geom) continue
    if (geom.type === 'GeometryCollection') {
      for (const g of geom.geometries ?? []) {
        eachPosition(g.coordinates, (lng, lat) => {
          west = Math.min(west, lng)
          south = Math.min(south, lat)
          east = Math.max(east, lng)
          north = Math.max(north, lat)
        })
      }
    } else {
      eachPosition(geom.coordinates, (lng, lat) => {
        west = Math.min(west, lng)
        south = Math.min(south, lat)
        east = Math.max(east, lng)
        north = Math.max(north, lat)
      })
    }
  }
  if (!Number.isFinite(west)) return null
  return [west, south, east, north]
}

/** Infer the dominant drawing geometry for a collection. */
export function inferLayerGeometry(fc: GeoFeatureCollection): MapLayerGeometry {
  for (const feature of fc.features) {
    const t = feature.geometry?.type
    if (t === 'Polygon' || t === 'MultiPolygon') return 'fill'
    if (t === 'LineString' || t === 'MultiLineString') return 'line'
    if (t === 'Point' || t === 'MultiPoint') return 'point'
  }
  return 'point'
}

/** Distinct property keys across a collection (for popup field selection). */
export function featurePropertyKeys(fc: GeoFeatureCollection): string[] {
  const keys = new Set<string>()
  for (const feature of fc.features) {
    for (const key of Object.keys(feature.properties ?? {})) keys.add(key)
  }
  return [...keys]
}
