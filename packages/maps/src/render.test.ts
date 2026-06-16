import type { MapLayerSpec } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  layerSpecIdFromMapLayerId,
  ownedLayerIds,
  ownedSourceIds,
  planDataLayers,
  popupTableHtml
} from './style'

const geoLayer = (id: string, visible = true): MapLayerSpec => ({
  id,
  name: id,
  source: {
    kind: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }
      ]
    }
  },
  style: { geometry: 'point', color: '#123456' },
  visible
})

describe('ownedLayerIds / ownedSourceIds', () => {
  it('select only our prefixed ids', () => {
    expect(ownedLayerIds(['background', 'water', 'xnet-a-point', 'xnet-b-fill'])).toEqual([
      'xnet-a-point',
      'xnet-b-fill'
    ])
    expect(ownedSourceIds(['protomaps', 'xnet-src-a', 'xnet-src-b'])).toEqual([
      'xnet-src-a',
      'xnet-src-b'
    ])
  })
})

describe('planDataLayers', () => {
  it('plans visible inline-geojson layers and skips hidden ones', () => {
    const plans = planDataLayers([geoLayer('a'), geoLayer('b', false)])
    expect(plans).toHaveLength(1)
    expect(plans[0].sourceId).toBe('xnet-src-a')
    expect(plans[0].data.features).toHaveLength(1)
    expect(plans[0].layers[0].type).toBe('circle')
  })

  it('skips non-geojson sources (reserved query/dataset layers)', () => {
    const queryLayer: MapLayerSpec = {
      id: 'q',
      name: 'q',
      source: { kind: 'query', schemaId: 'x' },
      style: { geometry: 'point', color: '#000' },
      visible: true
    }
    expect(planDataLayers([queryLayer])).toHaveLength(0)
  })
})

describe('layerSpecIdFromMapLayerId', () => {
  it('recovers the layer-spec id from a maplibre layer id', () => {
    expect(layerSpecIdFromMapLayerId('xnet-abc-point')).toBe('abc')
    expect(layerSpecIdFromMapLayerId('xnet-x1y2-outline')).toBe('x1y2')
    expect(layerSpecIdFromMapLayerId('xnet-z-heatmap')).toBe('z')
  })
})

describe('popupTableHtml', () => {
  it('renders a property table and escapes HTML', () => {
    const html = popupTableHtml({ name: 'A&B', note: '<script>' })
    expect(html).toContain('A&amp;B')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })
})
