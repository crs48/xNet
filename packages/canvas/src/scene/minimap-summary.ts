/**
 * Canvas v2 to Canvas v3 minimap-summary adapter.
 */

import type { CanvasEdge, CanvasNode, Rect } from '../types'
import type { CanvasTileSummary, MinimapSummary } from '@xnetjs/canvas-core'
import {
  DEFAULT_CANVAS_TILE_SIZE,
  createMinimapSummaryFromTileSummaries,
  createTileId,
  getTileBounds,
  parseTileId
} from '@xnetjs/canvas-core'
import { getCanvasEdgeSourceObjectId, getCanvasEdgeTargetObjectId } from '../edges/bindings'
import { getCanvasResolvedNodeKind } from './node-kind'

const DENSITY_COLUMNS = 8
const DENSITY_ROWS = 8

type CanvasMinimapSummaryInput = {
  nodes: readonly CanvasNode[]
  edges: readonly CanvasEdge[]
  tileSize?: number
}

type MutableTileSummary = Omit<CanvasTileSummary, 'clusters' | 'density'> & {
  density: {
    columns: number
    rows: number
    values: number[]
  }
  clusters: CanvasTileSummary['clusters']
}

function getCanvasNodeBounds(nodes: readonly CanvasNode[]): Rect {
  if (nodes.length === 0) {
    return { x: -500, y: -500, width: 1000, height: 1000 }
  }

  const minX = Math.min(...nodes.map((node) => node.position.x))
  const minY = Math.min(...nodes.map((node) => node.position.y))
  const maxX = Math.max(...nodes.map((node) => node.position.x + node.position.width))
  const maxY = Math.max(...nodes.map((node) => node.position.y + node.position.height))
  const padding = Math.max(100, (maxX - minX) * 0.1, (maxY - minY) * 0.1)

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2
  }
}

function createMutableSummary(tileId: string, tileSize: number): MutableTileSummary {
  const address = parseTileId(tileId) ?? { z: 0, x: 0, y: 0 }

  return {
    tileId,
    address,
    bounds: getTileBounds(address, tileSize),
    objectCount: 0,
    edgeCount: 0,
    typeCounts: {},
    density: {
      columns: DENSITY_COLUMNS,
      rows: DENSITY_ROWS,
      values: Array.from({ length: DENSITY_COLUMNS * DENSITY_ROWS }, () => 0)
    },
    clusters: [],
    activePresenceCount: 0,
    dirty: false,
    stale: false
  }
}

function getTileAddressForNode(
  node: CanvasNode,
  tileSize: number
): { z: number; x: number; y: number } {
  const centerX = node.position.x + node.position.width / 2
  const centerY = node.position.y + node.position.height / 2

  return {
    z: 0,
    x: Math.floor(centerX / tileSize),
    y: Math.floor(centerY / tileSize)
  }
}

function addNodeToDensity(summary: MutableTileSummary, node: CanvasNode): void {
  const relativeX =
    (node.position.x + node.position.width / 2 - summary.bounds.x) / summary.bounds.width
  const relativeY =
    (node.position.y + node.position.height / 2 - summary.bounds.y) / summary.bounds.height
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

function createNodeCluster(node: CanvasNode): CanvasTileSummary['clusters'][number] {
  const kind = getCanvasResolvedNodeKind(node)

  return {
    id: node.id,
    bounds: {
      x: node.position.x,
      y: node.position.y,
      width: node.position.width,
      height: node.position.height
    },
    objectCount: 1,
    dominantKind: kind === 'frame' ? 'group' : kind === 'legacy' ? 'shape' : kind,
    sampleObjectIds: [node.id]
  }
}

export function createMinimapSummaryFromCanvasScene({
  nodes,
  edges,
  tileSize = DEFAULT_CANVAS_TILE_SIZE
}: CanvasMinimapSummaryInput): MinimapSummary {
  if (nodes.length === 0) {
    return createMinimapSummaryFromTileSummaries([], getCanvasNodeBounds(nodes))
  }

  const tileSummaries = new Map<string, MutableTileSummary>()

  for (const node of nodes) {
    const address = getTileAddressForNode(node, tileSize)
    const tileId = createTileId(address)
    const summary = tileSummaries.get(tileId) ?? createMutableSummary(tileId, tileSize)
    const kind = getCanvasResolvedNodeKind(node)
    const objectKind = kind === 'frame' ? 'group' : kind === 'legacy' ? 'shape' : kind

    summary.objectCount += 1
    summary.typeCounts[objectKind] = (summary.typeCounts[objectKind] ?? 0) + 1
    addNodeToDensity(summary, node)
    summary.clusters = [...summary.clusters, createNodeCluster(node)]
      .sort((left, right) => right.objectCount - left.objectCount)
      .slice(0, 128)
    tileSummaries.set(tileId, summary)
  }

  const nodeToTileId = new Map(
    nodes.map((node) => [node.id, createTileId(getTileAddressForNode(node, tileSize))])
  )

  for (const edge of edges) {
    const sourceId = getCanvasEdgeSourceObjectId(edge)
    const targetId = getCanvasEdgeTargetObjectId(edge)
    const sourceTileId = sourceId ? nodeToTileId.get(sourceId) : undefined
    const targetTileId = targetId ? nodeToTileId.get(targetId) : undefined

    if (sourceTileId) {
      const sourceSummary = tileSummaries.get(sourceTileId)
      if (sourceSummary) {
        sourceSummary.edgeCount += 1
      }
    }

    if (targetTileId && targetTileId !== sourceTileId) {
      const targetSummary = tileSummaries.get(targetTileId)
      if (targetSummary) {
        targetSummary.edgeCount += 1
      }
    }
  }

  const summary = createMinimapSummaryFromTileSummaries(
    Array.from(tileSummaries.values()).map((summary) => ({
      ...summary,
      density: {
        ...summary.density,
        values: [...summary.density.values]
      },
      clusters: [...summary.clusters]
    })),
    getCanvasNodeBounds(nodes)
  )

  return {
    ...summary,
    totalEdgeCount: edges.length
  }
}
