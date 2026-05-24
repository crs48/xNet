/**
 * Tile-addressed coordinate helpers for Canvas v3.
 */

import type { Point, TileCoord, WorldPoint } from './types'

export const DEFAULT_CANVAS_TILE_SIZE = 4096

function getTileDelta(local: number, tileSize: number): number {
  return Math.floor(local / tileSize)
}

/**
 * Normalize a world point so local coordinates always stay within one tile.
 */
export function normalizeWorldPoint(
  point: WorldPoint,
  tileSize = DEFAULT_CANVAS_TILE_SIZE
): WorldPoint {
  const dx = getTileDelta(point.local.x, tileSize)
  const dy = getTileDelta(point.local.y, tileSize)

  return {
    tile: {
      tx: point.tile.tx + dx,
      ty: point.tile.ty + dy
    },
    local: {
      x: point.local.x - dx * tileSize,
      y: point.local.y - dy * tileSize
    }
  }
}

/**
 * Convert a finite legacy canvas coordinate into a tile-addressed world point.
 */
export function createWorldPointFromCanvasPoint(
  point: Point,
  tileSize = DEFAULT_CANVAS_TILE_SIZE
): WorldPoint {
  return normalizeWorldPoint(
    {
      tile: { tx: 0, ty: 0 },
      local: point
    },
    tileSize
  )
}

/**
 * Return the point's camera-local coordinate relative to an anchor tile.
 */
export function worldPointToAnchorLocal(
  point: WorldPoint,
  anchorTile: TileCoord,
  tileSize = DEFAULT_CANVAS_TILE_SIZE
): Point {
  const normalized = normalizeWorldPoint(point, tileSize)

  return {
    x: (normalized.tile.tx - anchorTile.tx) * tileSize + normalized.local.x,
    y: (normalized.tile.ty - anchorTile.ty) * tileSize + normalized.local.y
  }
}

/**
 * Convert a camera-local point back into tile-addressed world space.
 */
export function anchorLocalToWorldPoint(
  point: Point,
  anchorTile: TileCoord,
  tileSize = DEFAULT_CANVAS_TILE_SIZE
): WorldPoint {
  return normalizeWorldPoint(
    {
      tile: anchorTile,
      local: point
    },
    tileSize
  )
}

/**
 * Translate a world point without collapsing it into a single huge coordinate.
 */
export function translateWorldPoint(
  point: WorldPoint,
  delta: Point,
  tileSize = DEFAULT_CANVAS_TILE_SIZE
): WorldPoint {
  return normalizeWorldPoint(
    {
      tile: point.tile,
      local: {
        x: point.local.x + delta.x,
        y: point.local.y + delta.y
      }
    },
    tileSize
  )
}

export function compareTileCoord(left: TileCoord, right: TileCoord): number {
  if (left.ty !== right.ty) {
    return left.ty - right.ty
  }

  return left.tx - right.tx
}
