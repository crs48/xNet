import type { MapLayerSpec } from '@xnetjs/data'
import { describe, expect, it } from 'vitest'
import {
  PROTOMAPS_DEMO_PMTILES,
  buildBasemapStyle,
  buildDataLayers,
  dataSourceId,
  paletteColor,
  planRasterLayers
} from './style'

const layer = (style: MapLayerSpec['style']): MapLayerSpec => ({
  id: 'abc',
  name: 'Test',
  source: { kind: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  style,
  visible: true
})

describe('buildBasemapStyle', () => {
  it('blank has only a background layer and no sources', () => {
    const style = buildBasemapStyle('blank')
    expect(Object.keys(style.sources)).toHaveLength(0)
    expect(style.layers).toHaveLength(1)
    expect(style.layers[0].type).toBe('background')
  })

  it('protomaps-light uses a pmtiles vector source and demo url by default', () => {
    const style = buildBasemapStyle('protomaps-light')
    const source = style.sources.protomaps as { type: string; url: string }
    expect(source.type).toBe('vector')
    expect(source.url).toBe(`pmtiles://${PROTOMAPS_DEMO_PMTILES}`)
    const ids = style.layers.map((l) => l.id)
    expect(ids).toEqual(expect.arrayContaining(['earth', 'water', 'roads', 'buildings']))
  })

  it('respects a custom pmtiles url', () => {
    const style = buildBasemapStyle('protomaps-light', {
      pmtilesUrl: 'https://tiles.xnet.fyi/x.pmtiles'
    })
    expect((style.sources.protomaps as { url: string }).url).toBe(
      'pmtiles://https://tiles.xnet.fyi/x.pmtiles'
    )
  })

  it('dark differs from light in background color', () => {
    const light = buildBasemapStyle('protomaps-light').layers[0].paint?.['background-color']
    const dark = buildBasemapStyle('protomaps-dark').layers[0].paint?.['background-color']
    expect(light).not.toBe(dark)
  })
})

describe('buildDataLayers', () => {
  it('point → a single circle layer with color/size/opacity', () => {
    const layers = buildDataLayers(
      layer({ geometry: 'point', color: '#ff0000', size: 8, opacity: 0.5 })
    )
    expect(layers).toHaveLength(1)
    expect(layers[0].type).toBe('circle')
    expect(layers[0].source).toBe(dataSourceId(layer({ geometry: 'point', color: '#ff0000' })))
    expect(layers[0].paint?.['circle-color']).toBe('#ff0000')
    expect(layers[0].paint?.['circle-radius']).toBe(8)
    expect(layers[0].paint?.['circle-opacity']).toBe(0.5)
  })

  it('line → a single line layer', () => {
    const layers = buildDataLayers(layer({ geometry: 'line', color: '#00ff00', size: 3 }))
    expect(layers).toHaveLength(1)
    expect(layers[0].type).toBe('line')
    expect(layers[0].paint?.['line-width']).toBe(3)
  })

  it('fill → fill + outline layers', () => {
    const layers = buildDataLayers(layer({ geometry: 'fill', color: '#0000ff' }))
    expect(layers.map((l) => l.type)).toEqual(['fill', 'line'])
    expect(layers[0].paint?.['fill-color']).toBe('#0000ff')
  })

  it('heatmap → a heatmap layer with a density color ramp', () => {
    const layers = buildDataLayers(layer({ geometry: 'heatmap', color: '#abcdef' }))
    expect(layers).toHaveLength(1)
    expect(layers[0].type).toBe('heatmap')
    expect(JSON.stringify(layers[0].paint?.['heatmap-color'])).toContain('#abcdef')
  })
})

describe('paletteColor', () => {
  it('wraps around the palette', () => {
    expect(paletteColor(0)).toBe(paletteColor(8))
    expect(paletteColor(0)).not.toBe(paletteColor(1))
  })
})

describe('planRasterLayers', () => {
  const raster = (over: Partial<MapLayerSpec> = {}): MapLayerSpec => ({
    id: 'sat',
    name: 'Satellite',
    source: { kind: 'raster', tileUrl: 'https://x/{z}/{x}/{y}.png', tileSize: 512 },
    style: { geometry: 'fill', color: '#000', opacity: 0.6 },
    visible: true,
    ...over
  })

  it('plans a raster source + raster paint layer honoring opacity', () => {
    const [plan] = planRasterLayers([raster()])
    expect(plan.sourceId).toBe(dataSourceId(raster()))
    expect(plan.tileUrl).toBe('https://x/{z}/{x}/{y}.png')
    expect(plan.tileSize).toBe(512)
    expect(plan.layer.type).toBe('raster')
    expect(plan.layer.paint?.['raster-opacity']).toBe(0.6)
  })

  it('defaults tileSize to 256 and skips hidden / non-raster layers', () => {
    const plans = planRasterLayers([
      raster({ source: { kind: 'raster', tileUrl: 'u' } }),
      raster({ id: 'hidden', visible: false }),
      {
        id: 'geo',
        name: 'Geo',
        source: { kind: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        style: { geometry: 'point', color: '#000' },
        visible: true
      }
    ])
    expect(plans).toHaveLength(1)
    expect(plans[0].tileSize).toBe(256)
  })
})
