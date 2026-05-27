import type { CanvasObjectRecord } from '@xnetjs/canvas-core'
import { describe, expect, it } from 'vitest'
import {
  applyCanvasPreviewTileSummaryUpdateToTileDoc,
  createCanvasPreviewModel,
  createCanvasPreviewTileSummaryUpdate,
  createCanvasThumbnailOutput,
  createCanvasTileDoc,
  ensureCanvasTileDocMaps,
  applyCanvasPreviewTileSummaryUpdate
} from '../index'

function createObject(id: string): CanvasObjectRecord {
  return {
    id,
    kind: 'media',
    position: { x: 0, y: 0, width: 320, height: 180 },
    display: {},
    preview: {
      title: 'Old title',
      subtitle: 'Old subtitle',
      sourceVersion: '1',
      thumbnailHash: 'thumbnail:old'
    }
  }
}

describe('canvas preview tile summary updates', () => {
  it('projects preview metadata into compact tile summary fields', () => {
    const sourceRef = {
      nodeId: 'media-1',
      schemaId: 'xnet://xnet.fyi/MediaAsset@1.0.0',
      version: 2,
      contentHash: 'hash-2'
    }
    const thumbnail = createCanvasThumbnailOutput({
      kind: 'image',
      title: 'Launch diagram',
      subtitle: 'PNG image',
      sourceRef,
      imageUrl: 'blob:image-1'
    })
    const update = createCanvasPreviewTileSummaryUpdate(
      createCanvasPreviewModel({
        objectId: 'object-1',
        objectKind: 'media',
        sourceRef,
        summary: {
          title: 'Launch diagram',
          subtitle: 'PNG image'
        },
        thumbnail
      })
    )

    expect(update).toEqual({
      objectId: 'object-1',
      preview: {
        title: 'Launch diagram',
        subtitle: 'PNG image',
        sourceVersion: '2',
        thumbnailHash: 'thumbnail:image:media-1:xnet://xnet.fyi/MediaAsset@1.0.0:2:hash-2'
      }
    })
  })

  it('updates matching tile object records without mutating unrelated objects', () => {
    const object = createObject('object-1')
    const update = {
      objectId: 'object-1',
      preview: {
        title: 'New title',
        subtitle: 'New subtitle',
        sourceVersion: '2',
        thumbnailHash: 'thumbnail:new'
      }
    }

    const updated = applyCanvasPreviewTileSummaryUpdate(object, update)

    expect(updated).not.toBe(object)
    expect(updated.preview).toEqual(update.preview)
    expect(applyCanvasPreviewTileSummaryUpdate(updated, update)).toBe(updated)
    expect(applyCanvasPreviewTileSummaryUpdate(object, { ...update, objectId: 'other' })).toBe(
      object
    )
  })

  it('applies preview metadata updates to tile docs in one transaction', () => {
    const doc = createCanvasTileDoc({ tileId: '0/0/0', createdAt: 1_000 })
    const maps = ensureCanvasTileDocMaps(doc)
    const object = createObject('object-1')
    const update = {
      objectId: 'object-1',
      preview: {
        title: 'Ready preview',
        subtitle: 'PDF',
        sourceVersion: '3',
        thumbnailHash: 'thumbnail:pdf:3'
      }
    }

    maps.objects.set(object.id, object)

    expect(applyCanvasPreviewTileSummaryUpdateToTileDoc(doc, update)).toMatchObject({
      id: 'object-1',
      preview: update.preview
    })
    expect(maps.objects.get('object-1')?.preview).toEqual(update.preview)
    expect(
      applyCanvasPreviewTileSummaryUpdateToTileDoc(doc, { ...update, objectId: 'missing' })
    ).toBeNull()
  })
})
