/**
 * MapView — node-bound geospatial map surface (exploration 0187).
 *
 * Wraps @xnetjs/maps' MapCanvas + LayerPanel over a Map node: the layer
 * stack, basemap, and viewport persist as whole-value LWW json properties
 * (same pattern as DatabaseView wrapping the grid). The WebGL engine is
 * lazy-loaded inside MapCanvas, so opening a map is the only thing that pulls
 * maplibre-gl. State derivation lives in @xnetjs/maps' pure `mapDocState`.
 */
import {
  MapSchema,
  type GeoFeatureCollection,
  type MapBasemapId,
  type MapLayerSpec,
  type MapViewport,
  type SchemaIRI
} from '@xnetjs/data'
import {
  LayerPanel,
  MapCanvas,
  mapDocState,
  materializeQueryLayer,
  type QueryBounds,
  type QueryLayerRunner,
  type QuerySource
} from '@xnetjs/maps'
import { useIdentity, useNode } from '@xnetjs/react'
import { useNodeStore } from '@xnetjs/react/internal'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { usePublishTitle } from '../workbench/route-title'
import { useWorkbench } from '../workbench/state'

const EMPTY_FC: GeoFeatureCollection = { type: 'FeatureCollection', features: [] }

interface MapViewProps {
  mapId: string
}

/** A debounced viewport persister — keeps MapView's own complexity low. */
function useDebouncedViewport(persist: (v: MapViewport) => void): (v: MapViewport) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  return useCallback(
    (next: MapViewport) => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => persist(next), 600)
    },
    [persist]
  )
}

export function MapView({ mapId }: MapViewProps) {
  const { did } = useIdentity()
  const { store } = useNodeStore()
  const {
    data: map,
    loading,
    update
  } = useNode(MapSchema, mapId, {
    createIfMissing: { title: 'Untitled Map' },
    did: did ?? undefined
  })

  const { basemap, viewport, layers, title } = mapDocState(map)

  // ─── Live query layers ─────────────────────────────────────────────────────
  // `query` layers bind to a database schema by lat/lon; on each viewport change
  // we re-query the visible window through the (authz'd) store and materialize
  // the rows to GeoJSON, then feed them to the renderer as ordinary geojson
  // layers (exploration 0230). The decision-heavy mapping lives in
  // @xnetjs/maps' pure `materializeQueryLayer`.
  const [bounds, setBounds] = useState<QueryBounds | null>(null)
  const [queryData, setQueryData] = useState<Record<string, GeoFeatureCollection>>({})

  const layersRef = useRef(layers)
  layersRef.current = layers

  const runner = useMemo<QueryLayerRunner>(
    () => async (req) => {
      if (!store) return []
      const result = await store.query({
        schemaId: req.schemaId as SchemaIRI,
        includeDeleted: false,
        spatial: req.spatial,
        limit: 5000,
        ...(req.where ? { where: req.where as never } : {})
      })
      return result.nodes.map((n) => ({
        id: n.id,
        properties: n.properties as Record<string, unknown>
      }))
    },
    [store]
  )

  // Stable signature so the materialize effect only re-runs on a real change to
  // the query layers (not on every render's fresh `layers` array identity).
  const querySignature = useMemo(
    () =>
      JSON.stringify(
        layers
          .filter((l) => l.source.kind === 'query')
          .map((l) => ({ id: l.id, visible: l.visible, source: l.source }))
      ),
    [layers]
  )

  useEffect(() => {
    if (!store || !bounds) return
    const queryLayers = layersRef.current.filter((l) => l.visible && l.source.kind === 'query')
    if (queryLayers.length === 0) {
      setQueryData((prev) => (Object.keys(prev).length ? {} : prev))
      return
    }
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        queryLayers.map(async (l) => {
          try {
            const fc = await materializeQueryLayer(l.source as QuerySource, bounds, runner)
            return [l.id, fc] as const
          } catch {
            return [l.id, EMPTY_FC] as const
          }
        })
      )
      if (!cancelled) setQueryData(Object.fromEntries(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [store, bounds, querySignature, runner])

  const effectiveLayers = useMemo<MapLayerSpec[]>(
    () =>
      layers.map((l) =>
        l.source.kind === 'query'
          ? { ...l, source: { kind: 'geojson', data: queryData[l.id] ?? EMPTY_FC } }
          : l
      ),
    [layers, queryData]
  )

  usePublishTitle(mapId, title)

  const persistViewport = useDebouncedViewport(
    useCallback((next: MapViewport) => void update({ viewport: next }), [update])
  )
  const handleLayersChange = useCallback(
    (next: MapLayerSpec[]) => void update({ layers: next }),
    [update]
  )
  const handleBasemapChange = useCallback(
    (next: MapBasemapId) => void update({ basemap: next }),
    [update]
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-ink-3">Loading map…</div>
    )
  }

  return (
    <div className="-m-6 flex h-full flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        <input
          type="text"
          className="border-none bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted-foreground"
          value={title}
          onChange={(event) => void update({ title: event.target.value })}
          placeholder="Untitled"
        />
      </div>

      {/* Body: map + layer panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1 overflow-hidden">
          <MapCanvas
            basemap={basemap}
            viewport={viewport}
            layers={effectiveLayers}
            onViewportChange={persistViewport}
            onBoundsChange={setBounds}
            className="absolute inset-0"
          />
        </div>
        <div className="w-72 shrink-0 overflow-y-auto border-l border-hairline bg-surface-1">
          <LayerPanel
            layers={layers}
            basemap={basemap}
            onChange={handleLayersChange}
            onBasemapChange={handleBasemapChange}
          />
        </div>
      </div>
    </div>
  )
}
