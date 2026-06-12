/**
 * Pinch-to-zoom gesture math tests.
 */

import type { Point } from '../types'
import { describe, expect, it } from 'vitest'
import { computePinchViewport, measureTouchPinch } from '../renderer/pinch-zoom'

const VIEWPORT_SIZE = { width: 960, height: 640 }

function worldPointUnderScreenPoint(
  viewport: { x: number; y: number; zoom: number },
  screenPoint: Point
): Point {
  return {
    x: viewport.x + (screenPoint.x - VIEWPORT_SIZE.width / 2) / viewport.zoom,
    y: viewport.y + (screenPoint.y - VIEWPORT_SIZE.height / 2) / viewport.zoom
  }
}

describe('measureTouchPinch', () => {
  it('returns null until two pointers are tracked', () => {
    expect(measureTouchPinch(new Map())).toBeNull()
    expect(measureTouchPinch(new Map([[1, { x: 10, y: 20 }]]))).toBeNull()
  })

  it('measures the distance and midpoint between two pointers', () => {
    const pinch = measureTouchPinch(
      new Map([
        [1, { x: 100, y: 200 }],
        [2, { x: 160, y: 280 }]
      ])
    )

    expect(pinch).toEqual({
      distance: 100,
      center: { x: 130, y: 240 }
    })
  })
})

describe('computePinchViewport', () => {
  it('keeps the world point under a stationary pinch center fixed while zooming', () => {
    const viewport = { x: 40, y: -25, zoom: 1.25 }
    const center = { x: 600, y: 180 }
    const next = computePinchViewport({
      viewport,
      viewportSize: VIEWPORT_SIZE,
      previousCenter: center,
      nextCenter: center,
      scaleFactor: 1.6,
      minZoom: 0.1,
      maxZoom: 4
    })

    expect(next.zoom).toBeCloseTo(2)
    const before = worldPointUnderScreenPoint(viewport, center)
    const after = worldPointUnderScreenPoint(next, center)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('pans the viewport when the pinch center moves without scaling', () => {
    const next = computePinchViewport({
      viewport: { x: 0, y: 0, zoom: 2 },
      viewportSize: VIEWPORT_SIZE,
      previousCenter: { x: 480, y: 320 },
      nextCenter: { x: 530, y: 280 },
      scaleFactor: 1,
      minZoom: 0.1,
      maxZoom: 4
    })

    expect(next.zoom).toBe(2)
    expect(next.x).toBeCloseTo(-25)
    expect(next.y).toBeCloseTo(20)
  })

  it('clamps the zoom to the configured bounds', () => {
    const base = {
      viewportSize: VIEWPORT_SIZE,
      previousCenter: { x: 480, y: 320 },
      nextCenter: { x: 480, y: 320 },
      minZoom: 0.5,
      maxZoom: 3
    }

    expect(
      computePinchViewport({ ...base, viewport: { x: 0, y: 0, zoom: 2 }, scaleFactor: 10 }).zoom
    ).toBe(3)
    expect(
      computePinchViewport({ ...base, viewport: { x: 0, y: 0, zoom: 2 }, scaleFactor: 0.01 }).zoom
    ).toBe(0.5)
  })
})
