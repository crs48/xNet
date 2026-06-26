/**
 * MapLibre style construction (pure).
 *
 * Builds plain style/source/layer JSON objects from our persisted map state so
 * the rendering logic is fully unit-testable without a WebGL context. The
 * objects are deliberately typed with a minimal local `MapStyle` shape rather
 * than importing maplibre-gl's types, keeping this module dependency-free.
 */

import type {
  GeoFeatureCollection,
  MapBasemapId,
  MapLayerSource,
  MapLayerSpec,
  MapViewport
} from '@xnetjs/data'

/** A minimal MapLibre style-layer shape (structurally compatible). */
export interface MapStyleLayer {
  id: string
  type: 'background' | 'fill' | 'line' | 'circle' | 'heatmap' | 'symbol' | 'raster'
  source?: string
  'source-layer'?: string
  filter?: unknown
  layout?: Record<string, unknown>
  paint?: Record<string, unknown>
}

/** A minimal MapLibre style document. */
export interface MapStyle {
  version: 8
  glyphs?: string
  sources: Record<string, unknown>
  layers: MapStyleLayer[]
}

/** The Protomaps public demo basemap (open data, no API key). */
export const PROTOMAPS_DEMO_PMTILES = 'https://demo-bucket.protomaps.com/v4.pmtiles'

/** A sensible whole-world starting viewport. */
export const DEFAULT_VIEWPORT: MapViewport = {
  longitude: 0,
  latitude: 20,
  zoom: 1.4
}

/** Distinct, colorblind-friendly-ish palette cycled for new layers. */
export const LAYER_PALETTE = [
  '#2f7ed8',
  '#e8743b',
  '#19a979',
  '#945ecf',
  '#e4b400',
  '#13a4b4',
  '#c43b6b',
  '#6c8b3c'
] as const

/** Pick a palette color by index (wraps). */
export function paletteColor(index: number): string {
  return LAYER_PALETTE[
    ((index % LAYER_PALETTE.length) + LAYER_PALETTE.length) % LAYER_PALETTE.length
  ]
}

/** Available basemap presets for the picker. */
export const BASEMAP_PRESETS: Array<{ id: MapBasemapId; label: string }> = [
  { id: 'protomaps-light', label: 'Streets (light)' },
  { id: 'protomaps-dark', label: 'Streets (dark)' },
  { id: 'blank', label: 'Blank' }
]

interface BasemapColors {
  background: string
  earth: string
  water: string
  landuse: string
  roads: string
  buildings: string
  boundaries: string
}

const LIGHT: BasemapColors = {
  background: '#f6f4ef',
  earth: '#e8e4da',
  water: '#a8c8e8',
  landuse: '#dfe6d4',
  roads: '#ffffff',
  buildings: '#d9d3c6',
  boundaries: '#b3a999'
}

const DARK: BasemapColors = {
  background: '#1b1d22',
  earth: '#23262d',
  water: '#16314a',
  landuse: '#26302a',
  roads: '#3a3f48',
  buildings: '#2c313a',
  boundaries: '#4a515c'
}

/**
 * Build a basemap-only style.
 *
 * - `blank` renders a flat background (no tiles, always works offline).
 * - `protomaps-*` renders the Protomaps v4 vector schema from a PMTiles source
 *   (default: the open demo bucket). No glyphs/sprite are referenced, so no
 *   label fonts need hosting — geometry only, but a recognizable world map.
 */
