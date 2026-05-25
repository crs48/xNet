/**
 * Temporary flat-doc to Canvas v3 scene adapter.
 */

import type { CanvasEdge, CanvasNode } from '../types'
import type {
  CanvasConnectorRecord,
  CanvasObjectRecord,
  CanvasTileSummary,
  MinimapSummary,
  Rect
} from '@xnetjs/canvas-core'
import {
  DEFAULT_CANVAS_TILE_SIZE,
  createCanvasTileSummaries,
  createMinimapSummaryFromTileSummaries,
  createTileId,
  getBoundsForTileSummaries,
  getTileCoverageForRect
} from '@xnetjs/canvas-core'
import * as Y from 'yjs'
import { getCanvasEdgeNodeIds } from '../edges/bindings'
import { getCanvasConnectorsMap, getCanvasObjectsMap } from './doc-layout'
import { canvasEdgeToConnectorRecord, canvasNodeToObjectRecord } from './tile-doc-schema'

export type CanvasV3MigrationScene = {
  objects: readonly CanvasObjectRecord[]
  connectors: readonly CanvasConnectorRecord[]
  sourceNodesById: ReadonlyMap<string, CanvasNode>
  objectTileIds: ReadonlyMap<string, string>
  summaries: readonly CanvasTileSummary[]
  minimapSummary: MinimapSummary
  bounds: Rect | null
}

function getObjectTileId(object: CanvasObjectRecord, tileSize: number): string {
  const coverage = getTileCoverageForRect(
    {
      x: object.position.x + object.position.width / 2,
      y: object.position.y + object.position.height / 2,
      width: 1,
      height: 1
    },
    tileSize,
    0
  )

  return createTileId({ z: 0, x: coverage.minX, y: coverage.minY })
}

function getBoundsForObjects(objects: readonly CanvasObjectRecord[]): Rect | null {
  if (objects.length === 0) {
    return null
  }

  const minX = Math.min(...objects.map((object) => object.position.x))
  const minY = Math.min(...objects.map((object) => object.position.y))
  const maxX = Math.max(...objects.map((object) => object.position.x + object.position.width))
  const maxY = Math.max(...objects.map((object) => object.position.y + object.position.height))

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

/**
 * Read a Canvas v2 flat Y.Doc into the v3 tile scene shape.
 *
 * This is intentionally the only active renderer adapter that may materialize
 * the legacy flat maps. Native v3 providers should stream tile docs instead.
 */
export function readCanvasV3MigrationSceneFromFlatDoc(
  doc: Y.Doc,
  tileSize = DEFAULT_CANVAS_TILE_SIZE
): CanvasV3MigrationScene {
  const sourceNodes = Array.from(getCanvasObjectsMap<CanvasNode>(doc).values())
  const sourceNodesById = new Map(sourceNodes.map((node) => [node.id, node]))
  const objects = sourceNodes.map(canvasNodeToObjectRecord)
  const objectTileIds = new Map(
    objects.map((object) => [object.id, getObjectTileId(object, tileSize)] as const)
  )
  const fallbackTileId = objectTileIds.values().next().value as string | undefined
  const connectors = Array.from(getCanvasConnectorsMap<CanvasEdge>(doc).values())
    .map((edge) => {
      const [sourceId] = getCanvasEdgeNodeIds(edge)
      const connectorFallbackTileId =
        (sourceId ? objectTileIds.get(sourceId) : undefined) ?? fallbackTileId

      if (!connectorFallbackTileId) {
        return null
      }

      return canvasEdgeToConnectorRecord({
        edge,
        nodesById: sourceNodesById,
        objectTileIds,
        fallbackTileId: connectorFallbackTileId
      })
    })
    .filter((connector): connector is CanvasConnectorRecord => connector !== null)
  const summaries = createCanvasTileSummaries({
    objects,
    edges: connectors.map((connector) => ({
      id: connector.id,
      sourceObjectId: connector.source.objectId,
      targetObjectId: connector.target.objectId
    })),
    tileSize
  })
  const bounds = getBoundsForObjects(objects)
  const summaryBounds = summaries.length > 0 ? getBoundsForTileSummaries(summaries) : undefined

  return {
    objects,
    connectors,
    sourceNodesById,
    objectTileIds,
    summaries,
    minimapSummary: createMinimapSummaryFromTileSummaries(summaries, bounds ?? summaryBounds),
    bounds
  }
}
