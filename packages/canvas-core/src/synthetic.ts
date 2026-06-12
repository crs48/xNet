/**
 * Deterministic synthetic Canvas v3 scene provider.
 */

import type {
  CanvasMutationReceipt,
  CanvasSceneProvider,
  CanvasSceneSnapshot,
  MinimapSummaryRequest,
  ViewportInterest
} from './provider'
import type {
  CanvasDensityGrid,
  CanvasObjectKind,
  CanvasObjectTypeCounts,
  CanvasTileClusterSummary,
  CanvasTileSummary,
  MinimapSummary,
  Rect,
  TileAddress
} from './types'
import { DEFAULT_CANVAS_TILE_SIZE, worldPointToAnchorLocal } from './coordinates'
import { createMinimapSummaryFromTileSummaries } from './summary'
import { createTileId, getTileBounds, getTileCoverageForRect, listTileAddresses } from './tiles'

const DEFAULT_DENSITY_SIZE = 8
const DEFAULT_AVERAGE_OBJECTS_PER_TILE = 512

const KIND_RATIOS: Record<CanvasObjectKind, number> = {
  page: 0.22,
  database: 0.08,
  'external-reference': 0.08,
  media: 0.1,
  shape: 0.34,
  note: 0.12,
  task: 0.02,
  group: 0.04,
  widget: 0
}

export type SyntheticCanvasSceneOptions = {
  objectCount: number
  seed?: number
  tileSize?: number
  leafZoom?: number
  averageObjectsPerTile?: number
  maxClustersPerTile?: number
}

export type SyntheticCanvasScene = {
  provider: CanvasSceneProvider
  worldBounds: Rect
  estimateObjectCount: () => number
  getTileSummary: (address: TileAddress) => CanvasTileSummary
}

function hashNumber(input: string): number {
  let hash = 2166136261

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

function noise(seed: number, x: number, y: number, salt: string): number {
  return hashNumber(`${seed}:${x}:${y}:${salt}`) / 0xffffffff
}

function createDensityGrid(
  objectCount: number,
  address: TileAddress,
  seed: number,
  size = DEFAULT_DENSITY_SIZE
): CanvasDensityGrid {
  if (objectCount <= 0) {
    return {
      columns: size,
      rows: size,
      values: Array.from({ length: size * size }, () => 0)
    }
  }

  const weights = Array.from({ length: size * size }, (_, index) => {
    const cellX = index % size
    const cellY = Math.floor(index / size)
    return 0.2 + noise(seed, address.x * size + cellX, address.y * size + cellY, 'density') * 1.8
  })
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  const values = weights.map((weight) => Math.floor((weight / totalWeight) * objectCount))
  let remaining = objectCount - values.reduce((total, value) => total + value, 0)
  let cursor = hashNumber(`${seed}:${address.x}:${address.y}:density-start`) % values.length

  while (remaining > 0) {
    values[cursor] += 1
    remaining -= 1
    cursor = (cursor + 17) % values.length
  }

  return {
    columns: size,
    rows: size,
    values
  }
}

function createTypeCounts(objectCount: number): CanvasObjectTypeCounts {
  const entries = Object.entries(KIND_RATIOS).map(([kind, ratio]) => {
    return [kind, Math.floor(objectCount * ratio)] as const
  })
  const counts = Object.fromEntries(entries) as CanvasObjectTypeCounts
  const assigned = Object.values(counts).reduce((total, count) => total + (count ?? 0), 0)
  counts.shape = (counts.shape ?? 0) + objectCount - assigned

  return counts
}

function createClusters(
  density: CanvasDensityGrid,
  tileBounds: Rect,
  address: TileAddress,
  maxClusters: number
): readonly CanvasTileClusterSummary[] {
  const cellWidth = tileBounds.width / density.columns
  const cellHeight = tileBounds.height / density.rows

  return density.values
    .map((objectCount, index) => {
      const cellX = index % density.columns
      const cellY = Math.floor(index / density.columns)
      return {
        id: `${createTileId(address)}:${cellX}:${cellY}`,
        bounds: {
          x: tileBounds.x + cellX * cellWidth,
          y: tileBounds.y + cellY * cellHeight,
          width: cellWidth,
          height: cellHeight
        },
        objectCount,
        dominantKind: 'shape' as CanvasObjectKind,
        sampleObjectIds: [`synthetic:${createTileId(address)}:${index}`]
      }
    })
    .filter((cluster) => cluster.objectCount > 0)
    .sort((left, right) => right.objectCount - left.objectCount)
    .slice(0, maxClusters)
}

function createViewportRect(interest: ViewportInterest, tileSize: number): Rect {
  const center = worldPointToAnchorLocal(interest.viewport.center, { tx: 0, ty: 0 }, tileSize)
  const width = interest.viewport.widthPx / Math.max(interest.viewport.zoom, 0.001)
  const height = interest.viewport.heightPx / Math.max(interest.viewport.zoom, 0.001)

  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height
  }
}

