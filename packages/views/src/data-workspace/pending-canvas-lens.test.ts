/**
 * Handing a lens from the Data Workspace to a canvas across a route change
 * (exploration 0419).
 */

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPendingCanvasLens,
  stashPendingCanvasLens,
  takePendingCanvasLens
} from './pending-canvas-lens'

const lens = {
  canvasId: 'canvas:desk:abc',
  viewId: 'social.feed.youtube-videos',
  title: 'YouTube Videos',
  descriptorJson: '{"version":1}'
}

describe('pending canvas lens', () => {
  beforeEach(() => {
    clearPendingCanvasLens()
  })

  it('hands the request to the canvas it was addressed to', () => {
    stashPendingCanvasLens(lens)
    expect(takePendingCanvasLens('canvas:desk:abc')).toEqual(lens)
  })

  it('is claimed exactly once, so revisiting does not re-insert', () => {
    stashPendingCanvasLens(lens)

    expect(takePendingCanvasLens('canvas:desk:abc')).not.toBeNull()
    expect(takePendingCanvasLens('canvas:desk:abc')).toBeNull()
  })

  it('leaves a request alone when a different canvas opens first', () => {
    stashPendingCanvasLens(lens)

    expect(takePendingCanvasLens('canvas:other')).toBeNull()
    expect(takePendingCanvasLens('canvas:desk:abc')).toEqual(lens)
  })

  it('carries a projection plan through the handoff', () => {
    const withProjection = {
      ...lens,
      projection: {
        commandId: 'social.canvasProjection.create' as const,
        title: 'YouTube Videos',
        nodeCount: 1,
        edgeCount: 0,
        omittedNodeCount: 0,
        omittedEdgeCount: 0,
        bounds: { x: 0, y: 0, width: 260, height: 132 },
        nodes: [],
        edges: []
      }
    }

    stashPendingCanvasLens(withProjection)
    expect(takePendingCanvasLens('canvas:desk:abc')?.projection?.title).toBe('YouTube Videos')
  })

  it('returns nothing when the stored value is unusable', () => {
    sessionStorage.setItem('xnet:views:pending-canvas-lens', 'not json')
    expect(takePendingCanvasLens('canvas:desk:abc')).toBeNull()
  })
})
