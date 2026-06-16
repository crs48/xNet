import type { GeoFeatureCollection } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  createGeoJsonLayer,
  moveLayer,
  removeLayer,
  renameLayer,
  toggleLayerVisible,
  updateLayerStyle
} from './layers'

const points: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { name: 'A', pop: 1 }
    }
  ]
}

describe('createGeoJsonLayer', () => {
  it('infers geometry, assigns color, and collects popup keys', () => {
    const layer = createGeoJsonLayer('Cities', points, { index: 1 })
    expect(layer.name).toBe('Cities')
    expect(layer.style.geometry).toBe('point')
    expect(layer.visible).toBe(true)
    expect(layer.source.kind).toBe('geojson')
    expect(layer.popupProperties).toEqual(['name', 'pop'])
    expect(layer.id).toBeTruthy()
  })

  it('honors a geometry override and explicit color', () => {
    const layer = createGeoJsonLayer('X', points, { geometry: 'heatmap', color: '#123456' })
    expect(layer.style.geometry).toBe('heatmap')
    expect(layer.style.color).toBe('#123456')
  })
})

describe('layer list operations', () => {
  const a = createGeoJsonLayer('A', points)
  const b = createGeoJsonLayer('B', points)
  const c = createGeoJsonLayer('C', points)
  const list = [a, b, c]

  it('moveLayer reorders immutably', () => {
    expect(moveLayer(list, 0, 2).map((l) => l.name)).toEqual(['B', 'C', 'A'])
    expect(list.map((l) => l.name)).toEqual(['A', 'B', 'C']) // unchanged
  })

  it('moveLayer is a no-op for out-of-range indices', () => {
    expect(moveLayer(list, 0, 9)).toBe(list)
  })

  it('toggleLayerVisible flips one layer', () => {
    const next = toggleLayerVisible(list, b.id)
    expect(next.find((l) => l.id === b.id)?.visible).toBe(false)
    expect(next.find((l) => l.id === a.id)?.visible).toBe(true)
  })

  it('updateLayerStyle patches style', () => {
    const next = updateLayerStyle(list, a.id, { color: '#000000', size: 12 })
    expect(next[0].style.color).toBe('#000000')
    expect(next[0].style.size).toBe(12)
    expect(next[0].style.geometry).toBe('point')
  })

  it('renameLayer and removeLayer', () => {
    expect(renameLayer(list, c.id, 'Renamed').find((l) => l.id === c.id)?.name).toBe('Renamed')
    expect(removeLayer(list, b.id).map((l) => l.name)).toEqual(['A', 'C'])
  })
})
