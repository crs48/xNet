/**
 * DatabaseMapView — V2 map of the current table's rows (exploration 0339).
 *
 * A pin map, not the full GIS surface (that's `MapSchema` +
 * `packages/maps`): rows bind through one first-class geo field, or two
 * number fields (lat/lng, with name-convention defaults) — see
 * `resolveGeoFields`. Pins cluster via MapLibre's built-in
 * supercluster (`cluster: true`), a pin click opens the row, and the
 * camera persists per view (`mapViewport`, debounced whole-object LWW).
 *
 * Tiles reuse the maps package's key-less basemaps: Protomaps vector
 * tiles over the `pmtiles://` protocol — self-hostable as one static
 * file for offline/local-first deployments (set `pmtilesUrl`). maplibre-gl
 * loads via dynamic import so the WebGL bundle stays off initial paint;
 * jsdom/SSR degrade to a text fallback.
 */

import type { MapViewport } from '@xnetjs/data'
import { resolveBasemapStyle } from '@xnetjs/maps'
import { useEntangleBus } from '@xnetjs/react'
import { cn } from '@xnetjs/ui'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { WindowFootnote } from './card-bits.js'
import { resolveGeoFields, type DatabaseViewProps } from './contract.js'
import { defaultViewportFor, rowsToGeoJSON } from './map-model.js'

type MlMap = import('maplibre-gl').Map

const SOURCE_ID = 'xnet-db-rows'
const BASEMAP = 'protomaps-light' as const

/**
 * Hosted default: OpenFreeMap's Liberty style — key-less, no
 * registration, full labels. Requires `https://tiles.openfreemap.org`
 * in the app CSP (connect-src).
 */
export const OPENFREEMAP_LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

/** Tile configuration for the database Map view (exploration 0339). */
export interface DatabaseMapTiles {
  /**
   * Self-hosted Protomaps PMTiles archive URL — ONE static file served
   * from your own origin (offline/local-first path). When set, it wins
   * over `styleUrl`.
   */
  pmtilesUrl?: string
  /** Hosted MapLibre style JSON URL (default: OpenFreeMap Liberty). */
  styleUrl?: string
}

let tiles: DatabaseMapTiles = {}

/**
 * Configure basemap tiles app-wide (call once at startup). Self-hosted
 * deployments point `pmtilesUrl` at their own archive; the default is
 * the key-less OpenFreeMap style.
 */
export function configureDatabaseMapTiles(config: DatabaseMapTiles): void {
  tiles = config
}

function resolveMapStyle(): { style: unknown; needsPmtiles: boolean } {
  if (tiles.pmtilesUrl) {
    return {
      style: resolveBasemapStyle(BASEMAP, { pmtilesUrl: tiles.pmtilesUrl }),
      needsPmtiles: true
    }
  }
  return { style: tiles.styleUrl ?? OPENFREEMAP_LIBERTY_STYLE, needsPmtiles: false }
}

let pmtilesRegistered = false

async function registerPmtiles(): Promise<void> {
  if (pmtilesRegistered) return
  const [maplibre, pmtiles] = await Promise.all([import('maplibre-gl'), import('pmtiles')])
  maplibre.addProtocol('pmtiles', new pmtiles.Protocol().tile)
  pmtilesRegistered = true
}

function addRowLayers(map: MlMap, geojson: GeoJSON.FeatureCollection): void {
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: geojson,
    cluster: true,
    clusterMaxZoom: 13,
    clusterRadius: 44
  })
  map.addLayer({
    id: `${SOURCE_ID}-clusters`,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#2f7ed8',
      'circle-opacity': 0.85,
      'circle-radius': ['step', ['get', 'point_count'], 14, 25, 18, 100, 24]
    }
  })
  map.addLayer({
    id: `${SOURCE_ID}-cluster-count`,
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-size': 11,
      // Glyphs aren't hosted for the key-less basemaps; text renders only
      // when the style provides glyphs. Numbers degrade gracefully.
      'text-allow-overlap': true
    },
    paint: { 'text-color': '#ffffff' }
  })
  map.addLayer({
    id: `${SOURCE_ID}-pins`,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': '#e11d48',
      'circle-radius': 6,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5
    }
  })
  // Entangle highlight (0346): pins for rows hovered in sibling frames
  // render a halo. The filter starts empty; the bus effect updates it.
  map.addLayer({
    id: `${SOURCE_ID}-pins-entangled`,
    type: 'circle',
    source: SOURCE_ID,
    filter: ['in', ['get', 'rowId'], ['literal', []]],
    paint: {
      'circle-color': '#f59e0b',
      'circle-opacity': 0.35,
      'circle-radius': 12
    }
  })
}

