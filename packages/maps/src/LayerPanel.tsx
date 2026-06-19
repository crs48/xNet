/**
 * LayerPanel — add/import/style/reorder/remove map layers (exploration 0187).
 *
 * Pure list edits delegate to ./layers; import delegates to ./geojson. The
 * panel is presentational over a `layers` array + `onChange`, so the parent
 * surface owns persistence (whole-list LWW into the Map node).
 */

import type { MapBasemapId, MapLayerGeometry, MapLayerSpec } from '@xnetjs/data'
import { ChevronDown, ChevronUp, Eye, EyeOff, Layers, Trash2, Upload } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { basemapPresets, basemapRegistry } from './basemap-registry'
import { parseCsvToFeatures, parseGeoJson } from './geojson'
import {
  createGeoJsonLayer,
  moveLayer,
  removeLayer,
  toggleLayerVisible,
  updateLayerStyle
} from './layers'

export interface LayerPanelProps {
  layers: MapLayerSpec[]
  basemap: MapBasemapId
  onChange: (layers: MapLayerSpec[]) => void
  onBasemapChange: (basemap: MapBasemapId) => void
}

const GEOMETRIES: MapLayerGeometry[] = ['point', 'line', 'fill', 'heatmap']

function layerCountLabel(n: number): string {
  return `${n} layer${n === 1 ? '' : 's'}`
}

export function LayerPanel({ layers, basemap, onChange, onBasemapChange }: LayerPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const inputId = useId()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Basemaps come from the registry so plugin-contributed basemaps appear (0205).
  const [presets, setPresets] = useState(basemapPresets)
  useEffect(() => basemapRegistry.onChange(() => setPresets(basemapPresets())), [])

  const importFile = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const text = await file.text()
      const isCsv = /\.csv$/i.test(file.name)
      const collection = isCsv ? parseCsvToFeatures(text).collection : parseGeoJson(text)
      const name = file.name.replace(/\.(geo)?json$|\.csv$/i, '')
      const layer = createGeoJsonLayer(name || 'Imported layer', collection, {
        index: layers.length
      })
      onChange([...layers, layer])
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onFiles = (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) void importFile(file)
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3 text-xs text-ink-2">
      {/* Basemap */}
      <label className="flex items-center justify-between gap-2">
        <span className="text-ink-3">Basemap</span>
        <select
          aria-label="Basemap"
          className="rounded-sm border border-hairline bg-surface-0 px-2 py-1 text-ink-1"
          value={basemap}
          onChange={(e) => onBasemapChange(e.target.value as MapBasemapId)}
        >
          {presets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </label>

      {/* Import */}
      <div>
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept=".json,.geojson,.csv,application/geo+json,application/json,text/csv"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-hairline px-2 py-2 text-ink-2 hover:bg-surface-1 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {busy ? 'Importing…' : 'Import GeoJSON / CSV'}
        </button>
        {error && <p className="mt-1 text-[11px] text-red-500">{error}</p>}
      </div>

      {/* Layer list (top of list = top of draw stack) */}
      <div className="flex items-center gap-1.5 pt-1 text-ink-3">
        <Layers className="h-3.5 w-3.5" />
        <span>{layerCountLabel(layers.length)}</span>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto">
        {layers.length === 0 && (
          <p className="text-[11px] text-ink-3">No layers yet. Import a dataset to begin.</p>
        )}
        {layers
          .map((layer, index) => ({ layer, index }))
          .reverse()
          .map(({ layer, index }) => (
            <div
              key={layer.id}
              className="flex flex-col gap-2 rounded-sm border border-hairline bg-surface-0 p-2"
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                  onClick={() => onChange(toggleLayerVisible(layers, layer.id))}
                  className="text-ink-2 hover:text-ink-1"
                >
                  {layer.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <input
                  type="color"
                  aria-label="Layer color"
                  value={layer.style.color}
                  onChange={(e) =>
                    onChange(updateLayerStyle(layers, layer.id, { color: e.target.value }))
                  }
                  className="h-5 w-5 shrink-0 cursor-pointer rounded-sm border border-hairline bg-transparent p-0"
                />
                <input
                  aria-label="Layer name"
                  value={layer.name}
                  onChange={(e) =>
                    onChange(
                      layers.map((l) => (l.id === layer.id ? { ...l, name: e.target.value } : l))
                    )
                  }
                  className="min-w-0 flex-1 truncate border-none bg-transparent text-ink-1 outline-none"
                />
                <button
                  type="button"
                  aria-label="Move layer up"
                  disabled={index === layers.length - 1}
                  onClick={() => onChange(moveLayer(layers, index, index + 1))}
                  className="text-ink-3 hover:text-ink-1 disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move layer down"
                  disabled={index === 0}
                  onClick={() => onChange(moveLayer(layers, index, index - 1))}
                  className="text-ink-3 hover:text-ink-1 disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Delete layer"
                  onClick={() => onChange(removeLayer(layers, layer.id))}
                  className="text-ink-3 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2 pl-6 text-[11px]">
                <select
                  aria-label="Geometry"
                  value={layer.style.geometry}
                  onChange={(e) =>
                    onChange(
                      updateLayerStyle(layers, layer.id, {
                        geometry: e.target.value as MapLayerGeometry
                      })
                    )
                  }
                  className="rounded-sm border border-hairline bg-surface-0 px-1.5 py-0.5 text-ink-1"
                >
                  {GEOMETRIES.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-ink-3">
                  size
                  <input
                    aria-label="Layer size"
                    type="number"
                    min={0}
                    step={1}
                    value={layer.style.size ?? 5}
                    onChange={(e) =>
                      onChange(updateLayerStyle(layers, layer.id, { size: Number(e.target.value) }))
                    }
                    className="w-12 rounded-sm border border-hairline bg-surface-0 px-1 py-0.5 text-ink-1"
                  />
                </label>
              </div>
            </div>
          ))}
      </div>
    </div>
  )
}
