/**
 * WebGL raster tile quad renderer tests.
 */

import type { RasterTileRef } from '@xnetjs/canvas-core'
import { describe, expect, it, vi } from 'vitest'
import {
  createRasterTileDrawPlan,
  createWebGLRasterTileRenderer,
  measureRasterTileTexturePressure,
  RasterTileTextureLru
} from '../layers/webgl-raster-tiles'

function createRasterTile(overrides: Partial<RasterTileRef> = {}): RasterTileRef {
  return {
    tileId: '0/2/3',
    sourceEpoch: 'epoch-1',
    textureKey: 'texture-1',
    stale: false,
    ...overrides
  }
}

describe('WebGL raster tile helpers', () => {
  it('plans raster tile quads from tile ids', () => {
    const plan = createRasterTileDrawPlan({
      tiles: [createRasterTile()],
      nowMs: 100,
      crossfadeMs: 0
    })

    expect(plan.drawItems).toEqual([
      {
        tileId: '0/2/3',
        textureKey: 'texture-1',
        sourceEpoch: 'epoch-1',
        rect: { x: 8192, y: 12288, width: 4096, height: 4096 },
        opacity: 1,
        stale: false,
        retiring: false
      }
    ])
  })

  it('crossfades from stale tile textures to fresh replacements', () => {
    const stalePlan = createRasterTileDrawPlan({
      tiles: [
        createRasterTile({
          sourceEpoch: 'epoch-stale',
          textureKey: 'texture-stale',
          stale: true
        })
      ],
      nowMs: 0,
      crossfadeMs: 100,
      staleOpacity: 0.5
    })
    const freshStart = createRasterTileDrawPlan({
      tiles: [createRasterTile({ sourceEpoch: 'epoch-fresh', textureKey: 'texture-fresh' })],
      previous: stalePlan.state,
      nowMs: 100,
      crossfadeMs: 100,
      staleOpacity: 0.5
    })
    const freshMidway = createRasterTileDrawPlan({
      tiles: [createRasterTile({ sourceEpoch: 'epoch-fresh', textureKey: 'texture-fresh' })],
      previous: freshStart.state,
      nowMs: 150,
      crossfadeMs: 100,
      staleOpacity: 0.5
    })

    expect(freshStart.drawItems.map((item) => [item.textureKey, item.opacity])).toEqual([
      ['texture-stale', 1]
    ])
    expect(freshMidway.drawItems.map((item) => [item.textureKey, item.opacity])).toEqual([
      ['texture-stale', 0.5],
      ['texture-fresh', 0.5]
    ])
  })

  it('caps stale active tile opacity', () => {
    const plan = createRasterTileDrawPlan({
      tiles: [createRasterTile({ stale: true })],
      nowMs: 100,
      crossfadeMs: 100,
      staleOpacity: 0.42
    })

    expect(plan.drawItems[0].opacity).toBe(0.42)

    const faded = createRasterTileDrawPlan({
      tiles: [createRasterTile({ stale: true })],
      previous: plan.state,
      nowMs: 200,
      crossfadeMs: 100,
      staleOpacity: 0.42
    })

    expect(faded.drawItems[0].opacity).toBe(0.42)
  })

  it('evicts least recently used textures when over budget', () => {
    const lru = new RasterTileTextureLru<string>(10)

    expect(lru.upsert('a', 'texture-a', 4, 0)).toEqual([])
    expect(lru.upsert('b', 'texture-b', 4, 1)).toEqual([])
    expect(lru.get('a', 2)).toBe('texture-a')
    expect(lru.upsert('c', 'texture-c', 4, 3)).toEqual(['texture-b'])
    expect(lru.get('b', 4)).toBeNull()
    expect(lru.sizeBytes).toBe(8)
  })

  it('measures texture memory pressure and forced cache eviction', () => {
    const measurement = measureRasterTileTexturePressure({
      maxTextureBytes: 10,
      forcedEvictionBytes: 4,
      records: [
        { key: 'a', bytes: 4, lastUsedAtMs: 0 },
        { key: 'b', bytes: 4, lastUsedAtMs: 1 },
        { key: 'c', bytes: 4, lastUsedAtMs: 2 },
        { key: 'd', bytes: 2, lastUsedAtMs: 3 }
      ]
    })

    expect(measurement.peakProjectedBytes).toBe(12)
    expect(measurement.evictedKeys).toEqual(['a'])
    expect(measurement.forcedEvictedKeys).toEqual(['b', 'c'])
    expect(measurement.finalBytes).toBe(2)
    expect(measurement.retainedCount).toBe(1)
    expect(measurement.samples.map((sample) => sample.sizeBytes)).toEqual([4, 8, 8, 10])
  })

  it('can force-evict cached textures below the constructor budget', () => {
    const lru = new RasterTileTextureLru<string>(12)

    lru.upsert('a', 'texture-a', 4, 0)
    lru.upsert('b', 'texture-b', 4, 1)
    lru.upsert('c', 'texture-c', 4, 2)

    expect(lru.evictToBudget(4)).toEqual(['texture-a', 'texture-b'])
    expect(lru.sizeBytes).toBe(4)
    expect(lru.get('c', 3)).toBe('texture-c')
  })

  it('returns null instead of throwing when WebGL2 is unavailable', () => {
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => null)
    const container = document.createElement('div')

    expect(createWebGLRasterTileRenderer(container, () => null)).toBeNull()

    getContextSpy.mockRestore()
  })
})
