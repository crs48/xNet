/**
 * Camera transforms for tile-addressed Canvas v3 coordinates.
 */

import type { Point, Rect, Size, TileCoord, WorldPoint } from './types'
import {
  DEFAULT_CANVAS_TILE_SIZE,
  anchorLocalToWorldPoint,
  worldPointToAnchorLocal
} from './coordinates'
import { getTileCoverageForWorldPoints, type TileCoverageRange } from './tiles'

export type CanvasCameraState = {
  anchorTile: TileCoord
  localCenter: Point
  zoom: number
  viewportPx: Size
  tileSize: number
}

export type CreateCanvasCameraInput = {
  anchorTile?: TileCoord
  localCenter?: Point
  zoom?: number
  viewportPx: Size
  tileSize?: number
}

export function createCanvasCamera(input: CreateCanvasCameraInput): CanvasCameraState {
  return {
    anchorTile: input.anchorTile ?? { tx: 0, ty: 0 },
    localCenter: input.localCenter ?? { x: 0, y: 0 },
    zoom: input.zoom ?? 1,
    viewportPx: input.viewportPx,
    tileSize: input.tileSize ?? DEFAULT_CANVAS_TILE_SIZE
  }
}

export function getCameraWorldCenter(camera: CanvasCameraState): WorldPoint {
  return anchorLocalToWorldPoint(camera.localCenter, camera.anchorTile, camera.tileSize)
}

export function screenToWorldPoint(camera: CanvasCameraState, screenPoint: Point): WorldPoint {
  const localPoint = {
    x:
      camera.localCenter.x +
      (screenPoint.x - camera.viewportPx.width / 2) / Math.max(camera.zoom, 0.001),
    y:
      camera.localCenter.y +
      (screenPoint.y - camera.viewportPx.height / 2) / Math.max(camera.zoom, 0.001)
  }

  return anchorLocalToWorldPoint(localPoint, camera.anchorTile, camera.tileSize)
}

export function worldToScreenPoint(camera: CanvasCameraState, worldPoint: WorldPoint): Point {
  const localPoint = worldPointToAnchorLocal(worldPoint, camera.anchorTile, camera.tileSize)

  return {
    x: (localPoint.x - camera.localCenter.x) * camera.zoom + camera.viewportPx.width / 2,
    y: (localPoint.y - camera.localCenter.y) * camera.zoom + camera.viewportPx.height / 2
  }
}

export function getCameraVisibleWorldCorners(camera: CanvasCameraState): readonly WorldPoint[] {
  return [
    screenToWorldPoint(camera, { x: 0, y: 0 }),
    screenToWorldPoint(camera, { x: camera.viewportPx.width, y: 0 }),
    screenToWorldPoint(camera, { x: camera.viewportPx.width, y: camera.viewportPx.height }),
    screenToWorldPoint(camera, { x: 0, y: camera.viewportPx.height })
  ]
}

export function getCameraVisibleTileCoverage(camera: CanvasCameraState): TileCoverageRange {
  return getTileCoverageForWorldPoints(getCameraVisibleWorldCorners(camera), 0, camera.tileSize)
}

/**
 * Compatibility projection for legacy Canvas v2 code paths that still expect a finite rect.
 */
export function getCameraVisibleLegacyRect(camera: CanvasCameraState): Rect {
  const topLeft = screenToWorldPoint(camera, { x: 0, y: 0 })
  const bottomRight = screenToWorldPoint(camera, {
    x: camera.viewportPx.width,
    y: camera.viewportPx.height
  })
  const topLeftLocal = worldPointToAnchorLocal(topLeft, { tx: 0, ty: 0 }, camera.tileSize)
  const bottomRightLocal = worldPointToAnchorLocal(bottomRight, { tx: 0, ty: 0 }, camera.tileSize)

  return {
    x: Math.min(topLeftLocal.x, bottomRightLocal.x),
    y: Math.min(topLeftLocal.y, bottomRightLocal.y),
    width: Math.abs(bottomRightLocal.x - topLeftLocal.x),
    height: Math.abs(bottomRightLocal.y - topLeftLocal.y)
  }
}
