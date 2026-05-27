/**
 * WebGL thumbnail sprite renderer tests.
 */

import type { CanvasObjectKind, ThumbnailSpritePayload } from '@xnetjs/canvas-core'
import { describe, expect, it, vi } from 'vitest'
import {
  createThumbnailInvalidationKey,
  createThumbnailSpriteInstances,
  createWebGLThumbnailSpriteRenderer,
  packThumbnailAtlases,
  packThumbnailSpriteInstances,
  THUMBNAIL_SPRITE_INSTANCE_FLOATS
} from '../layers/webgl-thumbnail-sprites'

describe('WebGL thumbnail sprite helpers', () => {
  it('packs thumbnails into deterministic atlas pages', () => {
    const result = packThumbnailAtlases(
      [
        {
          objectId: 'page-1',
          kind: 'page',
          tileId: '0/0/0',
          bounds: { x: 0, y: 0, width: 200, height: 120 },
          pixelSize: { width: 32, height: 32 },
          sourceVersion: 'v1',
          thumbnailHash: 'hash-1'
        },
        {
          objectId: 'page-2',
          kind: 'page',
          tileId: '0/0/0',
          bounds: { x: 240, y: 0, width: 200, height: 120 },
          pixelSize: { width: 32, height: 16 },
          sourceVersion: 'v1',
          thumbnailHash: 'hash-2'
        },
        {
          objectId: 'page-3',
          kind: 'page',
          tileId: '0/0/1',
          bounds: { x: 0, y: 200, width: 200, height: 120 },
          pixelSize: { width: 128, height: 128 },
          sourceVersion: 'v1'
        }
      ],
      { atlasWidth: 70, atlasHeight: 70, padding: 2, atlasKeyPrefix: 'atlas' }
    )

    expect(result.unplaced.map((source) => source.objectId)).toEqual(['page-3'])
    expect(result.atlases).toHaveLength(1)
    expect(result.atlases[0].sprites.map((sprite) => sprite.atlasKey)).toEqual([
      'atlas-0',
      'atlas-0'
    ])
    expect(result.atlases[0].sprites.map((sprite) => sprite.uv)).toEqual([
      { x: 2 / 70, y: 2 / 70, width: 32 / 70, height: 32 / 70 },
      { x: 36 / 70, y: 2 / 70, width: 32 / 70, height: 16 / 70 }
    ])
  })

  it('creates invalidation keys from source version, thumbnail hash, size, and bounds', () => {
    const base = {
      objectId: 'page-1',
      kind: 'page' as const,
      tileId: '0/0/0',
      bounds: { x: 0, y: 0, width: 200, height: 120 },
      pixelSize: { width: 32, height: 32 },
      sourceVersion: 'v1',
      thumbnailHash: 'hash-1'
    }

    expect(createThumbnailInvalidationKey(base)).toBe('page-1:page:v1:hash-1:32:32:0,0,200,120')
    expect(
      createThumbnailInvalidationKey({
        ...base,
        thumbnailHash: 'hash-2'
      })
    ).not.toBe(createThumbnailInvalidationKey(base))
  })

  it('invalidates pages, databases, media, and external references independently', () => {
    const kinds: readonly CanvasObjectKind[] = ['page', 'database', 'media', 'external-reference']
    const sources = kinds.map((kind) => ({
      objectId: `${kind}-1`,
      kind,
      tileId: '0/0/0',
      bounds: { x: 0, y: 0, width: 320, height: 180 },
      pixelSize: { width: 160, height: 90 },
      sourceVersion: `${kind}:v1`,
      thumbnailHash: `${kind}:hash-1`
    }))
    const keys = sources.map(createThumbnailInvalidationKey)

    expect(new Set(keys).size).toBe(kinds.length)

    sources.forEach((source) => {
      const baseKey = createThumbnailInvalidationKey(source)

      expect(
        createThumbnailInvalidationKey({ ...source, sourceVersion: `${source.kind}:v2` })
      ).not.toBe(baseKey)
      expect(
        createThumbnailInvalidationKey({ ...source, thumbnailHash: `${source.kind}:hash-2` })
      ).not.toBe(baseKey)
      expect(
        createThumbnailInvalidationKey({
          ...source,
          pixelSize: { width: source.pixelSize.width * 2, height: source.pixelSize.height }
        })
      ).not.toBe(baseKey)
      expect(
        createThumbnailInvalidationKey({
          ...source,
          bounds: { ...source.bounds, width: source.bounds.width + 1 }
        })
      ).not.toBe(baseKey)
    })
  })

  it('uses atlas invalidation keys when creating sprite instances', () => {
    const sprites: ThumbnailSpritePayload[] = [
      {
        objectId: 'page-1',
        tileId: '0/0/0',
        atlasKey: 'atlas-0',
        bounds: { x: 1, y: 2, width: 3, height: 4 },
        uv: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
      }
    ]

    expect(createThumbnailSpriteInstances(sprites, { 'page-1': 'key-1' })[0]).toEqual({
      objectId: 'page-1',
      tileId: '0/0/0',
      atlasKey: 'atlas-0',
      rect: { x: 1, y: 2, width: 3, height: 4 },
      uv: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      invalidationKey: 'key-1'
    })
  })

  it('packs sprite instances into interleaved rect and uv floats', () => {
    const packed = packThumbnailSpriteInstances([
      {
        objectId: 'page-1',
        tileId: '0/0/0',
        atlasKey: 'atlas-0',
        rect: { x: 1, y: 2, width: 3, height: 4 },
        uv: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        invalidationKey: 'key-1'
      }
    ])

    expect(packed).toHaveLength(THUMBNAIL_SPRITE_INSTANCE_FLOATS)
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

    expect(createWebGLThumbnailSpriteRenderer(container, () => null)).toBeNull()

    getContextSpy.mockRestore()
  })
})
