/**
 * MapSchema - A composable, layered geospatial map surface (exploration 0187).
 *
 * Maps are a dedicated surface (like Dashboard/Canvas): a basemap plus an
 * ordered stack of data layers. Each layer carries its own source (inline
 * imported GeoJSON today; live database-query and dataset-artifact bindings
 * are reserved seams) and style. The whole layer list and viewport merge with
 * whole-value LWW (same semantics as Dashboard's `widgets`/`layouts`), so the
 * map renderer owns the structured shape and the schema system stores it as
 * opaque JSON.
 *
 * The persisted layer/viewport/geojson types defined here are the contract the
 * `@xnetjs/maps` renderer consumes — kept in @xnetjs/data so the schema can
 * type its json properties (mirroring DashboardWidgetInstance).
 */

import type { InferNode } from '../types'
import { defineSchema } from '../define'
import { json, relation, select, text } from '../properties'

// ─── Minimal structural GeoJSON (dependency-free) ────────────────────────────
// Just enough of the GeoJSON shape to persist imported features and feed them
// to MapLibre. The renderer casts these to precise `GeoJSON.*` types.

/** A `[longitude, latitude]` (optionally with altitude) position. */
export type GeoPosition = [number, number] | [number, number, number]

/** GeoJSON geometry object (coordinates kept loose — Point→Polygon nesting). */
export interface GeoGeometry {
  type:
    | 'Point'
    | 'MultiPoint'
    | 'LineString'
    | 'MultiLineString'
    | 'Polygon'
    | 'MultiPolygon'
    | 'GeometryCollection'
  coordinates?: unknown
  geometries?: GeoGeometry[]
}

/** A single GeoJSON Feature. */
export interface GeoFeature {
  type: 'Feature'
  geometry: GeoGeometry | null
  properties: Record<string, unknown> | null
  id?: string | number
}

/** A GeoJSON FeatureCollection — the unit imported datasets land in. */
export interface GeoFeatureCollection {
  type: 'FeatureCollection'
  features: GeoFeature[]
}

// ─── Persisted map document state ────────────────────────────────────────────

/** Built-in basemap identifiers (open, key-less). `blank` renders no tiles. */
export type MapBasemapId = 'protomaps-light' | 'protomaps-dark' | 'blank'

/** Camera position for the map. longitude/latitude in degrees. */
export interface MapViewport {
  longitude: number
  latitude: number
  zoom: number
  pitch?: number
  bearing?: number
}

/** How a layer's geometry is drawn. */
export type MapLayerGeometry = 'point' | 'line' | 'fill' | 'heatmap'

/** Per-layer visual style. `color` is a hex string. */
export interface MapLayerStyle {
  geometry: MapLayerGeometry
  /** Hex fill/stroke color, e.g. `#2f7ed8`. */
  color: string
  /** 0..1 opacity (default depends on geometry). */
  opacity?: number
  /** Point circle radius / line width in px. */
  size?: number
}

/**
 * Where a layer's features come from.
 * - `geojson`: inline imported FeatureCollection (the v1 path — fully local).
 * - `dataset`: reference to a GeoDataset artifact node (reserved — tiered bulk).
 * - `query`:   live binding to a database's rows by lat/lon (reserved).
 */
export type MapLayerSource =
  | { kind: 'geojson'; data: GeoFeatureCollection }
  | { kind: 'dataset'; datasetId: string }
  | {
      kind: 'query'
      schemaId: string
      geoProperty?: string
      latProperty?: string
      lonProperty?: string
    }

/** One layer on a map. */
export interface MapLayerSpec {
  /** Stable id (also the MapLibre source/layer id prefix). */
  id: string
  /** Display name shown in the layer panel. */
  name: string
  /** Feature source. */
  source: MapLayerSource
  /** Visual style. */
  style: MapLayerStyle
  /** Whether the layer is currently shown. */
  visible: boolean
  /** Feature property keys to show in the click popup (defaults to all). */
  popupProperties?: string[]
}

export const MapSchema = defineSchema({
  name: 'Map',
  namespace: 'xnet://xnet.fyi/',
  properties: {
    /** Map title */
    title: text({ required: true, maxLength: 500 }),

    /** Emoji or icon URL */
    icon: text({}),

    /** Basemap identifier (open/key-less). Defaults to protomaps-light. */
    basemap: text({ maxLength: 64 }),

    /** Camera position — whole-value LWW */
    viewport: json<MapViewport>({}),

    /** Ordered layer stack (bottom→top) — whole-list LWW */
    layers: json<MapLayerSpec[]>({}),

    /** Canonical home; empty = Unfiled (exploration 0169) */
    folder: relation({ target: 'xnet://xnet.fyi/Folder@1.0.0' as const }),

    /** Order among folder siblings — fractional index */
    sortKey: text({ maxLength: 500 }),

    /** Workspace-wide labels, referenced by id (exploration 0169) */
    tags: relation({ target: 'xnet://xnet.fyi/Tag@1.0.0' as const, multiple: true }),

    /** Canonical SECURITY home; empty = personal/private (exploration 0179) */
    space: relation({ target: 'xnet://xnet.fyi/Space@1.0.0' as const }),

    /** Per-node visibility; `inherit` defers to the Space (exploration 0179) */
    visibility: select({
      options: [
        { id: 'inherit', name: 'Inherit', color: 'gray' },
        { id: 'private', name: 'Private', color: 'gray' },
        { id: 'unlisted', name: 'Unlisted', color: 'yellow' },
        { id: 'public', name: 'Public', color: 'green' }
      ] as const,
      default: 'inherit'
    })
  }
})

/**
 * A Map node type (inferred from schema).
 */
export type Map = InferNode<(typeof MapSchema)['_properties']>
