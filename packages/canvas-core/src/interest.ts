/**
 * Viewport-interest tile subscription planning for Canvas v3.
 */

import type { ViewportInterest } from './provider'
import type { Rect, TileAddress } from './types'
import { DEFAULT_CANVAS_TILE_SIZE, worldPointToAnchorLocal } from './coordinates'
import { createTileId, getTileCoverageForRect, type TileCoverageRange } from './tiles'

export const DEFAULT_INTEREST_HALO_TILES = 1
export const DEFAULT_INTEREST_PREFETCH_MS = 180
export const DEFAULT_MAX_SUBSCRIBED_TILES = 256

export type ViewportTileSubscriptionPlanOptions = {
  interest: ViewportInterest
  previousTileIds?: readonly string[]
  tileSize?: number
  haloTiles?: number
  velocityPrefetchMs?: number
  maxSubscribedTiles?: number
}

export type ViewportTileSubscriptionPlan = {
  visibleCoverage: TileCoverageRange
  prefetchCoverage: TileCoverageRange
  visibleTileIds: readonly string[]
  prefetchTileIds: readonly string[]
  subscribedTileIds: readonly string[]
  enteredTileIds: readonly string[]
  exitedTileIds: readonly string[]
  retainedTileIds: readonly string[]
  clipped: boolean
}

function getCoverageCount(coverage: Omit<TileCoverageRange, 'count'>): number {
  return (
    Math.max(coverage.maxX - coverage.minX + 1, 0) * Math.max(coverage.maxY - coverage.minY + 1, 0)
  )
}

function withCoverageCount(coverage: Omit<TileCoverageRange, 'count'>): TileCoverageRange {
  return {
    ...coverage,
    count: getCoverageCount(coverage)
  }
}

function expandTileCoverage(coverage: TileCoverageRange, haloTiles: number): TileCoverageRange {
  const halo = Math.max(0, Math.floor(haloTiles))

  return withCoverageCount({
    z: coverage.z,
    minX: coverage.minX - halo,
    minY: coverage.minY - halo,
    maxX: coverage.maxX + halo,
    maxY: coverage.maxY + halo
  })
}

function getVisibleWorldRect(interest: ViewportInterest, tileSize: number): Rect {
  const zoom = Math.max(interest.viewport.zoom, 0.001)
  const center = worldPointToAnchorLocal(interest.viewport.center, { tx: 0, ty: 0 }, tileSize)
  const width = interest.viewport.widthPx / zoom
  const height = interest.viewport.heightPx / zoom

  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height
  }
}

function getVelocityTileCount(input: {
  velocityPxPerMs: number
  zoom: number
  prefetchMs: number
  tileSize: number
}): number {
  const zoom = Math.max(input.zoom, 0.001)
  const worldDistance = (Math.abs(input.velocityPxPerMs) * input.prefetchMs) / zoom

  return Math.ceil(worldDistance / input.tileSize)
}

function extendCoverageForVelocity(input: {
  coverage: TileCoverageRange
  velocityX: number
  velocityY: number
  zoom: number
  prefetchMs: number
  tileSize: number
}): TileCoverageRange {
  const velocityTilesX = getVelocityTileCount({
    velocityPxPerMs: input.velocityX,
    zoom: input.zoom,
    prefetchMs: input.prefetchMs,
    tileSize: input.tileSize
  })
  const velocityTilesY = getVelocityTileCount({
    velocityPxPerMs: input.velocityY,
    zoom: input.zoom,
    prefetchMs: input.prefetchMs,
    tileSize: input.tileSize
  })

  return withCoverageCount({
    z: input.coverage.z,
    minX: input.coverage.minX - (input.velocityX < 0 ? velocityTilesX : 0),
    minY: input.coverage.minY - (input.velocityY < 0 ? velocityTilesY : 0),
    maxX: input.coverage.maxX + (input.velocityX > 0 ? velocityTilesX : 0),
    maxY: input.coverage.maxY + (input.velocityY > 0 ? velocityTilesY : 0)
  })
}

function isAddressInCoverage(address: TileAddress, coverage: TileCoverageRange): boolean {
  return (
    address.z === coverage.z &&
    address.x >= coverage.minX &&
    address.x <= coverage.maxX &&
    address.y >= coverage.minY &&
    address.y <= coverage.maxY
  )
}

