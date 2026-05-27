/**
 * Canvas frame presentation and export helpers.
 */

import type { JsonCanvasDocument } from '../interop/json-canvas'
import type { CanvasEdge, CanvasNode, Rect } from '../types'
import { exportCanvasToJsonCanvas } from '../interop/json-canvas'
import { getCanvasContainerMemberIds, getCanvasContainerRole } from '../selection/scene-operations'
import { getCanvasFrameVariant, type CanvasFrameVariant } from './frame-variants'

export type CanvasFrameExportFormat = 'json-canvas'

export type CanvasFrameExportDocument = {
  format: CanvasFrameExportFormat
  frameId: string
  title: string
  exportedAt: string
  bounds: Rect
  variant: CanvasFrameVariant
  presentation: {
    exportRole?: 'slide'
    aspectRatio?: '16:9'
    layoutHint?: string
  }
  memberNodeIds: readonly string[]
  edgeIds: readonly string[]
  document: JsonCanvasDocument
}

export type CreateCanvasFrameExportDocumentInput = {
  frame: CanvasNode
  nodes: readonly CanvasNode[]
  edges?: readonly CanvasEdge[]
  includeXNetMetadata?: boolean
  exportedAt?: string
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getFrameTitle(frame: CanvasNode): string {
  return frame.alias ?? readNonEmptyString(frame.properties.title) ?? 'Canvas frame'
}

function getNodeRect(node: CanvasNode): Rect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.position.width,
    height: node.position.height
  }
}

function rectsIntersect(left: Rect, right: Rect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  )
}

function compareNodesByLayer(left: CanvasNode, right: CanvasNode): number {
  return (
    (left.position.zIndex ?? 0) - (right.position.zIndex ?? 0) || left.id.localeCompare(right.id)
  )
}

function edgeNodeIds(edge: CanvasEdge): readonly [string, string] {
  return [edge.source?.objectId ?? edge.sourceId, edge.target?.objectId ?? edge.targetId]
}

export function isCanvasNodeInsideFrameExportBounds(frame: CanvasNode, node: CanvasNode): boolean {
  if (node.id === frame.id) {
    return false
  }

  return rectsIntersect(getNodeRect(frame), getNodeRect(node))
}

export function getCanvasFrameExportMembers(
  frame: CanvasNode,
  nodes: readonly CanvasNode[]
): readonly CanvasNode[] {
  if (getCanvasContainerRole(frame) !== 'frame') {
    return []
  }

  const explicitMemberIds = new Set(getCanvasContainerMemberIds(frame))
  const memberMap = new Map<string, CanvasNode>()

  for (const node of nodes) {
    if (node.id === frame.id) {
      continue
    }

    if (explicitMemberIds.has(node.id) || isCanvasNodeInsideFrameExportBounds(frame, node)) {
      memberMap.set(node.id, node)
    }
  }

  return Array.from(memberMap.values()).sort(compareNodesByLayer)
}

export function getCanvasFrameExportEdges(
  memberNodeIds: readonly string[],
  edges: readonly CanvasEdge[] = []
): readonly CanvasEdge[] {
  const exportedIds = new Set(memberNodeIds)

  return edges
    .filter((edge) => {
      const [sourceId, targetId] = edgeNodeIds(edge)

      return exportedIds.has(sourceId) && exportedIds.has(targetId)
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function createCanvasFrameExportDocument({
  frame,
  nodes,
  edges = [],
  includeXNetMetadata = true,
  exportedAt = new Date().toISOString()
}: CreateCanvasFrameExportDocumentInput): CanvasFrameExportDocument {
  const members = getCanvasFrameExportMembers(frame, nodes)
  const memberNodeIds = members.map((node) => node.id)
  const exportedEdges = getCanvasFrameExportEdges([frame.id, ...memberNodeIds], edges)
  const exportNodes = [frame, ...members].sort(compareNodesByLayer)
  const title = getFrameTitle(frame)
  const aspectRatio = frame.properties.aspectRatio === '16:9' ? '16:9' : undefined
  const exportRole = frame.properties.exportRole === 'slide' ? 'slide' : undefined
  const layoutHint = readNonEmptyString(frame.properties.layoutHint) ?? undefined

  return {
    format: 'json-canvas',
    frameId: frame.id,
    title,
    exportedAt,
    bounds: getNodeRect(frame),
    variant: getCanvasFrameVariant(frame),
    presentation: {
      ...(exportRole ? { exportRole } : {}),
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(layoutHint ? { layoutHint } : {})
    },
    memberNodeIds,
    edgeIds: exportedEdges.map((edge) => edge.id),
    document: exportCanvasToJsonCanvas({
      nodes: exportNodes,
      edges: exportedEdges,
      includeXNetMetadata
    })
  }
}
