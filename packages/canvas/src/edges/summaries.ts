/**
 * Far-zoom edge summaries and minimap relationship hints.
 */

import type {
  CanvasEdge,
  CanvasEdgeRelationshipDirection,
  CanvasEdgeRelationshipKind,
  CanvasNode,
  EdgeStyle,
  Point,
  Rect
} from '../types'
import type { CanvasConnectorRecordKind } from './relationships'
import { DEFAULT_CANVAS_TILE_SIZE, createTileId, getTileCoverageForRect } from '@xnetjs/canvas-core'
import { getCanvasEdgeSourceObjectId, getCanvasEdgeTargetObjectId } from './bindings'
import { getCanvasEdgePresentation } from './presentation'
import {
  getCanvasConnectorKindForRelationship,
  normalizeCanvasEdgeRelationship
} from './relationships'

const DEFAULT_MAX_SAMPLE_EDGES = 8
const DEFAULT_MAX_MINIMAP_HINTS = 64
const MIN_HINT_OPACITY = 0.2
const MAX_HINT_OPACITY = 0.72

export type CanvasFarZoomEdgeSummary = {
  id: string
  relationshipKind: CanvasEdgeRelationshipKind
  relationshipDirection: CanvasEdgeRelationshipDirection
  connectorKind: CanvasConnectorRecordKind
  label: string
  sourceTileId: string
  targetTileId: string
  edgeCount: number
  bounds: Rect
  sourceCentroid: Point
  targetCentroid: Point
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
  markerEnd?: EdgeStyle['markerEnd']
  sampleEdgeIds: readonly string[]
  sourceObjectIds: readonly string[]
  targetObjectIds: readonly string[]
}

export type CanvasMinimapRelationshipHint = {
  id: string
  relationshipKind: CanvasEdgeRelationshipKind
  label: string
  edgeCount: number
  source: Point
  target: Point
  bounds: Rect
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
  markerEnd?: EdgeStyle['markerEnd']
  opacity: number
  sampleEdgeIds: readonly string[]
}

export type CreateCanvasFarZoomEdgeSummariesInput = {
  nodes: readonly CanvasNode[]
  edges: readonly CanvasEdge[]
  tileSize?: number
  maxSampleEdges?: number
}

export type CreateCanvasMinimapRelationshipHintsInput = {
  summaries: readonly CanvasFarZoomEdgeSummary[]
  maxHints?: number
  minEdgeCount?: number
}

type EdgeSummaryRow = {
  edge: CanvasEdge
  relationshipKind: CanvasEdgeRelationshipKind
  relationshipDirection: CanvasEdgeRelationshipDirection
  connectorKind: CanvasConnectorRecordKind
  label: string
  sourceObjectId: string
  targetObjectId: string
  sourceTileId: string
  targetTileId: string
  sourcePoint: Point
  targetPoint: Point
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
  markerEnd?: EdgeStyle['markerEnd']
}

type MutableCanvasFarZoomEdgeSummary = Omit<
  CanvasFarZoomEdgeSummary,
  | 'bounds'
  | 'sourceCentroid'
  | 'targetCentroid'
  | 'sampleEdgeIds'
  | 'sourceObjectIds'
  | 'targetObjectIds'
> & {
  minX: number
  minY: number
  maxX: number
  maxY: number
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sampleEdgeIds: string[]
  sourceObjectIds: Set<string>
  targetObjectIds: Set<string>
}

function getNodeCenter(node: CanvasNode): Point {
  return {
    x: node.position.x + node.position.width / 2,
    y: node.position.y + node.position.height / 2
  }
}

function getNodeTileId(node: CanvasNode, tileSize: number): string {
  const coverage = getTileCoverageForRect(
    {
      ...getNodeCenter(node),
      width: 1,
      height: 1
    },
    tileSize,
    0
  )

  return createTileId({ z: 0, x: coverage.minX, y: coverage.minY })
}

function getRelationshipKindLabel(kind: CanvasEdgeRelationshipKind): string {
  switch (kind) {
    case 'parent-child':
      return 'Parent child'
    case 'depends-on':
      return 'Depends on'
    case 'blocks':
      return 'Blocks'
    case 'references':
      return 'References'
    case 'duplicates':
      return 'Duplicates'
    case 'contains':
      return 'Contains'
    case 'custom':
      return 'Custom'
    case 'relates-to':
    default:
      return 'Relates to'
  }
}

function getSummaryId(row: EdgeSummaryRow): string {
  return [
    'edge-summary',
    row.relationshipKind,
    row.relationshipDirection,
    row.sourceTileId,
    row.targetTileId
  ].join(':')
}

