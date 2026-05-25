/**
 * Minimap and tile-summary helpers for Canvas v3.
 */

import type {
  CanvasObjectKind,
  CanvasObjectTypeCounts,
  CanvasTileSummary,
  MinimapSummary,
  MinimapSummaryMode,
  Rect,
  TileAddress
} from './types'
import { DEFAULT_CANVAS_TILE_SIZE } from './coordinates'
import { createTileId, getTileBounds } from './tiles'

const SMALL_SCENE_OBJECT_LIMIT = 1200
const HUGE_SCENE_OBJECT_LIMIT = 100_000_000

const CANVAS_OBJECT_KINDS: readonly CanvasObjectKind[] = [
  'page',
  'database',
  'external-reference',
  'media',
  'shape',
  'note',
  'group'
]

export type CanvasTileSummaryObject = {
  id: string
  kind: CanvasObjectKind
  position: Rect
}

export type CanvasTileSummaryEdge = {
  id: string
  sourceObjectId: string
  targetObjectId: string
}

export type CreateCanvasTileSummariesInput = {
  objects: readonly CanvasTileSummaryObject[]
  edges?: readonly CanvasTileSummaryEdge[]
  tileSize?: number
  densityColumns?: number
  densityRows?: number
  maxClustersPerTile?: number
}

type MutableCanvasTileSummary = Omit<CanvasTileSummary, 'density' | 'clusters'> & {
  density: {
    columns: number
    rows: number
    values: number[]
  }
  clusters: CanvasTileSummary['clusters']
}

export function createEmptyMinimapSummary(bounds?: Rect): MinimapSummary {
  return {
    bounds: bounds ?? { x: -500, y: -500, width: 1000, height: 1000 },
    mode: 'small-scene',
    totalObjectCount: 0,
    totalEdgeCount: 0,
    activePresenceCount: 0,
    tiles: []
  }
}

export function mergeCanvasObjectTypeCounts(
  counts: readonly CanvasObjectTypeCounts[]
): CanvasObjectTypeCounts {
  return counts.reduce<CanvasObjectTypeCounts>((accumulator, item) => {
    for (const kind of CANVAS_OBJECT_KINDS) {
      const count = item[kind] ?? 0
      if (count > 0) {
        accumulator[kind] = (accumulator[kind] ?? 0) + count
      }
    }

    return accumulator
  }, {})
}

export function getDominantCanvasObjectKind(
  counts: CanvasObjectTypeCounts,
  fallback: CanvasObjectKind = 'shape'
): CanvasObjectKind {
  return CANVAS_OBJECT_KINDS.reduce<CanvasObjectKind>((dominantKind, kind) => {
    return (counts[kind] ?? 0) > (counts[dominantKind] ?? 0) ? kind : dominantKind
  }, fallback)
}

export function getMinimapSummaryMode(totalObjectCount: number): MinimapSummaryMode {
  if (totalObjectCount > HUGE_SCENE_OBJECT_LIMIT) {
    return 'huge-scene'
  }

  if (totalObjectCount > SMALL_SCENE_OBJECT_LIMIT) {
    return 'large-scene'
  }

  return 'small-scene'
}

