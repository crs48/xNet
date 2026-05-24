/**
 * Minimap and tile-summary helpers for Canvas v3.
 */

import type {
  CanvasObjectKind,
  CanvasObjectTypeCounts,
  CanvasTileSummary,
  MinimapSummary,
  MinimapSummaryMode,
  Rect
} from './types'

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