function createSummaryFromRow(row: EdgeSummaryRow): MutableCanvasFarZoomEdgeSummary {
  const summary = {
    id: getSummaryId(row),
    relationshipKind: row.relationshipKind,
    relationshipDirection: row.relationshipDirection,
    connectorKind: row.connectorKind,
    label: row.label,
    sourceTileId: row.sourceTileId,
    targetTileId: row.targetTileId,
    edgeCount: 0,
    minX: Math.min(row.sourcePoint.x, row.targetPoint.x),
    minY: Math.min(row.sourcePoint.y, row.targetPoint.y),
    maxX: Math.max(row.sourcePoint.x, row.targetPoint.x),
    maxY: Math.max(row.sourcePoint.y, row.targetPoint.y),
    sourceX: 0,
    sourceY: 0,
    targetX: 0,
    targetY: 0,
    stroke: row.stroke,
    strokeWidth: row.strokeWidth,
    sampleEdgeIds: [],
    sourceObjectIds: new Set<string>(),
    targetObjectIds: new Set<string>()
  }

  return {
    ...summary,
    ...(row.strokeDasharray ? { strokeDasharray: row.strokeDasharray } : {}),
    ...(row.markerEnd ? { markerEnd: row.markerEnd } : {})
  }
}

function addRowToSummary(
  summary: MutableCanvasFarZoomEdgeSummary,
  row: EdgeSummaryRow,
  maxSampleEdges: number
): MutableCanvasFarZoomEdgeSummary {
  summary.edgeCount += 1
  summary.minX = Math.min(summary.minX, row.sourcePoint.x, row.targetPoint.x)
  summary.minY = Math.min(summary.minY, row.sourcePoint.y, row.targetPoint.y)
  summary.maxX = Math.max(summary.maxX, row.sourcePoint.x, row.targetPoint.x)
  summary.maxY = Math.max(summary.maxY, row.sourcePoint.y, row.targetPoint.y)
  summary.sourceX += row.sourcePoint.x
  summary.sourceY += row.sourcePoint.y
  summary.targetX += row.targetPoint.x
  summary.targetY += row.targetPoint.y
  summary.sourceObjectIds.add(row.sourceObjectId)
  summary.targetObjectIds.add(row.targetObjectId)

  if (summary.sampleEdgeIds.length < maxSampleEdges) {
    summary.sampleEdgeIds.push(row.edge.id)
  }

  return summary
}

function freezeSummary(summary: MutableCanvasFarZoomEdgeSummary): CanvasFarZoomEdgeSummary {
  const frozenSummary = {
    id: summary.id,
    relationshipKind: summary.relationshipKind,
    relationshipDirection: summary.relationshipDirection,
    connectorKind: summary.connectorKind,
    label: summary.label,
    sourceTileId: summary.sourceTileId,
    targetTileId: summary.targetTileId,
    edgeCount: summary.edgeCount,
    bounds: {
      x: summary.minX,
      y: summary.minY,
      width: summary.maxX - summary.minX,
      height: summary.maxY - summary.minY
    },
    sourceCentroid: {
      x: summary.sourceX / summary.edgeCount,
      y: summary.sourceY / summary.edgeCount
    },
    targetCentroid: {
      x: summary.targetX / summary.edgeCount,
      y: summary.targetY / summary.edgeCount
    },
    stroke: summary.stroke,
    strokeWidth: summary.strokeWidth,
    sampleEdgeIds: [...summary.sampleEdgeIds].sort(),
    sourceObjectIds: Array.from(summary.sourceObjectIds).sort(),
    targetObjectIds: Array.from(summary.targetObjectIds).sort()
  }

  return {
    ...frozenSummary,
    ...(summary.strokeDasharray ? { strokeDasharray: summary.strokeDasharray } : {}),
    ...(summary.markerEnd ? { markerEnd: summary.markerEnd } : {})
  }
}

