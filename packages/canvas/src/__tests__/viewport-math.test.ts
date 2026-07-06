/**
 * Pure viewport and geometry math tests for the canvas v3 renderer.
 */

import type { CanvasNode, Rect, ViewportState } from '../types'
import { describe, expect, it } from 'vitest'
import {
  createCanvasCameraForViewport,
  getActiveSnapGridSize,
  getBoundsForRects,
  getCanvasObjectHitTargetRect,
  getFitViewport,
  getNodePositionRect,
  getRectAnchorPointForPlacement,
  getScreenLineForSnapGuide,
  getScreenPointForCanvasPoint,
  getScreenRectForCanvasRect,
  getViewportWorldTopLeft,
  intersectsViewport,
  pickConnectorPlacementForScreenPoint,
  snapCanvasValue
} from '../renderer/viewport-math'

const VIEWPORT_SIZE = { width: 960, height: 640 }

function createNode(id: string, position: Rect): CanvasNode {
  return {
    id,
    type: 'page',
    position: {
      ...position,
      zIndex: 0
    },
    properties: {
      title: id
    }
  }
}

describe('createCanvasCameraForViewport', () => {
  it('centres the camera on the viewport at the requested zoom', () => {
    const camera = createCanvasCameraForViewport({ x: 120, y: -40, zoom: 1.5 }, VIEWPORT_SIZE)

    expect(camera.localCenter).toEqual({ x: 120, y: -40 })
    expect(camera.zoom).toBe(1.5)
    expect(camera.viewportPx).toEqual(VIEWPORT_SIZE)
  })
})

describe('getScreenPointForCanvasPoint', () => {
  it('maps the viewport centre to the screen centre', () => {
    const viewport: ViewportState = { x: 120, y: -40, zoom: 2 }

    expect(getScreenPointForCanvasPoint({ x: 120, y: -40 }, viewport, VIEWPORT_SIZE)).toEqual({
      x: VIEWPORT_SIZE.width / 2,
      y: VIEWPORT_SIZE.height / 2
    })
  })

  it('scales offsets from the viewport centre by zoom', () => {
    const point = { x: 130, y: -20 }

    const atZoom1 = getScreenPointForCanvasPoint(point, { x: 120, y: -40, zoom: 1 }, VIEWPORT_SIZE)
    const atZoom2 = getScreenPointForCanvasPoint(point, { x: 120, y: -40, zoom: 2 }, VIEWPORT_SIZE)

    expect(atZoom1).toEqual({ x: 490, y: 340 })
    expect(atZoom2).toEqual({ x: 500, y: 360 })
  })

  it('round-trips with the world top-left at any zoom', () => {
    for (const zoom of [0.25, 1, 3]) {
      const viewport: ViewportState = { x: 57, y: -213, zoom }
      const topLeft = getViewportWorldTopLeft(viewport, VIEWPORT_SIZE)

      const screen = getScreenPointForCanvasPoint(topLeft, viewport, VIEWPORT_SIZE)

      expect(screen.x).toBeCloseTo(0)
      expect(screen.y).toBeCloseTo(0)
    }
  })
})

describe('getScreenRectForCanvasRect', () => {
  it('projects a canvas rect into screen space', () => {
    const viewport: ViewportState = { x: 0, y: 0, zoom: 1 }

    expect(
      getScreenRectForCanvasRect({ x: -50, y: -25, width: 100, height: 50 }, viewport, VIEWPORT_SIZE)
    ).toEqual({
      x: VIEWPORT_SIZE.width / 2 - 50,
      y: VIEWPORT_SIZE.height / 2 - 25,
      width: 100,
      height: 50
    })
  })

  it('scales rect dimensions by the viewport zoom', () => {
    const rect = { x: 10, y: 20, width: 100, height: 50 }

    for (const zoom of [0.5, 2]) {
      const screenRect = getScreenRectForCanvasRect(rect, { x: 0, y: 0, zoom }, VIEWPORT_SIZE)

      expect(screenRect.width).toBeCloseTo(rect.width * zoom)
      expect(screenRect.height).toBeCloseTo(rect.height * zoom)
    }
  })
})

describe('getViewportWorldTopLeft', () => {
  it('offsets the centre by half the viewport in world units', () => {
    expect(getViewportWorldTopLeft({ x: 100, y: 50, zoom: 2 }, VIEWPORT_SIZE)).toEqual({
      x: 100 - VIEWPORT_SIZE.width / 4,
      y: 50 - VIEWPORT_SIZE.height / 4
    })
  })
})

describe('getBoundsForRects', () => {
  it('returns null for an empty list', () => {
    expect(getBoundsForRects([])).toBeNull()
  })

  it('unions rects into a single bounding box', () => {
    expect(
      getBoundsForRects([
        { x: 40, y: 30, width: 100, height: 80 },
        { x: 220, y: 160, width: 140, height: 120 }
      ])
    ).toEqual({ x: 40, y: 30, width: 320, height: 250 })
  })
})

describe('getNodePositionRect', () => {
  it('reads the node position as a plain rect', () => {
    const node = createNode('a', { x: 12, y: 34, width: 120, height: 80 })

    expect(getNodePositionRect(node)).toEqual({ x: 12, y: 34, width: 120, height: 80 })
  })
})

