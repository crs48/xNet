import { describe, expect, it } from 'vitest'
import {
  basemapPresets,
  basemapRegistry,
  basemapUsesPmtiles,
  ensureBuiltinBasemaps,
  hasBasemap,
  resolveBasemapStyle,
  type BasemapDefinition
} from './basemap-registry'

describe('basemapRegistry', () => {
  it('exposes the three built-in basemaps', () => {
    ensureBuiltinBasemaps()
    expect(hasBasemap('protomaps-light')).toBe(true)
    expect(hasBasemap('protomaps-dark')).toBe(true)
    expect(hasBasemap('blank')).toBe(true)
    const ids = basemapPresets().map((p) => p.id)
    expect(ids).toEqual(expect.arrayContaining(['protomaps-light', 'protomaps-dark', 'blank']))
  })

  it('marks pmtiles usage per basemap', () => {
    expect(basemapUsesPmtiles('protomaps-light')).toBe(true)
    expect(basemapUsesPmtiles('blank')).toBe(false)
    expect(basemapUsesPmtiles('does-not-exist')).toBe(false)
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
    const satellite: BasemapDefinition = {
      id: 'satellite',
      label: 'Satellite',
      usesPmtiles: false,
      buildStyle: () => ({
        version: 8,
        sources: { sat: { type: 'raster' } },
        layers: [{ id: 'sat', type: 'background' }]
      })
    }
    const disposable = basemapRegistry.register(satellite)
    try {
      expect(hasBasemap('satellite')).toBe(true)
      expect(basemapPresets().map((p) => p.id)).toContain('satellite')
      const style = resolveBasemapStyle('satellite')
      expect(style.sources).toHaveProperty('sat')
    } finally {
      disposable.dispose()
    }
    expect(hasBasemap('satellite')).toBe(false)
  })
})