export function createSyntheticCanvasScene(
  options: SyntheticCanvasSceneOptions
): SyntheticCanvasScene {
  const tileSize = options.tileSize ?? DEFAULT_CANVAS_TILE_SIZE
  const averageObjectsPerTile = options.averageObjectsPerTile ?? DEFAULT_AVERAGE_OBJECTS_PER_TILE
  const seed = options.seed ?? 1
  const leafZoom = options.leafZoom ?? 0
  const maxClustersPerTile = options.maxClustersPerTile ?? 8
  const tileCount = Math.max(1, Math.ceil(options.objectCount / averageObjectsPerTile))
  const gridWidth = Math.max(1, Math.ceil(Math.sqrt(tileCount)))
  const gridHeight = Math.max(1, Math.ceil(tileCount / gridWidth))
  const minTileX = -Math.floor(gridWidth / 2)
  const minTileY = -Math.floor(gridHeight / 2)
  const maxTileX = minTileX + gridWidth - 1
  const maxTileY = minTileY + gridHeight - 1
  const baseObjectsPerTile = options.objectCount / Math.max(gridWidth * gridHeight, 1)
  const worldBounds = {
    x: minTileX * tileSize,
    y: minTileY * tileSize,
    width: gridWidth * tileSize,
    height: gridHeight * tileSize
  }

  const getTileSummary = (address: TileAddress): CanvasTileSummary => {
    const inWorld =
      address.x >= minTileX &&
      address.x <= maxTileX &&
      address.y >= minTileY &&
      address.y <= maxTileY
    const variance = inWorld ? 0.65 + noise(seed, address.x, address.y, 'count') * 0.7 : 0
    const objectCount = Math.max(0, Math.round(baseObjectsPerTile * variance))
    const density = createDensityGrid(objectCount, address, seed)
    const bounds = getTileBounds(address, tileSize)

    return {
      tileId: createTileId(address),
      address,
      bounds,
      objectCount,
      edgeCount: Math.round(objectCount * 0.28),
      typeCounts: createTypeCounts(objectCount),
      density,
      clusters: createClusters(density, bounds, address, maxClustersPerTile),
      activePresenceCount:
        objectCount > 0 && noise(seed, address.x, address.y, 'presence') > 0.96 ? 1 : 0,
      dirty: false,
      stale: false
    }
  }

  const getSummariesForRect = (bounds: Rect, maxTiles: number): readonly CanvasTileSummary[] => {
    const coverage = getTileCoverageForRect(bounds, tileSize, leafZoom)

    if (coverage.count <= maxTiles) {
      return listTileAddresses(coverage).map(getTileSummary)
    }

    const aspect = Math.max(bounds.width / Math.max(bounds.height, 1), 0.1)
    const columns = Math.max(1, Math.floor(Math.sqrt(maxTiles * aspect)))
    const rows = Math.max(1, Math.floor(maxTiles / columns))
    const cellWidth = bounds.width / columns
    const cellHeight = bounds.height / rows

    return Array.from({ length: rows * columns }, (_, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)
      const cellBounds = {
        x: bounds.x + column * cellWidth,
        y: bounds.y + row * cellHeight,
        width: cellWidth,
        height: cellHeight
      }
      const address = {
        z: leafZoom,
        x: coverage.minX + column,
        y: coverage.minY + row
      }
      const areaRatio =
        (cellBounds.width * cellBounds.height) / (worldBounds.width * worldBounds.height)
      const objectCount = Math.max(
        0,
        Math.round(
          options.objectCount * areaRatio * (0.8 + noise(seed, column, row, 'coarse') * 0.4)
        )
      )
      const density = createDensityGrid(objectCount, address, seed)

      return {
        tileId: `coarse:${leafZoom}/${column}/${row}`,
        address,
        bounds: cellBounds,
        objectCount,
        edgeCount: Math.round(objectCount * 0.2),
        typeCounts: createTypeCounts(objectCount),
        density,
        clusters: createClusters(density, cellBounds, address, maxClustersPerTile),
        activePresenceCount:
          objectCount > 0 && noise(seed, column, row, 'coarse-presence') > 0.98 ? 1 : 0,
        dirty: false,
        stale: false
      } satisfies CanvasTileSummary
    })
  }

  const provider: CanvasSceneProvider = {
    subscribeViewport: (interest, onSnapshot) => {
      const viewportBounds = createViewportRect(interest, tileSize)
      const summaries = getSummariesForRect(viewportBounds, 64)
      const snapshot: CanvasSceneSnapshot = {
        cameraEpoch: Date.now(),
        rasterTiles: [],
        vectorTiles: summaries.map((summary) => ({
          tileId: summary.tileId,
          summary
        })),
        thumbnailSprites: [],
        shellObjects: [],
        liveObjects: [],
        overlays: []
      }

      onSnapshot(snapshot)

      return () => undefined
    },
    mutateTile: async (input): Promise<CanvasMutationReceipt> => ({
      mutationId: `synthetic:${input.tileId}:${Date.now()}`,
      tileIds: [input.tileId],
      committedAt: Date.now()
    }),
    openSourceDoc: async (sourceNodeId) => ({
      sourceNodeId,
      close: () => undefined
    }),
    getMinimapSummary: async (input: MinimapSummaryRequest): Promise<MinimapSummary> => {
      const bounds = input.bounds ?? worldBounds
      const tiles = getSummariesForRect(bounds, input.maxTileSummaries)
      return createMinimapSummaryFromTileSummaries(tiles, bounds)
    }
  }

  return {
    provider,
    worldBounds,
    estimateObjectCount: () => options.objectCount,
    getTileSummary
  }
}
