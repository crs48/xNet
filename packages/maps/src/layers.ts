/**
 * Layer construction & immutable list operations (pure).
 *
 * These helpers own the layer-list editing semantics used by the layer panel,
 * so the same logic is unit-tested and reused by the UI without duplication.
 */

import type {
  GeoFeatureCollection,
  MapLayerGeometry,
  MapLayerSpec,
  MapLayerStyle
} from '@xnetjs/data'
import { nanoid } from 'nanoid'
import { featurePropertyKeys, inferLayerGeometry } from './geojson'
import { paletteColor } from './style'

const DEFAULT_OPACITY: Record<MapLayerGeometry, number> = {
  point: 0.85,
  line: 1,
  fill: 0.4,
  heatmap: 0.8
}

const DEFAULT_SIZE: Record<MapLayerGeometry, number> = {
  point: 5,
  line: 2,
  fill: 1,
  heatmap: 20
}

/** Default style for a geometry kind + color. */
export function defaultStyle(geometry: MapLayerGeometry, color: string): MapLayerStyle {
  return { geometry, color, opacity: DEFAULT_OPACITY[geometry], size: DEFAULT_SIZE[geometry] }
}

export interface CreateLayerOptions {
  /** Hex color; defaults to a palette color derived from `index`. */
  color?: string
  /** Palette index (used when `color` is omitted). */
  index?: number
  /** Override the inferred geometry. */
  geometry?: MapLayerGeometry
}

/** Build a layer from an inline GeoJSON FeatureCollection. */
export function createGeoJsonLayer(
  name: string,
  collection: GeoFeatureCollection,
  opts: CreateLayerOptions = {}
): MapLayerSpec {
  const geometry = opts.geometry ?? inferLayerGeometry(collection)
  const color = opts.color ?? paletteColor(opts.index ?? 0)
  return {
    id: nanoid(8),
    name,
    source: { kind: 'geojson', data: collection },
    style: defaultStyle(geometry, color),
    visible: true,
    popupProperties: featurePropertyKeys(collection)
  }
}

/** Move a layer from one index to another (immutable). */
export function moveLayer(layers: MapLayerSpec[], from: number, to: number): MapLayerSpec[] {
  if (from === to || from < 0 || to < 0 || from >= layers.length || to >= layers.length) {
    return layers
  }
  const next = [...layers]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Toggle a layer's visibility (immutable). */
export function toggleLayerVisible(layers: MapLayerSpec[], id: string): MapLayerSpec[] {
  return layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l))
}

/** Patch a layer's style (immutable). */
export function updateLayerStyle(
  layers: MapLayerSpec[],
  id: string,
  patch: Partial<MapLayerStyle>
): MapLayerSpec[] {
  return layers.map((l) => (l.id === id ? { ...l, style: { ...l.style, ...patch } } : l))
}

/** Rename a layer (immutable). */
export function renameLayer(layers: MapLayerSpec[], id: string, name: string): MapLayerSpec[] {
  return layers.map((l) => (l.id === id ? { ...l, name } : l))
}

/** Remove a layer (immutable). */
export function removeLayer(layers: MapLayerSpec[], id: string): MapLayerSpec[] {
  return layers.filter((l) => l.id !== id)
}
