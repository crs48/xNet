/**
 * WebGL vector aggregate tile renderer tests.
 */

import type { CanvasTileSummary, VectorTilePayload } from '@xnetjs/canvas-core'
import { describe, expect, it, vi } from 'vitest'
import {
  createVectorTileInstances,
  createWebGLVectorTileRenderer,
  isWebGL2Available,
  packVectorTileInstances,
  VECTOR_TILE_INSTANCE_FLOATS
} from '../layers/webgl-vector-tiles'

function createSummary(overrides: Partial<CanvasTileSummary> = {}): CanvasTileSummary {
  return {
    tileId: '0/0/0',
    address: { z: 0, x: 0, y: 0 },
    bounds: { x: 0, y: 0, width: 256, height: 256 },
    objectCount: 10,
    edgeCount: 0,
    typeCounts: { page: 7, shape: 3 },
    density: { columns: 1, rows: 1, values: [10] },
    clusters: [],
    activePresenceCount: 0,
    dirty: false,
    stale: false,
    ...overrides
  }
}

function createTile(summary: CanvasTileSummary): VectorTilePayload {
  return {
    tileId: summary.tileId,
    summary
  }
}

describe('WebGL vector tile helpers', () => {
  it('creates one instance per cluster for aggregate tiles', () => {
    const instances = createVectorTileInstances([
      createTile(
        createSummary({
          clusters: [
            {
              id: 'cluster-1',
              bounds: { x: 10, y: 20, width: 30, height: 40 },
              objectCount: 4,
              dominantKind: 'page',
              sampleObjectIds: ['a']
            },
            {
              id: 'cluster-2',
              bounds: { x: 70, y: 80, width: 90, height: 100 },
              objectCount: 40,
              dominantKind: 'database',
              sampleObjectIds: ['b']
            }
          ]
        })
      )
    ])

    expect(instances.map((instance) => instance.rect)).toEqual([
      { x: 10, y: 20, width: 30, height: 40 },
      { x: 70, y: 80, width: 90, height: 100 }
    ])
    expect(instances[0].color[3]).toBeLessThan(instances[1].color[3])
  })

  it('falls back to tile bounds when no clusters are available', () => {
    const [instance] = createVectorTileInstances([createTile(createSummary())])

    expect(instance.rect).toEqual({ x: 0, y: 0, width: 256, height: 256 })
    expect(instance.color[3]).toBeGreaterThan(0)
  })

  it('packs instances into interleaved rect and color floats', () => {
    const packed = packVectorTileInstances([
      {
        tileId: '0/0/0',
        rect: { x: 1, y: 2, width: 3, height: 4 },
        color: [0.1, 0.2, 0.3, 0.4]
      }
    ])

    expect(packed).toHaveLength(VECTOR_TILE_INSTANCE_FLOATS)
    expect(Array.from(packed)).toEqual([
      1,
      2,
      3,
      4,
      expect.closeTo(0.1),
      expect.closeTo(0.2),
      expect.closeTo(0.3),
      expect.closeTo(0.4)
    ])
  })

  it('returns null instead of throwing when WebGL2 is unavailable', () => {
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => null)
    const container = document.createElement('div')

    expect(isWebGL2Available()).toBe(false)
    expect(createWebGLVectorTileRenderer(container)).toBeNull()

    getContextSpy.mockRestore()
  })
})
