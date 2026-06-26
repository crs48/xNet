import type { DID } from '../node'
import { describe, expect, it } from 'vitest'
import { MapSchema, type MapLayerSpec } from './map'

describe('MapSchema', () => {
  const testDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as DID

  it('has the expected schema identity', () => {
    expect(MapSchema.schema['@id']).toBe('xnet://xnet.fyi/Map@1.0.0')
    expect(MapSchema.schema.name).toBe('Map')
    expect(MapSchema.schema.version).toBe('1.0.0')
  })

  it('defines title, basemap, viewport, and layers properties', () => {
    const propIds = MapSchema.schema.properties.map((prop) => prop['@id'])

    expect(propIds).toContain('xnet://xnet.fyi/Map@1.0.0#title')
    expect(propIds).toContain('xnet://xnet.fyi/Map@1.0.0#basemap')
    expect(propIds).toContain('xnet://xnet.fyi/Map@1.0.0#viewport')
    expect(propIds).toContain('xnet://xnet.fyi/Map@1.0.0#layers')
  })

  it('creates a map with a basemap, viewport, and an inline GeoJSON layer', () => {
    const layer: MapLayerSpec = {
      id: 'l1',
      name: 'Cities',
      source: {
        kind: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [-74.006, 40.7128] },
              properties: { name: 'New York' }
            }
          ]
        }
      },
      style: { geometry: 'point', color: '#2f7ed8', opacity: 0.85, size: 5 },
      visible: true
    }

    const map = MapSchema.create(
      {
        title: 'Logistics',
        icon: '🗺️',
        basemap: 'protomaps-light',
        viewport: { longitude: -74, latitude: 40.7, zoom: 9 },
        layers: [layer]
      },
      { createdBy: testDID }
    )

    expect(map.title).toBe('Logistics')
    expect(map.basemap).toBe('protomaps-light')
    expect(map.viewport).toEqual({ longitude: -74, latitude: 40.7, zoom: 9 })
    expect(map.layers).toHaveLength(1)
    expect(map.layers?.[0]?.source.kind).toBe('geojson')
    expect(map.layers?.[0]?.style.color).toBe('#2f7ed8')
  })

  it('supports query, raster, and pmtiles layer sources (exploration 0230)', () => {
    const layers: MapLayerSpec[] = [
      {
        id: 'q',
        name: 'Accounts',
        source: {
          kind: 'query',
          schemaId: 'xnet://xnet.fyi/Account@1.0.0',
          latProperty: 'lat',
          lonProperty: 'lon',
          where: { status: 'active' },
          tooltip: ['name', 'status']
        },
        style: { geometry: 'point', color: '#19a979', size: 6 },
        visible: true
      },
      {
        id: 'r',
        name: 'Satellite',
        source: { kind: 'raster', tileUrl: 'https://x/{z}/{x}/{y}.png', tileSize: 256 },
        style: { geometry: 'fill', color: '#000000', opacity: 1 },
        visible: true
      },
      {
        id: 'p',
        name: 'Parcels',
        source: { kind: 'pmtiles', artifactCid: 'bafy123', sourceLayer: 'parcels' },
        style: { geometry: 'fill', color: '#945ecf', opacity: 0.4 },
        visible: false
      }
    ]

    const map = MapSchema.create(
      { title: 'Layers', basemap: 'protomaps-dark', layers },
      { createdBy: testDID }
    )

    expect(map.layers).toHaveLength(3)
    expect(map.layers?.map((l) => l.source.kind)).toEqual(['query', 'raster', 'pmtiles'])
  })
})
