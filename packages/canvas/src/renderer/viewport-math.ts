/**
 * Pure viewport and geometry math for the canvas v3 renderer.
 *
 * Everything in this module is deterministic input→output with no React, DOM,
 * or Y.Doc dependencies, so it can be unit tested directly.
 */

import type { CanvasSnapGuideSegment } from '../selection/snap-guides'
import type {
  CanvasConfig,
  CanvasNode,
  CanvasObjectAnchorPlacement,
  Point,
  Rect,
  ViewportState
} from '../types'
import type { CanvasObjectRecord } from '@xnetjs/canvas-core'
import {
  createCanvasCamera,
  createWorldPointFromCanvasPoint,
  worldToScreenPoint
} from '@xnetjs/canvas-core'
import { clamp } from '@xnetjs/core'

export type Size = {
  width: number
  height: number
}

export type ConnectorHandlePlacement = Extract<
  CanvasObjectAnchorPlacement,
  'top' | 'right' | 'bottom' | 'left'
>

const CANVAS_OBJECT_HIT_TARGET_PADDING = 8
const CANVAS_OBJECT_MIN_HIT_TARGET_SIZE = 36

export function snapCanvasValue(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize
}

export function getActiveSnapGridSize(config: CanvasConfig): number | null {
  const gridSize = config.gridSize ?? 20

  return Number.isFinite(gridSize) && gridSize > 0 ? gridSize : null
}

export function getCanvasObjectHitTargetRect(rect: Rect): Rect {
  const extraWidth = Math.max(
    CANVAS_OBJECT_HIT_TARGET_PADDING * 2,
    CANVAS_OBJECT_MIN_HIT_TARGET_SIZE - rect.width
  )
  const extraHeight = Math.max(
    CANVAS_OBJECT_HIT_TARGET_PADDING * 2,
    CANVAS_OBJECT_MIN_HIT_TARGET_SIZE - rect.height
  )

  return {
    x: rect.x - extraWidth / 2,
    y: rect.y - extraHeight / 2,
    width: rect.width + extraWidth,
    height: rect.height + extraHeight
  }
}

export function pickConnectorPlacementForScreenPoint(
  rect: Rect,
  point: Point
): ConnectorHandlePlacement {
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2
  const dx = rect.width > 0 ? (point.x - centerX) / (rect.width / 2) : 0
  const dy = rect.height > 0 ? (point.y - centerY) / (rect.height / 2) : 0

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left'
  }

  return dy >= 0 ? 'bottom' : 'top'
}

export function getRectAnchorPointForPlacement(
  rect: Rect,
  placement: ConnectorHandlePlacement
): Point {
  switch (placement) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 }
  }
}

export function createCanvasCameraForViewport(viewport: ViewportState, viewportSize: Size) {
  return createCanvasCamera({
    localCenter: { x: viewport.x, y: viewport.y },
    zoom: viewport.zoom,
    viewportPx: viewportSize
  })
}

export function getViewportWorldTopLeft(viewport: ViewportState, viewportSize: Size): Point {
  return {
    x: viewport.x - viewportSize.width / 2 / viewport.zoom,
    y: viewport.y - viewportSize.height / 2 / viewport.zoom
  }
}

export function getScreenRectForObject(
  object: CanvasObjectRecord,
  viewport: ViewportState,
  viewportSize: Size
): Rect {
  return getScreenRectForCanvasRect(object.position, viewport, viewportSize)
}

export function getScreenPointForCanvasPoint(
  point: Point,
  viewport: ViewportState,
  viewportSize: Size
): Point {
  const camera = createCanvasCameraForViewport(viewport, viewportSize)

  return worldToScreenPoint(camera, createWorldPointFromCanvasPoint(point))
}

export function getScreenRectForCanvasRect(
  rect: Rect,
  viewport: ViewportState,
  viewportSize: Size
): Rect {
  const camera = createCanvasCameraForViewport(viewport, viewportSize)
  const topLeft = worldToScreenPoint(
    camera,
    createWorldPointFromCanvasPoint({ x: rect.x, y: rect.y })
  )
  const bottomRight = worldToScreenPoint(
    camera,
    createWorldPointFromCanvasPoint({
      x: rect.x + rect.width,
      y: rect.y + rect.height
    })
  )

  return {
    x: Math.min(topLeft.x, bottomRight.x),
    y: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y)
  }
}

export function getBoundsForRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) {
    return null
  }

  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

export function getNodePositionRect(node: CanvasNode): Rect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.position.width,
    height: node.position.height
  }
}

export function getScreenLineForSnapGuide(
  guide: CanvasSnapGuideSegment,
  viewport: ViewportState,
  viewportSize: Size
): { x1: number; y1: number; x2: number; y2: number } {
  const startPoint =
    guide.orientation === 'vertical'
      ? { x: guide.position, y: guide.start }
      : { x: guide.start, y: guide.position }
  const endPoint =
    guide.orientation === 'vertical'
      ? { x: guide.position, y: guide.end }
      : { x: guide.end, y: guide.position }
  const start = getScreenPointForCanvasPoint(startPoint, viewport, viewportSize)
  const end = getScreenPointForCanvasPoint(endPoint, viewport, viewportSize)

  return {
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y
  }
}

export function intersectsViewport(rect: Rect, viewportSize: Size, marginPx = 320): boolean {
  return (
    rect.x + rect.width >= -marginPx &&
    rect.y + rect.height >= -marginPx &&
    rect.x <= viewportSize.width + marginPx &&
    rect.y <= viewportSize.height + marginPx
  )
}

export function getFitViewport(input: {
  rect: Rect
  viewportSize: Size
  minZoom: number
  maxZoom: number
  padding: number
}): ViewportState {
  const availableWidth = Math.max(1, input.viewportSize.width - input.padding * 2)
  const availableHeight = Math.max(1, input.viewportSize.height - input.padding * 2)
  const zoom = clamp(
    Math.min(
      availableWidth / Math.max(input.rect.width, 1),
      availableHeight / Math.max(input.rect.height, 1)
    ),
    input.minZoom,
    input.maxZoom
  )

  return {
    x: input.rect.x + input.rect.width / 2,
    y: input.rect.y + input.rect.height / 2,
    zoom
  }
}