export function DatabaseMapView(props: DatabaseViewProps): React.JSX.Element {
  const {
    fields,
    rows,
    window: viewWindow,
    config,
    className,
    onPatchConfig,
    onOpenRow,
    onCreateRow,
    onBoundsChange
  } = props

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const [fallback, setFallback] = useState<string | null>(null)

  // Entangle bus (0346): pins publish hover; a halo layer mirrors rows
  // highlighted in sibling frames.
  const entangleBus = useEntangleBus()
  const busRef = useRef(entangleBus)
  busRef.current = entangleBus
  const lastHoverRef = useRef<string | null>(null)

  useEffect(() => {
    if (!entangleBus) return
    const apply = () => {
      const map = mapRef.current
      if (!map || !map.getLayer(`${SOURCE_ID}-pins-entangled`)) return
      map.setFilter(`${SOURCE_ID}-pins-entangled`, [
        'in',
        ['get', 'rowId'],
        ['literal', entangleBus.snapshotHighlighted()]
      ])
    }
    return entangleBus.subscribe(apply)
  }, [entangleBus])

  const binding = resolveGeoFields(fields, config)
  const { geo: geoField, lat: latField, lng: lngField } = binding
  const bound = Boolean(geoField ?? (latField && lngField))
  const points = useMemo(
    () =>
      bound
        ? rowsToGeoJSON(rows, fields, binding)
        : {
            geojson: { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection,
            plotted: 0,
            skipped: rows.length
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, fields, bound, geoField?.id, latField?.id, lngField?.id]
  )

  // Keep the latest callbacks/data in refs so the map effect runs once
  const openRowRef = useRef(onOpenRow)
  openRowRef.current = onOpenRow
  const patchConfigRef = useRef(onPatchConfig)
  patchConfigRef.current = onPatchConfig
  const boundsChangeRef = useRef(onBoundsChange)
  boundsChangeRef.current = onBoundsChange
  const createRowRef = useRef(onCreateRow)
  createRowRef.current = onCreateRow
  const geoFieldIdsRef = useRef<{ geo: string } | { lat: string; lng: string } | null>(null)
  geoFieldIdsRef.current = geoField
    ? { geo: geoField.id }
    : latField && lngField
      ? { lat: latField.id, lng: lngField.id }
      : null
  const initialViewportRef = useRef<MapViewport>(
    config.mapViewport ?? defaultViewportFor(points.geojson)
  )
  const pointsRef = useRef(points.geojson)

  // ─── Map lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!bound) return
    let disposed = false
    let map: MlMap | null = null
    let persistTimer: ReturnType<typeof setTimeout> | null = null

    void (async () => {
      try {
        const maplibre = await import('maplibre-gl')
        const { style, needsPmtiles } = resolveMapStyle()
        if (needsPmtiles) await registerPmtiles()
        if (disposed || !containerRef.current) return
        const viewport = initialViewportRef.current
        map = new maplibre.Map({
          container: containerRef.current,
          style: style as never,
          center: [viewport.longitude, viewport.latitude],
          zoom: viewport.zoom,
          attributionControl: { compact: true }
        })
        mapRef.current = map
        map.on('load', () => {
          if (!map || disposed) return
          addRowLayers(map, pointsRef.current)
        })
        // Cluster click → zoom in; pin click → open the row
        map.on('click', `${SOURCE_ID}-clusters`, (e) => {
          const feature = e.features?.[0]
          if (!map || !feature) return
          map.easeTo({ center: e.lngLat, zoom: map.getZoom() + 2 })
        })
        map.on('click', `${SOURCE_ID}-pins`, (e) => {
          const rowId = e.features?.[0]?.properties?.rowId
          if (typeof rowId === 'string') openRowRef.current?.(rowId)
        })
        // Right-click → create a row at that location (NocoDB parity):
        // one geo cell when the binding is a geo field, else the pair
        map.on('contextmenu', (e) => {
          const geo = geoFieldIdsRef.current
          if (!geo || !createRowRef.current) return
          e.preventDefault()
          const lat = Number(e.lngLat.lat.toFixed(6))
          const lng = Number(e.lngLat.lng.toFixed(6))
          createRowRef.current(
            'geo' in geo ? { [geo.geo]: { lat, lng } } : { [geo.lat]: lat, [geo.lng]: lng }
          )
        })
        map.on('mouseenter', `${SOURCE_ID}-pins`, () => {
          if (map) map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', `${SOURCE_ID}-pins`, () => {
          if (map) map.getCanvas().style.cursor = ''
          const last = lastHoverRef.current
          if (last) {
            busRef.current?.setHovered(last, false)
            lastHoverRef.current = null
          }
        })
        // Entangle publish (0346): hovering a pin lights the same row in
        // sibling frames (grid row, board card, wikilink).
        map.on('mousemove', `${SOURCE_ID}-pins`, (e) => {
          const rowId = e.features?.[0]?.properties?.rowId
          if (typeof rowId !== 'string' || rowId === lastHoverRef.current) return
          const last = lastHoverRef.current
          if (last) busRef.current?.setHovered(last, false)
          lastHoverRef.current = rowId
          busRef.current?.setHovered(rowId, true)
        })
        // Persist the camera per view (debounced, whole-object LWW)
        map.on('moveend', () => {
          if (!map || disposed) return
          const b = map.getBounds()
          boundsChangeRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()])
          const center = map.getCenter()
          const next: MapViewport = {
            longitude: Number(center.lng.toFixed(5)),
            latitude: Number(center.lat.toFixed(5)),
            zoom: Number(map.getZoom().toFixed(2))
          }
          if (persistTimer) clearTimeout(persistTimer)
          persistTimer = setTimeout(() => {
            patchConfigRef.current?.({ mapViewport: next })
          }, 800)
        })
      } catch {
        if (!disposed) setFallback('Map rendering is unavailable here (WebGL required).')
      }
    })()

    return () => {
      disposed = true
      if (persistTimer) clearTimeout(persistTimer)
      mapRef.current = null
      map?.remove()
    }
  }, [geoField?.id, latField?.id, lngField?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Push data updates into the live source
  useEffect(() => {
    pointsRef.current = points.geojson
    const map = mapRef.current
    const source = map?.getSource(SOURCE_ID) as
      | { setData(data: GeoJSON.FeatureCollection): void }
      | undefined
    source?.setData(points.geojson)
  }, [points.geojson])

  if (!bound) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center p-8 text-center text-sm text-ink-3',
          className
        )}
      >
        Add a Location field — or two number fields named “lat” and “lng” (or pick them in view
        options) — to place rows on the map.
      </div>
    )
  }

  return (
    <div className={cn('flex h-full flex-col overflow-hidden', className)} data-testid="map-view">
      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" data-testid="map-canvas" />
        {fallback && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-ink-3">
            {fallback}
          </div>
        )}
        <div className="absolute bottom-2 left-2 rounded bg-surface-0/90 px-2 py-1 text-[11px] text-ink-2 shadow-sm">
          {points.plotted} pinned
          {points.skipped > 0 ? ` · ${points.skipped} without coordinates` : ''}
        </div>
      </div>
      <WindowFootnote shown={rows.length} window={viewWindow} />
    </div>
  )
}
