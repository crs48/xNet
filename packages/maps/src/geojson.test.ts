import { describe, expect, it } from 'vitest'
import {
  featureCollectionBounds,
  featurePropertyKeys,
  inferLayerGeometry,
  normalizeToFeatureCollection,
  parseCsv,
  parseCsvToFeatures,
  parseGeoJson
} from './geojson'

const point = (lng: number, lat: number, props: Record<string, unknown> = {}) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [lng, lat] },
  properties: props
})

describe('parseGeoJson', () => {
  it('passes a FeatureCollection through', () => {
    const fc = { type: 'FeatureCollection', features: [point(1, 2), point(3, 4)] }
    expect(parseGeoJson(JSON.stringify(fc)).features).toHaveLength(2)
  })

  it('wraps a single Feature', () => {
    expect(parseGeoJson(JSON.stringify(point(5, 6))).features).toHaveLength(1)
  })

  it('wraps a bare Geometry', () => {
    const geom = { type: 'Point', coordinates: [7, 8] }
    const fc = parseGeoJson(JSON.stringify(geom))
    expect(fc.features[0].geometry?.coordinates).toEqual([7, 8])
    expect(fc.features[0].properties).toEqual({})
  })

  it('accepts an array of features', () => {
    expect(parseGeoJson(JSON.stringify([point(1, 1), point(2, 2)])).features).toHaveLength(2)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseGeoJson('{not json')).toThrow(/Invalid JSON/)
  })

  it('throws when no features are present', () => {
    expect(() => normalizeToFeatureCollection({ foo: 'bar' })).toThrow(/No GeoJSON features/)
  })
})

describe('parseCsvToFeatures', () => {
  it('auto-detects lat/lon and carries other columns as properties', () => {
    const csv = 'name,latitude,longitude,pop\nAlpha,10,20,5\nBeta,-3.5,4.25,9'
    const { collection, latField, lonField, skipped } = parseCsvToFeatures(csv)
    expect(latField).toBe('latitude')
    expect(lonField).toBe('longitude')
    expect(skipped).toBe(0)
    expect(collection.features).toHaveLength(2)
    // GeoJSON order is [lon, lat]
    expect(collection.features[0].geometry?.coordinates).toEqual([20, 10])
    expect(collection.features[0].properties).toEqual({ name: 'Alpha', pop: '5' })
  })

  it('supports lat/lng and lon aliases', () => {
    const csv = 'lat,lng\n1,2'
    expect(parseCsvToFeatures(csv).collection.features[0].geometry?.coordinates).toEqual([2, 1])
  })

  it('skips rows with non-numeric coordinates', () => {
    const csv = 'lat,lon\n1,2\nx,y\n3,4'
    const res = parseCsvToFeatures(csv)
    expect(res.collection.features).toHaveLength(2)
    expect(res.skipped).toBe(1)
  })

  it('honors explicit field overrides', () => {
    const csv = 'a,b\n10,20'
    const res = parseCsvToFeatures(csv, { latField: 'a', lonField: 'b' })
    expect(res.collection.features[0].geometry?.coordinates).toEqual([20, 10])
  })

  it('throws when no coordinate columns are found', () => {
    expect(() => parseCsvToFeatures('name,value\nx,1')).toThrow(/latitude\/longitude/)
  })
})

describe('parseCsv', () => {
  it('handles quoted fields with commas and escaped quotes', () => {
    const csv = 'a,b\n"hello, world","she said ""hi"""'
    const { headers, rows } = parseCsv(csv)
    expect(headers).toEqual(['a', 'b'])
    expect(rows[0]).toEqual(['hello, world', 'she said "hi"'])
  })

  it('handles CRLF line endings', () => {
    const { rows } = parseCsv('a,b\r\n1,2\r\n3,4')
    expect(rows).toEqual([
      ['1', '2'],
      ['3', '4']
    ])
  })
})

describe('geometry helpers', () => {
  it('computes bounds across features', () => {
    const fc = { type: 'FeatureCollection' as const, features: [point(-10, -5), point(10, 5)] }
    expect(featureCollectionBounds(fc)).toEqual([-10, -5, 10, 5])
  })

  it('returns null bounds for empty geometry', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [{ type: 'Feature' as const, geometry: null, properties: {} }]
    }
    expect(featureCollectionBounds(fc)).toBeNull()
  })

  it('infers fill for polygons, line for linestrings, point for points', () => {
    const poly = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0]
              ]
            ]
          },
          properties: {}
        }
      ]
    }
    expect(inferLayerGeometry(poly)).toBe('fill')
    const line = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [
              [0, 0],
              [1, 1]
            ]
          },
          properties: {}
        }
      ]
    }
    expect(inferLayerGeometry(line)).toBe('line')
    expect(inferLayerGeometry({ type: 'FeatureCollection', features: [point(0, 0)] })).toBe('point')
  })

  it('collects distinct property keys', () => {
    const fc = {
      type: 'FeatureCollection' as const,
      features: [point(0, 0, { a: 1, b: 2 }), point(1, 1, { b: 3, c: 4 })]
    }
    expect(featurePropertyKeys(fc).sort()).toEqual(['a', 'b', 'c'])
  })
})
