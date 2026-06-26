import { describe, expect, it } from 'vitest'
import { mapDocState } from './doc'
import { DEFAULT_VIEWPORT } from './style'

describe('mapDocState', () => {
  it('returns defaults for an absent node', () => {
    const state = mapDocState(undefined)
    expect(state.basemap).toBe('protomaps-light')
    expect(state.viewport).toEqual(DEFAULT_VIEWPORT)
    expect(state.layers).toEqual([])
    expect(state.title).toBe('')
  })

  it('passes through valid values', () => {
    const state = mapDocState({
      basemap: 'protomaps-dark',
      viewport: { longitude: 5, latitude: 6, zoom: 7 },
      layers: [],
      title: 'Logistics'
    })
    expect(state.basemap).toBe('protomaps-dark')
    expect(state.viewport).toEqual({ longitude: 5, latitude: 6, zoom: 7 })
    expect(state.title).toBe('Logistics')
  })

  it('passes through the satellite basemap', () => {
    expect(mapDocState({ basemap: 'satellite' }).basemap).toBe('satellite')
  })

  it('falls back to protomaps-light for an unknown basemap', () => {
    expect(mapDocState({ basemap: 'terrain-3d' }).basemap).toBe('protomaps-light')
  })
})
