import { describe, expect, it } from 'vitest'
import { getCanvasResizePolicy } from '../selection/resize-policy'
import { createResizeUpdate } from '../selection/scene-operations'
import { createNode } from '../store'

describe('canvas resize policy', () => {
  it('sets object-specific minimum dimensions for source-backed objects and frames', () => {
    expect(getCanvasResizePolicy(createNode('page'), 'bottom-right')).toMatchObject({
      minWidth: 220,
      minHeight: 140,
      preserveAspectRatio: false
    })
    expect(getCanvasResizePolicy(createNode('database'), 'bottom-right')).toMatchObject({
      minWidth: 320,
      minHeight: 220,
      preserveAspectRatio: false
    })
    expect(getCanvasResizePolicy(createNode('note'), 'bottom-right')).toMatchObject({
      minWidth: 160,
      minHeight: 96,
      preserveAspectRatio: false
    })
    expect(
      getCanvasResizePolicy(
        createNode('group', undefined, {
          containerRole: 'frame'
        }),
        'bottom-right'
      )
    ).toMatchObject({
      minWidth: 320,
      minHeight: 220,
      preserveAspectRatio: false
    })
  })

  it('preserves image and video aspect ratios only from corner handles', () => {
    const image = createNode(
      'media',
      { width: 320, height: 160 },
      {
        kind: 'image'
      }
    )
    const youtube = createNode(
      'external-reference',
      { width: 480, height: 270 },
      {
        provider: 'youtube',
        kind: 'video'
      }
    )

    expect(getCanvasResizePolicy(image, 'bottom-right')).toMatchObject({
      minWidth: 96,
      minHeight: 96,
      preserveAspectRatio: true,
      aspectRatio: 2
    })
    expect(getCanvasResizePolicy(image, 'right')).toMatchObject({
      minWidth: 96,
      minHeight: 96,
      preserveAspectRatio: false
    })
    expect(getCanvasResizePolicy(youtube, 'bottom-right')).toMatchObject({
      minWidth: 320,
      minHeight: 180,
      preserveAspectRatio: true,
      aspectRatio: 16 / 9
    })
  })

  it('uses PDF, audio, social, and generic embed minimums without aspect locking', () => {
    expect(
      getCanvasResizePolicy(
        createNode('media', undefined, {
          mimeType: 'application/pdf'
        }),
        'bottom-right'
      )
    ).toMatchObject({
      minWidth: 240,
      minHeight: 320,
      preserveAspectRatio: false
    })

    expect(
      getCanvasResizePolicy(
        createNode('media', undefined, {
          kind: 'audio'
        }),
        'bottom-right'
      )
    ).toMatchObject({
      minWidth: 240,
      minHeight: 96,
      preserveAspectRatio: false
    })

    expect(
      getCanvasResizePolicy(
        createNode('external-reference', undefined, {
          kind: 'social'
        }),
        'bottom-right'
      )
    ).toMatchObject({
      minWidth: 260,
      minHeight: 320,
      preserveAspectRatio: false
    })

    expect(getCanvasResizePolicy(createNode('external-reference'), 'bottom-right')).toMatchObject({
      minWidth: 220,
      minHeight: 120,
      preserveAspectRatio: false
    })
  })

  it('feeds policy into resize update clamping', () => {
    const database = createNode('database', { x: 80, y: 60, width: 360, height: 260 })
    const update = createResizeUpdate(
      database,
      'left',
      { x: 220, y: 0 },
      getCanvasResizePolicy(database, 'left')
    )

    expect(update).toEqual({
      id: database.id,
      position: {
        x: 120,
        y: 60,
        width: 320,
        height: 260
      }
    })
  })
})