export function buildBasemapStyle(
  basemap: MapBasemapId,
  opts: { pmtilesUrl?: string } = {}
): MapStyle {
  if (basemap === 'blank') {
    return {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': LIGHT.earth } }]
    }
  }

  const colors = basemap === 'protomaps-dark' ? DARK : LIGHT
  const url = opts.pmtilesUrl ?? PROTOMAPS_DEMO_PMTILES

  return {
    version: 8,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${url}`,
        attribution: '© OpenStreetMap, Protomaps'
      }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': colors.background } },
      {
        id: 'earth',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'earth',
        paint: { 'fill-color': colors.earth }
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'landuse',
        paint: { 'fill-color': colors.landuse }
      },
      {
        id: 'water',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'water',
        paint: { 'fill-color': colors.water }
      },
      {
        id: 'roads',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        paint: { 'line-color': colors.roads, 'line-width': 1 }
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'protomaps',
        'source-layer': 'buildings',
        paint: { 'fill-color': colors.buildings, 'fill-opacity': 0.7 }
      },
      {
        id: 'boundaries',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'boundaries',
        paint: { 'line-color': colors.boundaries, 'line-width': 0.6, 'line-dasharray': [2, 2] }
      }
    ]
  }
}

/** The MapLibre source id for a data layer. */
export function dataSourceId(layer: MapLayerSpec): string {
  return `xnet-src-${layer.id}`
}

/**
 * Build the paint layer(s) for a data layer's geometry + style.
 *
 * Fills also get an outline line, so a single layer can yield two MapLibre
 * layers. Returned layers are ordered bottom→top within the layer.
 */
export function buildDataLayers(layer: MapLayerSpec): MapStyleLayer[] {
  const source = dataSourceId(layer)
  const { color, opacity, size, geometry } = layer.style
  const base = `xnet-${layer.id}`

  switch (geometry) {
    case 'line':
      return [
        {
          id: `${base}-line`,
          type: 'line',
          source,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': color, 'line-width': size ?? 2, 'line-opacity': opacity ?? 1 }
        }
      ]
    case 'fill':
      return [
        {
          id: `${base}-fill`,
          type: 'fill',
          source,
          paint: { 'fill-color': color, 'fill-opacity': opacity ?? 0.4 }
        },
        {
          id: `${base}-outline`,
          type: 'line',
          source,
          paint: { 'line-color': color, 'line-width': size ?? 1, 'line-opacity': 0.9 }
        }
      ]
    case 'heatmap':
      return [
        {
          id: `${base}-heatmap`,
          type: 'heatmap',
          source,
          paint: {
            'heatmap-radius': size ?? 20,
            'heatmap-opacity': opacity ?? 0.8,
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(0,0,0,0)',
              1,
              color
            ]
          }
        }
      ]
    case 'point':
    default:
      return [
        {
          id: `${base}-point`,
          type: 'circle',
          source,
          paint: {
            'circle-radius': size ?? 5,
            'circle-color': color,
            'circle-opacity': opacity ?? 0.85,
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff'
          }
        }
      ]
  }
}

/** Style-layer ids we own (added by sync, prefixed `xnet-`). */
export function ownedLayerIds(styleLayerIds: string[]): string[] {
  return styleLayerIds.filter((id) => id.startsWith('xnet-'))
}

/** Source ids we own (prefixed `xnet-src-`). */
export function ownedSourceIds(sourceIds: string[]): string[] {
  return sourceIds.filter((id) => id.startsWith('xnet-src-'))
}

/** A render plan for one data layer: a GeoJSON source + its paint layers. */
export interface DataLayerPlan {
  sourceId: string
  data: GeoFeatureCollection
  layers: MapStyleLayer[]
}

/** Compute the source+layers to add for the visible inline-GeoJSON layers. */
export function planDataLayers(layers: MapLayerSpec[]): DataLayerPlan[] {
  return layers
    .filter((l) => l.visible && l.source.kind === 'geojson')
    .map((l) => ({
      sourceId: dataSourceId(l),
      data: (l.source as Extract<MapLayerSource, { kind: 'geojson' }>).data,
      layers: buildDataLayers(l)
    }))
}

/** A render plan for one raster (imagery/topo) tile layer. */
export interface RasterLayerPlan {
  sourceId: string
  tileUrl: string
  tileSize: number
  attribution?: string
  layer: MapStyleLayer
}

/**
 * Compute the source+layer to add for the visible raster (XYZ tile) layers.
 *
 * A raster layer becomes a MapLibre `raster` source (`tiles: [url]`) plus a
 * `raster` paint layer honoring the layer's opacity. Drawn above the basemap
 * in layer order, like the geometry layers.
 */
export function planRasterLayers(layers: MapLayerSpec[]): RasterLayerPlan[] {
  return layers
    .filter((l) => l.visible && l.source.kind === 'raster')
    .map((l) => {
      const source = l.source as Extract<MapLayerSource, { kind: 'raster' }>
      return {
        sourceId: dataSourceId(l),
        tileUrl: source.tileUrl,
        tileSize: source.tileSize ?? 256,
        ...(source.attribution ? { attribution: source.attribution } : {}),
        layer: {
          id: `xnet-${l.id}-raster`,
          type: 'raster',
          source: dataSourceId(l),
          paint: { 'raster-opacity': l.style.opacity ?? 1 }
        }
      }
    })
}

/** Recover a layer-spec id from a clicked MapLibre layer id. */
export function layerSpecIdFromMapLayerId(id: string): string {
  return id.replace(/^xnet-/, '').replace(/-(point|line|fill|outline|heatmap|raster)$/, '')
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;'
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c] ?? c)
}

/** Build the (escaped) popup table HTML for a feature's properties. */
export function popupTableHtml(props: Record<string, unknown>): string {
  const rows = Object.entries(props)
    .map(
      ([k, v]) =>
        `<tr><td style="color:#888;padding-right:8px">${escapeHtml(k)}</td><td>${escapeHtml(
          String(v)
        )}</td></tr>`
    )
    .join('')
  return `<table style="font-size:12px;border-collapse:collapse">${rows}</table>`
}