function getCenterTileAddress(interest: ViewportInterest, tileSize: number): TileAddress {
  const center = worldPointToAnchorLocal(interest.viewport.center, { tx: 0, ty: 0 }, tileSize)

  return {
    z: 0,
    x: Math.floor(center.x / tileSize),
    y: Math.floor(center.y / tileSize)
  }
}

function listPrioritizedTileIds(
  coverage: TileCoverageRange,
  center: TileAddress,
  maxTiles: number
): string[] {
  const limit = Math.max(0, Math.floor(maxTiles))
  const ids: string[] = []
  const seen = new Set<string>()
  const maxRadius = Math.max(
    Math.abs(center.x - coverage.minX),
    Math.abs(center.x - coverage.maxX),
    Math.abs(center.y - coverage.minY),
    Math.abs(center.y - coverage.maxY)
  )
  const push = (x: number, y: number): void => {
    if (ids.length >= limit) {
      return
    }

    const address = { z: coverage.z, x, y }
    if (!isAddressInCoverage(address, coverage)) {
      return
    }

    const id = createTileId(address)
    if (!seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }

  for (let radius = 0; radius <= maxRadius && ids.length < limit; radius += 1) {
    if (radius === 0) {
      push(center.x, center.y)
      continue
    }

    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      push(x, center.y - radius)
      push(x, center.y + radius)
    }

    for (let y = center.y - radius + 1; y <= center.y + radius - 1; y += 1) {
      push(center.x - radius, y)
      push(center.x + radius, y)
    }
  }

  return ids
}

function getTileDelta(
  previousTileIds: readonly string[],
  nextTileIds: readonly string[]
): {
  enteredTileIds: readonly string[]
  exitedTileIds: readonly string[]
  retainedTileIds: readonly string[]
} {
  const previous = new Set(previousTileIds)
  const next = new Set(nextTileIds)

  return {
    enteredTileIds: nextTileIds.filter((tileId) => !previous.has(tileId)),
    exitedTileIds: previousTileIds.filter((tileId) => !next.has(tileId)),
    retainedTileIds: nextTileIds.filter((tileId) => previous.has(tileId))
  }
}

export function createViewportTileSubscriptionPlan({
  interest,
  previousTileIds = [],
  tileSize = DEFAULT_CANVAS_TILE_SIZE,
  haloTiles = DEFAULT_INTEREST_HALO_TILES,
  velocityPrefetchMs = DEFAULT_INTEREST_PREFETCH_MS,
  maxSubscribedTiles = DEFAULT_MAX_SUBSCRIBED_TILES
}: ViewportTileSubscriptionPlanOptions): ViewportTileSubscriptionPlan {
  const visibleCoverage = getTileCoverageForRect(getVisibleWorldRect(interest, tileSize), tileSize)
  const haloCoverage = expandTileCoverage(visibleCoverage, haloTiles)
  const prefetchCoverage = extendCoverageForVelocity({
    coverage: haloCoverage,
    velocityX: interest.viewport.velocityPxPerMs.x,
    velocityY: interest.viewport.velocityPxPerMs.y,
    zoom: interest.viewport.zoom,
    prefetchMs: Math.max(0, velocityPrefetchMs),
    tileSize
  })
  const center = getCenterTileAddress(interest, tileSize)
  const visibleTileIds = listPrioritizedTileIds(
    visibleCoverage,
    center,
    Math.min(visibleCoverage.count, maxSubscribedTiles)
  )
  const subscribedTileIds = listPrioritizedTileIds(prefetchCoverage, center, maxSubscribedTiles)
  const visibleSet = new Set(visibleTileIds)
  const prefetchTileIds = subscribedTileIds.filter((tileId) => !visibleSet.has(tileId))
  const delta = getTileDelta(previousTileIds, subscribedTileIds)

  return {
    visibleCoverage,
    prefetchCoverage,
    visibleTileIds,
    prefetchTileIds,
    subscribedTileIds,
    ...delta,
    clipped:
      visibleTileIds.length < visibleCoverage.count ||
      subscribedTileIds.length < prefetchCoverage.count
  }
}
