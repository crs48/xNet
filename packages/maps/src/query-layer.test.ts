import { describe, expect, it, vi } from 'vitest'
import {
  buildQueryRequest,
  featureFromNode,
  materializeQueryLayer,
  querySourceFields,
  type QueryLayerNode,
  type QuerySource
} from './query-layer'

const SRC: QuerySource = {
  kind: 'query',
  schemaId: 'xnet://xnet.fyi/Account@1.0.0',
  latProperty: 'lat',
  lonProperty: 'lon',
  where: { status: 'active' },
  tooltip: ['name', 'status']
}

describe('querySourceFields', () => {
  it('falls back to lat/lon defaults', () => {
    expect(querySourceFields({ kind: 'query', schemaId: 's' })).toEqual({ lat: 'lat', lon: 'lon' })
    expect(querySourceFields(SRC)).toEqual({ lat: 'lat', lon: 'lon' })
  })
})

describe('buildQueryRequest', () => {
  it('builds a spatial window over the lat/lon properties from bounds', () => {
    const req = buildQueryRequest(SRC, [-10, 20, 30, 50])
    expect(req.schemaId).toBe('xnet://xnet.fyi/Account@1.0.0')
    expect(req.where).toEqual({ status: 'active' })
    expect(req.spatial).toEqual({
      kind: 'window',
      rect: { x: -10, y: 20, width: 40, height: 30 },
      fields: { x: 'lon', y: 'lat' }
    })
    expect(req.geohashCells.length).toBeGreaterThan(0)
  })

  it('omits where when the source has none', () => {
    const req = buildQueryRequest({ kind: 'query', schemaId: 's' }, [0, 0, 1, 1])
    expect('where' in req).toBe(false)
  })
})

describe('featureFromNode', () => {
  it('maps a node to a Point feature with only tooltip properties', () => {
    const node: QueryLayerNode = {
      id: 'n1',
      properties: { lat: 40.7, lon: -74, name: 'NYC', status: 'active', secret: 'x' }
    }
    expect(featureFromNode(node, SRC)).toEqual({
      type: 'Feature',
      id: 'n1',
      geometry: { type: 'Point', coordinates: [-74, 40.7] },
      properties: { name: 'NYC', status: 'active' }
    })
  })

  it('keeps all properties when no tooltip is set', () => {
    const node: QueryLayerNode = { id: 'n', properties: { lat: 1, lon: 2, a: 1 } }
    const f = featureFromNode(node, { kind: 'query', schemaId: 's' })
    expect(f?.properties).toEqual({ lat: 1, lon: 2, a: 1 })
  })

  it('coerces numeric strings and rejects rows without coordinates', () => {
    expect(featureFromNode({ id: 'a', properties: { lat: '40', lon: '-74' } }, SRC)).not.toBeNull()
    expect(featureFromNode({ id: 'b', properties: { lat: 40 } }, SRC)).toBeNull()
    expect(featureFromNode({ id: 'c', properties: { lat: 'nope', lon: 1 } }, SRC)).toBeNull()
  })
})

describe('materializeQueryLayer', () => {
  it('runs the request and collects valid features', async () => {
    const run = vi.fn(async () => [
      { id: '1', properties: { lat: 40.7, lon: -74, name: 'NYC', status: 'active' } },
      { id: '2', properties: { lat: 51.5, lon: -0.1, name: 'London', status: 'active' } },
      { id: '3', properties: { name: 'no-coords' } } // dropped
    ])
    const fc = await materializeQueryLayer(SRC, [-180, -85, 180, 85], run)
    expect(run).toHaveBeenCalledOnce()
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toHaveLength(2)
    expect(fc.features[0]?.geometry).toEqual({ type: 'Point', coordinates: [-74, 40.7] })
  })

  it('returns an empty collection when the runner returns nothing', async () => {
    const fc = await materializeQueryLayer(SRC, [0, 0, 1, 1], async () => [])
    expect(fc.features).toEqual([])
  })
})
