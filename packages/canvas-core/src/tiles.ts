/**
 * Tile addressing and coverage queries for Canvas v3.
 */

import type { Rect, TileAddress, WorldPoint } from './types'
import { DEFAULT_CANVAS_TILE_SIZE, normalizeWorldPoint } from './coordinates'

export type TileCoverageRange = {
  z: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  count: number
}

export function createTileId(address: TileAddress): string {
  return `${address.z}/${address.x}/${address.y}`
}

export function parseTileId(tileId: string): TileAddress | null {
  const parts = tileId.split('/')
  if (parts.length !== 3) {
    return null
  }

  const [z, x, y] = parts.map((part) => Number(part))
  if (![z, x, y].every(Number.isInteger)) {
    return null
  }

  return { z, x, y }
}

export function getTileBounds(address: TileAddress, tileSize = DEFAULT_CANVAS_TILE_SIZE): Rect {
  return {
    x: address.x * tileSize,
    y: address.y * tileSize,
    width: tileSize,
    height: tileSize
  }
}

function getInclusiveEndTile(start: number, size: number, tileSize: number): number {
  if (size <= 0) {
    return Math.floor(start / tileSize)
  }

  return Math.ceil((start + size) / tileSize) - 1
}

export function getTileCoverageForRect(
  rect: Rect,
  tileSize = DEFAULT_CANVAS_TILE_SIZE,
  z = 0
): TileCoverageRange {
  const minX = Math.floor(rect.x / tileSize)
  const minY = Math.floor(rect.y / tileSize)
  const maxX = getInclusiveEndTile(rect.x, rect.width, tileSize)
  const maxY = getInclusiveEndTile(rect.y, rect.height, tileSize)
  const count = Math.max(maxX - minX + 1, 0) * Math.max(maxY - minY + 1, 0)

  return {
    z,
    minX,
    minY,
    maxX,
    maxY,
    count
  }
}

export function getTileCoverageForWorldPoints(
  points: readonly WorldPoint[],
  z = 0,
  tileSize = DEFAULT_CANVAS_TILE_SIZE
): TileCoverageRange {
  if (points.length === 0) {
    return {
      z,
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      count: 1
    }
  }

  const normalized = points.map((point) => normalizeWorldPoint(point, tileSize))
  const minX = Math.min(...normalized.map((point) => point.tile.tx))
  const minY = Math.min(...normalized.map((point) => point.tile.ty))
  const maxX = Math.max(...normalized.map((point) => point.tile.tx))
  const maxY = Math.max(...normalized.map((point) => point.tile.ty))

  return {
    z,
    minX,
    minY,
    maxX,
    maxY,
    count: (maxX - minX + 1) * (maxY - minY + 1)
  }
}

export function listTileAddresses(
  coverage: TileCoverageRange,
  maxTiles = Number.POSITIVE_INFINITY
): TileAddress[] {
  const addresses: TileAddress[] = []

  for (let y = coverage.minY; y <= coverage.maxY; y += 1) {
    for (let x = coverage.minX; x <= coverage.maxX; x += 1) {
      if (addresses.length >= maxTiles) {
        return addresses
      }

      addresses.push({ z: coverage.z, x, y })
    }
  }

  return addresses
}
