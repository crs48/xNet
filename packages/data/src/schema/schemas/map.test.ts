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
})
