/**
 * MapCanvas — the MapLibre GL renderer (exploration 0187).
 *
 * maplibre-gl and pmtiles are loaded via dynamic import() so the ~200 KB WebGL
 * bundle never touches initial paint — it arrives only when a map is opened.
 * Rendering degrades gracefully when WebGL is unavailable (jsdom/SSR): the
 * canvas shows a textual fallback instead of throwing.
 */

import type { MapBasemapId, MapLayerSpec, MapViewport } from '@xnetjs/data'
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { buildBasemapStyle, buildDataLayers, dataSourceId } from './style'

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

const EMPTY_FC = { type: 'FeatureCollection' as const, features: [] }

// pmtiles:// only needs to be registered once per page.
let pmtilesRegistered = false

/** Add/replace all `xnet-` data sources & layers from the current spec list. */
function syncDataLayers(map: MlMap, layers: MapLayerSpec[]): void {
  // Remove our previously-added layers and sources.
  for (const lyr of map.getStyle().layers ?? []) {
    if (lyr.id.startsWith('xnet-')) map.removeLayer(lyr.id)
  }
  for (const sourceId of Object.keys(map.getStyle().sources ?? {})) {
    if (sourceId.startsWith('xnet-src-') && map.getSource(sourceId)) map.removeSource(sourceId)
  }

  for (const layer of layers) {
    if (!layer.visible) continue
    const srcId = dataSourceId(layer)
    const data = layer.source.kind === 'geojson' ? layer.source.data : EMPTY_FC
    const existing = map.getSource(srcId) as GeoJSONSource | undefined
    if (existing) {
      existing.setData(data as GeoJSON.FeatureCollection)
    } else {
      map.addSource(srcId, { type: 'geojson', data: data as GeoJSON.FeatureCollection })
    }
    for (const paintLayer of buildDataLayers(layer)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.addLayer(paintLayer as any)
    }
  }
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
        const maplibregl = (await import('maplibre-gl')).default
        if (basemap !== 'blank' && !pmtilesRegistered) {
          const { Protocol } = await import('pmtiles')
          const protocol = new Protocol()
          maplibregl.addProtocol('pmtiles', protocol.tile)
          pmtilesRegistered = true
        }
        if (cancelled || !containerRef.current) return

        map = new maplibregl.Map({
          container: containerRef.current,
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
        mapRef.current = map

        map.on('load', () => {
          if (cancelled || !map) return
          syncDataLayers(map, layersRef.current)
          setReady(true)
        })

        map.on('moveend', () => {
          if (!map || !onViewportRef.current) return
          const c = map.getCenter()
          onViewportRef.current({
            longitude: c.lng,
            latitude: c.lat,
            zoom: map.getZoom(),
            pitch: map.getPitch(),
            bearing: map.getBearing()
          })
        })

        map.on('click', (e) => {
          if (!map) return
          const ids = (map.getStyle().layers ?? [])
            .map((l) => l.id)
            .filter((id) => id.startsWith('xnet-'))
          if (ids.length === 0) return
          const hits = map.queryRenderedFeatures(e.point, { layers: ids })
          const hit = hits[0]
          if (!hit) return
          const props = (hit.properties ?? {}) as Record<string, unknown>
          const layerId = hit.layer.id
            .replace(/^xnet-/, '')
            .replace(/-(point|line|fill|outline|heatmap)$/, '')
          const rows = Object.entries(props)
            .map(
              ([k, v]) =>
                `<tr><td style="color:#888;padding-right:8px">${k}</td><td>${String(v)}</td></tr>`
            )
            .join('')
          new maplibregl.Popup({ closeButton: true })
            .setLngLat(e.lngLat)
            .setHTML(`<table style="font-size:12px;border-collapse:collapse">${rows}</table>`)
            .addTo(map)
          onFeatureRef.current?.(props, layerId)
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
    if (!map || !ready) return
    syncDataLayers(map, layers)
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