function createSummaryRows(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  tileSize: number
): EdgeSummaryRow[] {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const centersById = new Map(nodes.map((node) => [node.id, getNodeCenter(node)]))
  const tileIdsById = new Map(nodes.map((node) => [node.id, getNodeTileId(node, tileSize)]))

  return edges
    .map((edge) => {
      const sourceObjectId = getCanvasEdgeSourceObjectId(edge)
      const targetObjectId = getCanvasEdgeTargetObjectId(edge)
      if (!sourceObjectId || !targetObjectId || !nodesById.has(sourceObjectId)) {
        return null
      }
      if (!nodesById.has(targetObjectId)) {
        return null
      }

      const sourcePoint = centersById.get(sourceObjectId)
      const targetPoint = centersById.get(targetObjectId)
      const sourceTileId = tileIdsById.get(sourceObjectId)
      const targetTileId = tileIdsById.get(targetObjectId)
      if (!sourcePoint || !targetPoint || !sourceTileId || !targetTileId) {
        return null
      }

      const relationship = normalizeCanvasEdgeRelationship(edge.relationship)
      const presentation = getCanvasEdgePresentation(edge)

      return {
        edge,
        relationshipKind: relationship.kind,
        relationshipDirection: relationship.direction ?? 'directed',
        connectorKind: getCanvasConnectorKindForRelationship(relationship),
        label: presentation.label ?? getRelationshipKindLabel(relationship.kind),
        sourceObjectId,
        targetObjectId,
        sourceTileId,
        targetTileId,
        sourcePoint,
        targetPoint,
        stroke: presentation.stroke,
        strokeWidth: presentation.strokeWidth,
        ...(presentation.strokeDasharray ? { strokeDasharray: presentation.strokeDasharray } : {}),
        ...(presentation.markerEnd ? { markerEnd: presentation.markerEnd } : {})
      }
    })
    .filter((row): row is EdgeSummaryRow => row !== null)
    .sort((left, right) => left.edge.id.localeCompare(right.edge.id))
}

export function createCanvasFarZoomEdgeSummaries({
  nodes,
  edges,
  tileSize = DEFAULT_CANVAS_TILE_SIZE,
  maxSampleEdges = DEFAULT_MAX_SAMPLE_EDGES
}: CreateCanvasFarZoomEdgeSummariesInput): CanvasFarZoomEdgeSummary[] {
  const boundedMaxSampleEdges = Math.max(0, Math.floor(maxSampleEdges))
  const rows = createSummaryRows(nodes, edges, tileSize)
  const summaries = rows.reduce<Map<string, MutableCanvasFarZoomEdgeSummary>>((groups, row) => {
    const id = getSummaryId(row)
    const summary = groups.get(id) ?? createSummaryFromRow(row)

    groups.set(id, addRowToSummary(summary, row, boundedMaxSampleEdges))
    return groups
  }, new Map())

  return Array.from(summaries.values())
    .map(freezeSummary)
    .sort(
      (left, right) =>
        right.edgeCount - left.edgeCount ||
        left.relationshipKind.localeCompare(right.relationshipKind) ||
        left.sourceTileId.localeCompare(right.sourceTileId) ||
        left.targetTileId.localeCompare(right.targetTileId)
    )
}

export function createCanvasMinimapRelationshipHints({
  summaries,
  maxHints = DEFAULT_MAX_MINIMAP_HINTS,
  minEdgeCount = 1
}: CreateCanvasMinimapRelationshipHintsInput): CanvasMinimapRelationshipHint[] {
  const boundedMaxHints = Math.max(0, Math.floor(maxHints))
  const boundedMinEdgeCount = Math.max(1, Math.floor(minEdgeCount))
  const eligibleSummaries = summaries
    .filter((summary) => summary.edgeCount >= boundedMinEdgeCount)
    .sort(
      (left, right) =>
        right.edgeCount - left.edgeCount ||
        left.relationshipKind.localeCompare(right.relationshipKind) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, boundedMaxHints)
  const maxEdgeCount = Math.max(1, ...eligibleSummaries.map((summary) => summary.edgeCount))

  return eligibleSummaries.map((summary) => {
    const weight = Math.min(1, summary.edgeCount / maxEdgeCount)

    const hint = {
      id: `minimap:${summary.id}`,
      relationshipKind: summary.relationshipKind,
      label: summary.edgeCount > 1 ? `${summary.label} (${summary.edgeCount})` : summary.label,
      edgeCount: summary.edgeCount,
      source: summary.sourceCentroid,
      target: summary.targetCentroid,
      bounds: summary.bounds,
      stroke: summary.stroke,
      strokeWidth: Math.max(1, summary.strokeWidth + Math.min(summary.edgeCount - 1, 4) * 0.25),
      opacity: MIN_HINT_OPACITY + weight * (MAX_HINT_OPACITY - MIN_HINT_OPACITY),
      sampleEdgeIds: summary.sampleEdgeIds
    }

    return {
      ...hint,
      ...(summary.strokeDasharray ? { strokeDasharray: summary.strokeDasharray } : {}),
      ...(summary.markerEnd ? { markerEnd: summary.markerEnd } : {})
    }
  })
}
