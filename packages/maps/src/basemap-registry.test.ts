import { describe, expect, it } from 'vitest'
import {
  basemapPresets,
  basemapRegistry,
  basemapUsesPmtiles,
  ensureBuiltinBasemaps,
  hasBasemap,
  registerXyzBasemap,
  resolveBasemapStyle,
  type BasemapDefinition
} from './basemap-registry'

describe('basemapRegistry', () => {
  it('exposes the built-in basemaps (streets, satellite, blank)', () => {
    ensureBuiltinBasemaps()
    expect(hasBasemap('protomaps-light')).toBe(true)
    expect(hasBasemap('protomaps-dark')).toBe(true)
    expect(hasBasemap('satellite')).toBe(true)
    expect(hasBasemap('blank')).toBe(true)
    const ids = basemapPresets().map((p) => p.id)
    expect(ids).toEqual(
      expect.arrayContaining(['protomaps-light', 'protomaps-dark', 'satellite', 'blank'])
    )
  })

  it('marks pmtiles usage per basemap (vector basemaps only)', () => {
    expect(basemapUsesPmtiles('protomaps-light')).toBe(true)
    expect(basemapUsesPmtiles('satellite')).toBe(false)
    expect(basemapUsesPmtiles('blank')).toBe(false)
    expect(basemapUsesPmtiles('does-not-exist')).toBe(false)
  })

  it('resolves the satellite basemap to a raster source + layer', () => {
    const style = resolveBasemapStyle('satellite')
    expect(style.sources).toHaveProperty('raster-basemap')
    expect(style.layers.some((l) => l.type === 'raster')).toBe(true)
  })

  it('registers a plugin XYZ raster basemap via registerXyzBasemap', () => {
    const disposable = registerXyzBasemap({
      id: 'topo-custom',
      label: 'Topo',
      tiles: 'https://topo/{z}/{x}/{y}.png',
      attribution: 'Topo'
    })
    try {
      expect(hasBasemap('topo-custom')).toBe(true)
      expect(basemapUsesPmtiles('topo-custom')).toBe(false)
      const style = resolveBasemapStyle('topo-custom')
      expect(style.sources).toHaveProperty('raster-basemap')
    } finally {
      disposable.dispose()
    }
    expect(hasBasemap('topo-custom')).toBe(false)
  })

  it('repopulates built-ins after a clear (no permanent loss)', () => {
    basemapRegistry.clear()
    expect(hasBasemap('blank')).toBe(true)
  })

  it('resolves built-in styles', () => {
    const blank = resolveBasemapStyle('blank')
    expect(blank.layers[0]?.type).toBe('background')
    const streets = resolveBasemapStyle('protomaps-light')
    expect(streets.sources).toHaveProperty('protomaps')
  })

  it('falls back to the blank basemap for an unknown id', () => {
    const style = resolveBasemapStyle('mystery-tiles')
    // blank style has no vector sources
    expect(style.sources).toEqual({})
  })

  it('lets a plugin register a new basemap with no core change', () => {
    const custom: BasemapDefinition = {
      id: 'mystery',
      label: 'Mystery',
      usesPmtiles: false,
      buildStyle: () => ({
        version: 8,
        sources: { sat: { type: 'raster' } },
        layers: [{ id: 'sat', type: 'background' }]
      })
    }
    const disposable = basemapRegistry.register(custom)
    try {
      expect(hasBasemap('mystery')).toBe(true)
      expect(basemapPresets().map((p) => p.id)).toContain('mystery')
      const style = resolveBasemapStyle('mystery')
      expect(style.sources).toHaveProperty('sat')
    } finally {
      disposable.dispose()
    }
    expect(hasBasemap('mystery')).toBe(false)
  })
})
