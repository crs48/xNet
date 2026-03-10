import type { CanvasEdge } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createCanvasObjectAnchorId,
  normalizeCanvasEdgeBindings,
  resolveCanvasAnchorPoint
} from './bindings'

describe('connector bindings', () => {
  it('normalizes auto endpoints into durable object bindings when node geometry is available', () => {
    const edge: CanvasEdge = {
      id: 'edge-1',
      sourceId: 'page-1',
      targetId: 'page-2'
    }

    const normalized = normalizeCanvasEdgeBindings(edge, {
      sourceNode: {
        id: 'page-1',
        type: 'page',
        position: { x: 0, y: 0, width: 120, height: 80 },
        properties: {}
      },
      targetNode: {
        id: 'page-2',
        type: 'page',
        position: { x: 320, y: 0, width: 120, height: 80 },
        properties: {}
      }
    })

    expect(normalized.source?.placement).toBe('right')
    expect(normalized.target?.placement).toBe('left')
    expect(normalized.source?.anchorId).toBe('page-1#placement:right')
    expect(normalized.target?.anchorId).toBe('page-2#placement:left')
    expect(normalized.sourceAnchor).toBe('right')
    expect(normalized.targetAnchor).toBe('left')
  })

  it('resolves corner and ratio-based anchor points consistently', () => {
    const rect = { x: 20, y: 40, width: 200, height: 100 }

    expect(resolveCanvasAnchorPoint(rect, { placement: 'bottom-right' })).toEqual({
      x: 220,
      y: 140
    })

    expect(
      resolveCanvasAnchorPoint(rect, {
        xRatio: 0.25,
        yRatio: 0.75,
        offsetX: 5,
        offsetY: -10
      })
    ).toEqual({
      x: 75,
      y: 105
    })
  })

  it('builds deterministic anchor ids for ratio and block-level anchors', () => {
    expect(
      createCanvasObjectAnchorId({
        objectId: 'page-1',
        xRatio: 0.5,
        yRatio: 0.25
      })
    ).toBe('page-1#ratio:0.5,0.25')

    expect(
      createCanvasObjectAnchorId({
        objectId: 'page-1',
        placement: 'left',
        blockAnchorId: 'block-123'
      })
    ).toBe('page-1#placement:left#block:block-123')
  })
})
