/**
 * MapCanvas — the MapLibre GL renderer (exploration 0187).
 *
 * maplibre-gl and pmtiles are loaded via dynamic import() so the ~200 KB WebGL
 * bundle never touches initial paint — it arrives only when a map is opened.
 * Rendering degrades gracefully when WebGL is unavailable (jsdom/SSR): the
 * canvas shows a textual fallback instead of throwing.
 *
 * The decision-heavy logic (which sources/layers to add, popup HTML, layer-id
 * parsing) lives in ./style as pure, unit-tested helpers; the functions here
 * are thin imperative shells over the maplibre-gl API.
 */

import type { MapBasemapId, MapLayerSpec, MapViewport } from '@xnetjs/data'
import type { GeoJSONSource, MapMouseEvent, Map as MlMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import {
  buildBasemapStyle,
  layerSpecIdFromMapLayerId,
  ownedLayerIds,
  ownedSourceIds,
  planDataLayers,
  popupTableHtml
} from './style'

export interface MapCanvasProps {
  basemap: MapBasemapId
  viewport: MapViewport
  layers: MapLayerSpec[]
  /** Override the basemap PMTiles URL (e.g. a hub-proxied tileset). */
  pmtilesUrl?: string
  /** Fired (debounced via moveend) when the user pans/zooms. */
  onViewportChange?: (viewport: MapViewport) => void
  /** Fired when a feature is clicked, with its layer id. */
  onFeatureClick?: (feature: Record<string, unknown>, layerId: string) => void
  className?: string
}

type MapLibreModule = typeof import('maplibre-gl')

// pmtiles:// only needs to be registered once per page.
let pmtilesRegistered = false

/** Remove the layers we previously added. */
function clearOwnedLayers(map: MlMap): void {
  const ids = ownedLayerIds((map.getStyle().layers ?? []).map((l) => l.id))
  for (const id of ids) map.removeLayer(id)
}

/** Remove the sources we previously added. */
function clearOwnedSources(map: MlMap): void {
  const ids = ownedSourceIds(Object.keys(map.getStyle().sources ?? {}))
  for (const id of ids) map.removeSource(id)
}

/** Add one data-layer plan (set-or-add source, then its paint layers). */
function addPlan(map: MlMap, plan: ReturnType<typeof planDataLayers>[number]): void {
  const data = plan.data as unknown as GeoJSON.FeatureCollection
  const existing = map.getSource(plan.sourceId) as GeoJSONSource | undefined
  if (existing) existing.setData(data)
  else map.addSource(plan.sourceId, { type: 'geojson', data })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const layer of plan.layers) map.addLayer(layer as any)
}

/** Replace all `xnet-` data sources & layers from the current spec list. */
function syncDataLayers(map: MlMap, layers: MapLayerSpec[]): void {
  clearOwnedLayers(map)
  clearOwnedSources(map)
  for (const plan of planDataLayers(layers)) addPlan(map, plan)
}

/** Register the pmtiles:// protocol once (skipped for the blank basemap). */
async function registerPmtiles(maplibregl: MapLibreModule, basemap: MapBasemapId): Promise<void> {
  if (basemap === 'blank' || pmtilesRegistered) return
  const { Protocol } = await import('pmtiles')
  maplibregl.addProtocol('pmtiles', new Protocol().tile)
  pmtilesRegistered = true
}

/** Create the map instance with its navigation/scale controls. */
function createMap(
  maplibregl: MapLibreModule,
  container: HTMLDivElement,
  basemap: MapBasemapId,
  viewport: MapViewport,
  pmtilesUrl: string | undefined
): MlMap {
  const map = new maplibregl.Map({
    container,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    style: buildBasemapStyle(basemap, { pmtilesUrl }) as any,
    center: [viewport.longitude, viewport.latitude],
    zoom: viewport.zoom,
    pitch: viewport.pitch ?? 0,
    bearing: viewport.bearing ?? 0,
    attributionControl: { compact: true }
  })
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), 'bottom-left')
  return map
}

/** Read the current camera as a MapViewport. */
function readViewport(map: MlMap): MapViewport {
  const c = map.getCenter()
  return {
    longitude: c.lng,
    latitude: c.lat,
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing()
  }
}

/** Show a popup for the topmost clicked feature and notify the caller. */
function showFeaturePopup(
  map: MlMap,
  maplibregl: MapLibreModule,
  e: MapMouseEvent,
  onFeatureClick?: MapCanvasProps['onFeatureClick']
): void {
  const ids = ownedLayerIds((map.getStyle().layers ?? []).map((l) => l.id))
  const hit = map.queryRenderedFeatures(e.point, { layers: ids })[0]
  if (!hit) return
  const props = (hit.properties ?? {}) as Record<string, unknown>
  new maplibregl.Popup({ closeButton: true })
    .setLngLat(e.lngLat)
    .setHTML(popupTableHtml(props))
    .addTo(map)
  onFeatureClick?.(props, layerSpecIdFromMapLayerId(hit.layer.id))
}

export function MapCanvas({
  basemap,
  viewport,
  layers,
  pmtilesUrl,
  onViewportChange,
  onFeatureClick,
  className
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Keep the latest callbacks/layers without re-creating the map.
  const layersRef = useRef(layers)
  layersRef.current = layers
  const onViewportRef = useRef(onViewportChange)
  onViewportRef.current = onViewportChange
  const onFeatureRef = useRef(onFeatureClick)
  onFeatureRef.current = onFeatureClick

  // Create the map (re-created only when basemap/pmtilesUrl change).
  useEffect(() => {
    let cancelled = false
    let map: MlMap | null = null

    void (async () => {
      try {
        const maplibregl = await import('maplibre-gl')
        await registerPmtiles(maplibregl, basemap)
        if (cancelled || !containerRef.current) return

        map = createMap(maplibregl, containerRef.current, basemap, viewport, pmtilesUrl)
        mapRef.current = map

        map.on('load', () => {
          if (cancelled || !map) return
          syncDataLayers(map, layersRef.current)
          setReady(true)
        })
        map.on('moveend', () => {
          if (map) onViewportRef.current?.(readViewport(map))
        })
        map.on('click', (e) => {
          if (map) showFeaturePopup(map, maplibregl, e, onFeatureRef.current)
        })
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    })()

    return () => {
      cancelled = true
      setReady(false)
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap, pmtilesUrl])

  // Re-sync data layers when the spec list changes.
  useEffect(() => {
    const map = mapRef.current
    if (map && ready) syncDataLayers(map, layers)
  }, [layers, ready])

  if (error) {
    return (
      <div
        className={className}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}
      >
        <div style={{ textAlign: 'center', color: '#888', fontSize: 13 }}>
          <div>Map preview unavailable</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            {layers.length} layer{layers.length === 1 ? '' : 's'} · {error}
          </div>
        </div>
      </div>
    )
  }

  return <div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />
}