export function getBoundsForTileSummaries(tiles: readonly CanvasTileSummary[]): Rect {
  if (tiles.length === 0) {
    return { x: -500, y: -500, width: 1000, height: 1000 }
  }

  const minX = Math.min(...tiles.map((tile) => tile.bounds.x))
  const minY = Math.min(...tiles.map((tile) => tile.bounds.y))
  const maxX = Math.max(...tiles.map((tile) => tile.bounds.x + tile.bounds.width))
  const maxY = Math.max(...tiles.map((tile) => tile.bounds.y + tile.bounds.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

function createEmptyCanvasTileSummary(input: {
  address: TileAddress
  tileSize: number
  densityColumns: number
  densityRows: number
}): MutableCanvasTileSummary {
  const tileId = createTileId(input.address)

  return {
    tileId,
    address: input.address,
    bounds: getTileBounds(input.address, input.tileSize),
    objectCount: 0,
    edgeCount: 0,
    typeCounts: {},
    density: {
      columns: input.densityColumns,
      rows: input.densityRows,
      values: Array.from({ length: input.densityColumns * input.densityRows }, () => 0)
    },
    clusters: [],
    activePresenceCount: 0,
    dirty: false,
    stale: false
  }
}

function getObjectCenterTileAddress(
  object: CanvasTileSummaryObject,
  tileSize: number
): TileAddress {
  return {
    z: 0,
    x: Math.floor((object.position.x + object.position.width / 2) / tileSize),
    y: Math.floor((object.position.y + object.position.height / 2) / tileSize)
  }
}

function addObjectToDensity(
  summary: MutableCanvasTileSummary,
  object: CanvasTileSummaryObject
): void {
  const centerX = object.position.x + object.position.width / 2
  const centerY = object.position.y + object.position.height / 2
  const relativeX = (centerX - summary.bounds.x) / summary.bounds.width
  const relativeY = (centerY - summary.bounds.y) / summary.bounds.height
  const column = Math.max(
    0,
    Math.min(summary.density.columns - 1, Math.floor(relativeX * summary.density.columns))
  )
  const row = Math.max(
    0,
    Math.min(summary.density.rows - 1, Math.floor(relativeY * summary.density.rows))
  )

  summary.density.values[row * summary.density.columns + column] += 1
}

function createObjectCluster(
  object: CanvasTileSummaryObject
): CanvasTileSummary['clusters'][number] {
  return {
    id: object.id,
    bounds: object.position,
    objectCount: 1,
    dominantKind: object.kind,
    sampleObjectIds: [object.id]
  }
}

function freezeTileSummary(summary: MutableCanvasTileSummary): CanvasTileSummary {
  return {
    ...summary,
    density: {
      ...summary.density,
      values: [...summary.density.values]
    },
    clusters: [...summary.clusters]
  }
}

export function createCanvasTileSummaries({
  objects,
  edges = [],
  tileSize = DEFAULT_CANVAS_TILE_SIZE,
  densityColumns = 8,
  densityRows = 8,
  maxClustersPerTile = 128
}: CreateCanvasTileSummariesInput): CanvasTileSummary[] {
  const summaries = new Map<string, MutableCanvasTileSummary>()
  const objectTileIds = new Map<string, string>()
  const columns = Math.max(1, Math.floor(densityColumns))
  const rows = Math.max(1, Math.floor(densityRows))
  const clusterLimit = Math.max(0, Math.floor(maxClustersPerTile))

  for (const object of objects) {
    const address = getObjectCenterTileAddress(object, tileSize)
    const tileId = createTileId(address)
    const summary =
      summaries.get(tileId) ??
      createEmptyCanvasTileSummary({
        address,
        tileSize,
        densityColumns: columns,
        densityRows: rows
      })

    summary.objectCount += 1
    summary.typeCounts[object.kind] = (summary.typeCounts[object.kind] ?? 0) + 1
    addObjectToDensity(summary, object)
    summary.clusters = [...summary.clusters, createObjectCluster(object)].slice(0, clusterLimit)

    summaries.set(tileId, summary)
    objectTileIds.set(object.id, tileId)
  }

  for (const edge of edges) {
    const sourceTileId = objectTileIds.get(edge.sourceObjectId)
    const targetTileId = objectTileIds.get(edge.targetObjectId)

    if (sourceTileId) {
      const sourceSummary = summaries.get(sourceTileId)
      if (sourceSummary) {
        sourceSummary.edgeCount += 1
      }
    }

    if (targetTileId && targetTileId !== sourceTileId) {
      const targetSummary = summaries.get(targetTileId)
      if (targetSummary) {
        targetSummary.edgeCount += 1
      }
    }
  }

  return Array.from(summaries.values())
    .map(freezeTileSummary)
    .sort((left, right) => left.address.y - right.address.y || left.address.x - right.address.x)
}

export function createMinimapSummaryFromTileSummaries(
  tiles: readonly CanvasTileSummary[],
  bounds = getBoundsForTileSummaries(tiles)
): MinimapSummary {
  const totalObjectCount = tiles.reduce((total, tile) => total + tile.objectCount, 0)
  const totalEdgeCount = tiles.reduce((total, tile) => total + tile.edgeCount, 0)
  const activePresenceCount = tiles.reduce((total, tile) => total + tile.activePresenceCount, 0)

  return {
    bounds,
    mode: getMinimapSummaryMode(totalObjectCount),
    totalObjectCount,
    totalEdgeCount,
    activePresenceCount,
    tiles
  }
}
