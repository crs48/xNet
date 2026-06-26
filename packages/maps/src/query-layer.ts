/**
 * Live query-layer materialization (pure) — exploration 0230.
 *
 * A `query` layer binds a map layer to a database schema's rows by lat/lon.
 * On each viewport change we build a spatial-window request (reusing the
 * store's existing `NodeQuerySpatialWindow` shape), run it through a caller-
 * injected runner (store-backed in the app, a fake in tests), and map the
 * returned rows to GeoJSON point features. Keeping the logic here — and the
 * store access in the caller — makes the decision-heavy part testable without
 * a NodeStore or a WebGL context, mirroring how `style.ts` isolates the pure
 * render planning from `MapCanvas.tsx`.
 */

import type { GeoFeature, GeoFeatureCollection, MapLayerSource } from '@xnetjs/data'
import { geohashCellsForBounds } from './geohash'

/** The `query` member of the layer-source union. */
export type QuerySource = Extract<MapLayerSource, { kind: 'query' }>

/** A node as seen by the materializer: id + a flat property bag. */
export interface QueryLayerNode {
  id: string
  properties: Record<string, unknown>
}

/** Viewport bounds as `[west, south, east, north]` (degrees). */
export type QueryBounds = [west: number, south: number, east: number, north: number]

/** A spatial-window request the runner executes against the store. */
export interface QueryLayerRequest {
  schemaId: string
  where?: Record<string, unknown>
  /** A `NodeQuerySpatialWindow`-shaped filter over the lat/lon properties. */
  spatial: {
    kind: 'window'
    rect: { x: number; y: number; width: number; height: number }
    fields: { x: string; y: string }
  }
  /** Geohash cells covering the viewport — a planner hint for an indexed scan. */
  geohashCells: string[]
}

/** Runs a spatial window against a store and returns the matching rows. */
export type QueryLayerRunner = (req: QueryLayerRequest) => Promise<QueryLayerNode[]>

const DEFAULT_LAT_PROPERTY = 'lat'
const DEFAULT_LON_PROPERTY = 'lon'

/** The lat/lon property names a query source reads (with sensible defaults). */
export function querySourceFields(src: QuerySource): { lat: string; lon: string } {
  return {
    lat: src.latProperty ?? DEFAULT_LAT_PROPERTY,
    lon: src.lonProperty ?? DEFAULT_LON_PROPERTY
  }
}

/** Build the spatial-window request for a query source + viewport bounds. */
export function buildQueryRequest(src: QuerySource, bounds: QueryBounds): QueryLayerRequest {
  const [west, south, east, north] = bounds
  const { lat, lon } = querySourceFields(src)
  return {
    schemaId: src.schemaId,
    ...(src.where ? { where: src.where } : {}),
    spatial: {
      kind: 'window',
      rect: { x: west, y: south, width: east - west, height: north - south },
      fields: { x: lon, y: lat }
    },
    geohashCells: geohashCellsForBounds(bounds)
  }
}

function asNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** Map one node to a Point feature, or null when it lacks valid coordinates. */
export function featureFromNode(node: QueryLayerNode, src: QuerySource): GeoFeature | null {
  const { lat, lon } = querySourceFields(src)
  const y = asNumber(node.properties[lat])
  const x = asNumber(node.properties[lon])
  if (x === null || y === null) return null

  const properties: Record<string, unknown> = src.tooltip
    ? Object.fromEntries(
        src.tooltip
          .filter((k: string) => k in node.properties)
          .map((k: string) => [k, node.properties[k]])
      )
    : { ...node.properties }

  return {
    type: 'Feature',
    id: node.id,
    geometry: { type: 'Point', coordinates: [x, y] },
    properties
  }
}

/**
 * Materialize a `query` layer into a GeoJSON FeatureCollection for a viewport.
 *
 * Authorization is the runner's concern: it must query through the authz'd
 * store so features the viewer cannot see never reach this function.
 */
export async function materializeQueryLayer(
  src: QuerySource,
  bounds: QueryBounds,
  run: QueryLayerRunner
): Promise<GeoFeatureCollection> {
  const nodes = await run(buildQueryRequest(src, bounds))
  const features: GeoFeature[] = []
  for (const node of nodes) {
    const feature = featureFromNode(node, src)
    if (feature) features.push(feature)
  }
  return { type: 'FeatureCollection', features }
}
