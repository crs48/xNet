/**
 * BasemapRegistry - Runtime registry of map basemaps (exploration 0205).
 *
 * Replaces the hardcoded `BASEMAP_PRESETS` array as the source of truth so a
 * plugin can contribute a new basemap (satellite, topo, a custom vector
 * tileset…) with no change to core maps code. Built-in basemaps
 * (protomaps-light/dark/blank) register lazily and import-order-safe.
 */

import type { MapBasemapId } from '@xnetjs/data'
import { BASEMAP_PRESETS, buildBasemapStyle, type MapStyle } from './style'

export interface Disposable {
  dispose(): void
}

export interface BasemapDefinition {
  /** Stable identifier persisted as `Map.basemap`. */
  id: string
  /** Human-readable label for the picker. */
  label: string
  /** True if this basemap needs the `pmtiles://` protocol registered. */
  usesPmtiles?: boolean
  /** Build a basemap-only MapStyle (no data layers). */
  buildStyle(opts?: { pmtilesUrl?: string }): MapStyle
}

export class BasemapRegistry {
  private basemaps = new Map<string, BasemapDefinition>()
  private listeners = new Set<() => void>()

  register(def: BasemapDefinition): Disposable {
    if (this.basemaps.has(def.id)) {
      console.warn(`[BasemapRegistry] Overriding existing basemap '${def.id}'`)
    }
    this.basemaps.set(def.id, def)
    this.notify()
    return {
      dispose: () => {
        this.basemaps.delete(def.id)
        this.notify()
      }
    }
  }

  get(id: string): BasemapDefinition | undefined {
    return this.basemaps.get(id)
  }

  getAll(): BasemapDefinition[] {
    return [...this.basemaps.values()]
  }

  has(id: string): boolean {
    return this.basemaps.has(id)
  }

  get size(): number {
    return this.basemaps.size
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear(): void {
    this.basemaps.clear()
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener()
      } catch (err) {
        console.error('[BasemapRegistry] Listener error:', err)
      }
    }
  }
}

/** Global basemap registry instance. */
export const basemapRegistry = new BasemapRegistry()

let builtinsRegistered = false

/**
 * Register the built-in basemaps (idempotent, import-order-safe). Re-populates
 * if the registry was cleared so built-ins can never be permanently lost.
 */
export function ensureBuiltinBasemaps(): void {
  if (builtinsRegistered && basemapRegistry.has('blank')) return
  builtinsRegistered = true
  for (const preset of BASEMAP_PRESETS) {
    if (basemapRegistry.has(preset.id)) continue
    basemapRegistry.register({
      id: preset.id,
      label: preset.label,
      usesPmtiles: preset.id !== 'blank',
      buildStyle: (opts) => buildBasemapStyle(preset.id as MapBasemapId, opts)
    })
  }
}

/** All basemaps for the picker (built-ins + plugin-contributed). */
export function basemapPresets(): Array<{ id: string; label: string }> {
  ensureBuiltinBasemaps()
  return basemapRegistry.getAll().map((b) => ({ id: b.id, label: b.label }))
}

/** True if a basemap id (built-in or plugin-contributed) is renderable. */
export function hasBasemap(id: string): boolean {
  ensureBuiltinBasemaps()
  return basemapRegistry.has(id)
}

/** True if the basemap needs the pmtiles:// protocol. Unknown → false. */
export function basemapUsesPmtiles(id: string): boolean {
  ensureBuiltinBasemaps()
  return basemapRegistry.get(id)?.usesPmtiles ?? false
}

/**
 * Registry-aware basemap style builder. Dispatches through the registry (so
 * plugin basemaps work) and falls back to the always-offline `blank` basemap
 * for an unknown id instead of throwing.
 */
export function resolveBasemapStyle(
  basemap: MapBasemapId | (string & {}),
  opts: { pmtilesUrl?: string } = {}
): MapStyle {
  ensureBuiltinBasemaps()
  const def = basemapRegistry.get(basemap) ?? basemapRegistry.get('blank')
  return def ? def.buildStyle(opts) : buildBasemapStyle('blank')
}
