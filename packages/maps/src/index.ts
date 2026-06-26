/**
 * @xnetjs/maps — open geospatial mapping for xNet (exploration 0187).
 *
 * MapLibre GL JS renderer + Protomaps/PMTiles open basemap, layered data
 * sources imported from GeoJSON/CSV. Pure ingestion/style/layer logic is
 * dependency-free and unit-tested; the renderer lazy-loads the WebGL engine.
 *
 * Persisted types (MapSchema, MapLayerSpec, …) live in @xnetjs/data and are
 * re-exported here for convenience.
 */

// Pure: GeoJSON / CSV ingestion + geometry helpers
export {
  type GeoBounds,
  type CsvParseResult,
  parseGeoJson,
  normalizeToFeatureCollection,
  parseCsv,
  parseCsvToFeatures,
  featureCollectionBounds,
  inferLayerGeometry,
  featurePropertyKeys
} from './geojson'

// Pure: MapLibre style construction
export {
  type MapStyle,
  type MapStyleLayer,
  type DataLayerPlan,
  type RasterLayerPlan,
  PROTOMAPS_DEMO_PMTILES,
  ESRI_WORLD_IMAGERY,
  ESRI_WORLD_IMAGERY_ATTRIBUTION,
  DEFAULT_VIEWPORT,
  LAYER_PALETTE,
  BASEMAP_PRESETS,
  paletteColor,
  buildBasemapStyle,
  buildRasterBasemapStyle,
  buildDataLayers,
  dataSourceId,
  ownedLayerIds,
  ownedSourceIds,
  planDataLayers,
  planRasterLayers,
  layerSpecIdFromMapLayerId,
  popupTableHtml
} from './style'

// Pure: geohash spatial index helpers (exploration 0230)
export {
  type GeoBox,
  geohashEncode,
  geohashBounds,
  geohashCellsForBounds
} from './geohash'

// Pure: live query-layer materialization (exploration 0230)
export {
  type QuerySource,
  type QueryLayerNode,
  type QueryBounds,
  type QueryLayerRequest,
  type QueryLayerRunner,
  querySourceFields,
  buildQueryRequest,
  featureFromNode,
  materializeQueryLayer
} from './query-layer'

// Registry: basemaps as an extension seam (0205)
export {
  BasemapRegistry,
  basemapRegistry,
  basemapPresets,
  basemapUsesPmtiles,
  ensureBuiltinBasemaps,
  registerXyzBasemap,
  hasBasemap,
  resolveBasemapStyle,
  type BasemapDefinition,
  type Disposable
} from './basemap-registry'

// Pure: map-document state derivation
export { mapDocState, type MapDocInput, type MapDocState } from './doc'

// Pure: layer construction + immutable list edits
export {
  type CreateLayerOptions,
  defaultStyle,
  createGeoJsonLayer,
  moveLayer,
  toggleLayerVisible,
  updateLayerStyle,
  renameLayer,
  removeLayer
} from './layers'

// React: renderer + layer panel
export { MapCanvas, type MapCanvasProps } from './MapCanvas'
export { LayerPanel, type LayerPanelProps } from './LayerPanel'

// Re-export the persisted map types from @xnetjs/data
export type {
  Map as MapNode,
  MapBasemapId,
  MapViewport,
  MapLayerGeometry,
  MapLayerStyle,
  MapLayerSource,
  MapLayerSpec,
  GeoPosition,
  GeoGeometry,
  GeoFeature,
  GeoFeatureCollection
} from '@xnetjs/data'
