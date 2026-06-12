/**
 * Pure pinch-to-zoom gesture math for the canvas renderer.
 */

import type { Point } from '../types'

export type PinchGestureState = {
  distance: number
  center: Point
}

export type PinchViewportInput = {
  viewport: { x: number; y: number; zoom: number }
  viewportSize: { width: number; height: number }
  /** Pinch midpoint in container-local screen coordinates before the update. */
  previousCenter: Point
  /** Pinch midpoint in container-local screen coordinates after the update. */
  nextCenter: Point
  scaleFactor: number
  minZoom: number
  maxZoom: number
}

export function measureTouchPinch(pointers: ReadonlyMap<number, Point>): PinchGestureState | null {
  const [first, second] = Array.from(pointers.values())

  if (!first || !second) {
    return null
  }

  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
  }
}

/**
 * Returns the viewport that keeps the world point under the previous pinch
 * center pinned to the next pinch center, so a stationary pinch zooms in
 * place while a moving pinch simultaneously pans.
 */
export function computePinchViewport(input: PinchViewportInput): {
  x: number
  y: number
  zoom: number
} {
  const { viewport, viewportSize, previousCenter, nextCenter, scaleFactor, minZoom, maxZoom } =
    input
  const zoom = Math.min(maxZoom, Math.max(minZoom, viewport.zoom * scaleFactor))
  const previousOffsetX = previousCenter.x - viewportSize.width / 2
  const previousOffsetY = previousCenter.y - viewportSize.height / 2
  const nextOffsetX = nextCenter.x - viewportSize.width / 2
  const nextOffsetY = nextCenter.y - viewportSize.height / 2

  return {
    x: viewport.x + previousOffsetX / viewport.zoom - nextOffsetX / zoom,
    y: viewport.y + previousOffsetY / viewport.zoom - nextOffsetY / zoom,
    zoom
  }
}
