/**
 * Map model — pure helpers for the database Map view (exploration 0337).
 *
 * Rows bind through two number fields (lat/lng). Rows without a finite
 * coordinate pair are skipped (and counted, for the honesty footer).
 * Pin cap guards render cost NocoDB-style; clustering handles density.
 */

import type { MapViewport } from '@xnetjs/data'
import type { GridField } from '../grid/model.js'
import { rowTitle, type DatabaseViewRow } from './contract.js'

/** Hard cap on rendered pins (the fetch window is the real bound). */
export const MAX_MAP_PINS = 1000

export interface MapPointsResult {
  geojson: GeoJSON.FeatureCollection
  plotted: number
  skipped: number
}

function coordinate(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/** Rows → GeoJSON points, `rowId`/`title` in properties for click + popup. */
export function rowsToGeoJSON(
  rows: DatabaseViewRow[],
  fields: GridField[],
  latField: GridField,
  lngField: GridField
): MapPointsResult {
  const features: GeoJSON.Feature[] = []
  let skipped = 0
  for (const row of rows) {
    if (features.length >= MAX_MAP_PINS) {
      skipped += 1
      continue
    }
    const lat = coordinate(row.cells[latField.id])
    const lng = coordinate(row.cells[lngField.id])
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      skipped += 1
      continue
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: { rowId: row.id, title: rowTitle(row, fields) }
    })
  }
  return {
    geojson: { type: 'FeatureCollection', features },
    plotted: features.length,
    skipped
  }
}

/** Default camera: fit the plotted points, else a world view. */
export function defaultViewportFor(geojson: GeoJSON.FeatureCollection): MapViewport {
  const coords = geojson.features
    .map((f) => (f.geometry.type === 'Point' ? f.geometry.coordinates : null))
    .filter((c): c is number[] => Array.isArray(c))
  if (coords.length === 0) return { longitude: 0, latitude: 20, zoom: 1.5 }
  let minLng = coords[0][0]
  let maxLng = coords[0][0]
  let minLat = coords[0][1]
  let maxLat = coords[0][1]
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  const spread = Math.max(maxLng - minLng, (maxLat - minLat) * 2, 0.05)
  // Rough log2 fit: 360° spread ≈ zoom 1, halving spread adds a level
  const zoom = Math.max(1, Math.min(14, Math.log2(360 / spread)))
  return {
    longitude: (minLng + maxLng) / 2,
    latitude: (minLat + maxLat) / 2,
    zoom
  }
}
