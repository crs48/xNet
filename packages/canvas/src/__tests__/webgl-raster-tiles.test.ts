/**
 * WebGL raster tile quad renderer tests.
 */

import type { RasterTileRef } from '@xnetjs/canvas-core'
import { describe, expect, it, vi } from 'vitest'
import {
  createRasterTileDrawPlan,
  createWebGLRasterTileRenderer,
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

  it('returns null instead of throwing when WebGL2 is unavailable', () => {
    const getContextSpy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => null)
    const container = document.createElement('div')

    expect(createWebGLRasterTileRenderer(container, () => null)).toBeNull()

    getContextSpy.mockRestore()
  })
})
