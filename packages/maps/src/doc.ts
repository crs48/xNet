/**
 * Map-document state derivation (pure).
 *
 * Resolves a (possibly partial/absent) Map node into a fully-defaulted render
 * state, so the React surface reads clean values instead of threading nullish
 * fallbacks through its render path.
 */

import type { MapBasemapId, MapLayerSpec, MapViewport } from '@xnetjs/data'
import { DEFAULT_VIEWPORT } from './style'

/** The subset of a Map node this module reads. */
export interface MapDocInput {
  basemap?: string
  viewport?: MapViewport
  layers?: MapLayerSpec[]
  title?: string
}

/** Fully-defaulted map render state. */
export interface MapDocState {
  basemap: MapBasemapId
  viewport: MapViewport
  layers: MapLayerSpec[]
  title: string
}

const BASEMAPS: readonly MapBasemapId[] = [
  'protomaps-light',
  'protomaps-dark',
  'satellite',
  'blank'
]

function asBasemap(value: string | undefined): MapBasemapId {
  return BASEMAPS.includes(value as MapBasemapId) ? (value as MapBasemapId) : 'protomaps-light'
}

/** Derive defaulted basemap/viewport/layers/title from a Map node. */
export function mapDocState(node: MapDocInput | null | undefined): MapDocState {
  return {
    basemap: asBasemap(node?.basemap),
    viewport: node?.viewport ?? DEFAULT_VIEWPORT,
    layers: node?.layers ?? [],
    title: node?.title ?? ''
  }
}
