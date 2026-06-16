/**
 * MapView — node-bound geospatial map surface (exploration 0187).
 *
 * Wraps @xnetjs/maps' MapCanvas + LayerPanel over a Map node: the layer
 * stack, basemap, and viewport persist as whole-value LWW json properties
 * (same pattern as DatabaseView wrapping the grid). The WebGL engine is
 * lazy-loaded inside MapCanvas, so opening a map is the only thing that pulls
 * maplibre-gl. State derivation lives in @xnetjs/maps' pure `mapDocState`.
 */
import { MapSchema, type MapBasemapId, type MapLayerSpec, type MapViewport } from '@xnetjs/data'
import { LayerPanel, MapCanvas, mapDocState } from '@xnetjs/maps'
import { useIdentity, useNode } from '@xnetjs/react'
import { useCallback, useEffect, useRef } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useWorkbench } from '../workbench/state'

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
  const {
    data: map,
    loading,
    update
  } = useNode(MapSchema, mapId, {
    createIfMissing: { title: 'Untitled Map' },
    did: did ?? undefined
  })

  const { basemap, viewport, layers, title } = mapDocState(map)

  useEffect(() => {
    if (title) useWorkbench.getState().setTabTitle(mapId, title)
  }, [mapId, title])

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
      <div className="flex items-center gap-2 border-b border-border bg-secondary p-3">
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
            layers={layers}
            onViewportChange={persistViewport}
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