describe('getScreenLineForSnapGuide', () => {
  const viewport: ViewportState = { x: 0, y: 0, zoom: 1 }

  it('maps a vertical guide onto a screen line', () => {
    const line = getScreenLineForSnapGuide(
      {
        id: 'v',
        source: 'object',
        orientation: 'vertical',
        position: 10,
        start: -20,
        end: 40,
        relatedNodeIds: []
      },
      viewport,
      VIEWPORT_SIZE
    )

    expect(line).toEqual({
      x1: VIEWPORT_SIZE.width / 2 + 10,
      y1: VIEWPORT_SIZE.height / 2 - 20,
      x2: VIEWPORT_SIZE.width / 2 + 10,
      y2: VIEWPORT_SIZE.height / 2 + 40
    })
  })

  it('maps a horizontal guide onto a screen line', () => {
    const line = getScreenLineForSnapGuide(
      {
        id: 'h',
        source: 'object',
        orientation: 'horizontal',
        position: -30,
        start: 0,
        end: 100,
        relatedNodeIds: []
      },
      viewport,
      VIEWPORT_SIZE
    )

    expect(line).toEqual({
      x1: VIEWPORT_SIZE.width / 2,
      y1: VIEWPORT_SIZE.height / 2 - 30,
      x2: VIEWPORT_SIZE.width / 2 + 100,
      y2: VIEWPORT_SIZE.height / 2 - 30
    })
  })
})

describe('intersectsViewport', () => {
  it('accepts rects inside or near the viewport margin', () => {
    expect(intersectsViewport({ x: 10, y: 10, width: 50, height: 50 }, VIEWPORT_SIZE)).toBe(true)
    expect(intersectsViewport({ x: -360, y: 0, width: 50, height: 50 }, VIEWPORT_SIZE)).toBe(true)
  })

  it('rejects rects beyond the margin', () => {
    expect(intersectsViewport({ x: -420, y: 0, width: 50, height: 50 }, VIEWPORT_SIZE)).toBe(false)
    expect(
      intersectsViewport({ x: VIEWPORT_SIZE.width + 321, y: 0, width: 50, height: 50 }, VIEWPORT_SIZE)
    ).toBe(false)
  })

  it('honours a custom margin', () => {
    expect(intersectsViewport({ x: -100, y: 0, width: 50, height: 50 }, VIEWPORT_SIZE, 0)).toBe(
      false
    )
  })
})

describe('getFitViewport', () => {
  it('centres on the rect and fits the constraining axis', () => {
    const next = getFitViewport({
      rect: { x: 0, y: 0, width: 400, height: 100 },
      viewportSize: VIEWPORT_SIZE,
      minZoom: 0.1,
      maxZoom: 4,
      padding: 80
    })

    expect(next.x).toBe(200)
    expect(next.y).toBe(50)
    // Width is the constraining axis: (960 - 160) / 400.
    expect(next.zoom).toBeCloseTo(2)
  })

  it('clamps the zoom to the configured range', () => {
    const zoomedOut = getFitViewport({
      rect: { x: 0, y: 0, width: 100_000, height: 100 },
      viewportSize: VIEWPORT_SIZE,
      minZoom: 0.5,
      maxZoom: 4,
      padding: 80
    })
    const zoomedIn = getFitViewport({
      rect: { x: 0, y: 0, width: 10, height: 10 },
      viewportSize: VIEWPORT_SIZE,
      minZoom: 0.5,
      maxZoom: 4,
      padding: 80
    })

    expect(zoomedOut.zoom).toBe(0.5)
    expect(zoomedIn.zoom).toBe(4)
  })
})

describe('snapCanvasValue', () => {
  it('snaps values to the nearest grid step', () => {
    expect(snapCanvasValue(29, 20)).toBe(20)
    expect(snapCanvasValue(31, 20)).toBe(40)
    expect(snapCanvasValue(-29, 20)).toBe(-20)
  })
})

describe('getActiveSnapGridSize', () => {
  it('defaults to 20 when the config omits a grid size', () => {
    expect(getActiveSnapGridSize({})).toBe(20)
  })

  it('returns null for non-positive or non-finite grid sizes', () => {
    expect(getActiveSnapGridSize({ gridSize: 0 })).toBeNull()
    expect(getActiveSnapGridSize({ gridSize: -4 })).toBeNull()
    expect(getActiveSnapGridSize({ gridSize: Number.NaN })).toBeNull()
  })
})

describe('getCanvasObjectHitTargetRect', () => {
  it('pads large rects by the hit-target padding', () => {
    expect(getCanvasObjectHitTargetRect({ x: 100, y: 100, width: 200, height: 120 })).toEqual({
      x: 92,
      y: 92,
      width: 216,
      height: 136
    })
  })

  it('expands tiny rects to the minimum hit-target size', () => {
    expect(getCanvasObjectHitTargetRect({ x: 100, y: 100, width: 10, height: 10 })).toEqual({
      x: 87,
      y: 87,
      width: 36,
      height: 36
    })
  })
})

describe('pickConnectorPlacementForScreenPoint', () => {
  const rect = { x: 0, y: 0, width: 100, height: 100 }

  it('picks the side facing the pointer', () => {
    expect(pickConnectorPlacementForScreenPoint(rect, { x: 95, y: 50 })).toBe('right')
    expect(pickConnectorPlacementForScreenPoint(rect, { x: 5, y: 50 })).toBe('left')
    expect(pickConnectorPlacementForScreenPoint(rect, { x: 50, y: 95 })).toBe('bottom')
    expect(pickConnectorPlacementForScreenPoint(rect, { x: 50, y: 5 })).toBe('top')
  })
})

describe('getRectAnchorPointForPlacement', () => {
  const rect = { x: 10, y: 20, width: 100, height: 60 }

  it('returns the midpoint of each edge', () => {
    expect(getRectAnchorPointForPlacement(rect, 'top')).toEqual({ x: 60, y: 20 })
    expect(getRectAnchorPointForPlacement(rect, 'right')).toEqual({ x: 110, y: 50 })
    expect(getRectAnchorPointForPlacement(rect, 'bottom')).toEqual({ x: 60, y: 80 })
    expect(getRectAnchorPointForPlacement(rect, 'left')).toEqual({ x: 10, y: 50 })
  })
})
