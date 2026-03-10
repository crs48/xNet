/**
 * Canvas display-list builder.
 *
 * Creates one shared visibility result for:
 * - DOM-backed interactive islands
 * - canvas overview placeholders
 * - edge culling
 */

import type { Viewport } from '../spatial'
import type { CanvasStore } from '../store'
import type { CanvasEdge, CanvasNode, Rect } from '../types'
import { getCanvasEdgeSourceObjectId, getCanvasEdgeTargetObjectId } from '../edges/bindings'

export const DEFAULT_VISIBLE_BUFFER_PX = 200
export const DEFAULT_DOM_NODE_LIMIT = 48

export interface CanvasDisplayList {
  visibleRect: Rect
  expandedRect: Rect
  visibleNodes: CanvasNode[]
  visibleEdges: CanvasEdge[]
  domNodes: CanvasNode[]
  overviewNodes: CanvasNode[]
  nodeMap: Map<string, CanvasNode>
  visibleNodeIds: Set<string>
  domNodeIds: Set<string>
}

export interface CanvasDisplayListOptions {
  viewport: Viewport
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  store: Pick<CanvasStore, 'getVisibleNodes'>
  selectedNodeIds: ReadonlySet<string>
  visibleBufferPx?: number
  domNodeLimit?: number
}

function expandRect(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2
  }
}

function compareVisibleNodeOrder(left: CanvasNode, right: CanvasNode): number {
  const leftZ = left.position.zIndex ?? 0
  const rightZ = right.position.zIndex ?? 0
  if (leftZ !== rightZ) {
    return leftZ - rightZ
  }

  if (left.position.y !== right.position.y) {
    return left.position.y - right.position.y
  }

  return left.position.x - right.position.x
}

function getDomPriorityScore(node: CanvasNode, viewport: Viewport): number {
  const screenArea = node.position.width * node.position.height * viewport.zoom * viewport.zoom
  const centerX = node.position.x + node.position.width / 2
  const centerY = node.position.y + node.position.height / 2
  const distance = Math.abs(centerX - viewport.x) + Math.abs(centerY - viewport.y)
  const zIndex = node.position.zIndex ?? 0

  return screenArea + zIndex * 50 - distance * 0.25
}

function pickDomNodes(
  visibleNodes: CanvasNode[],
  selectedNodeIds: ReadonlySet<string>,
  viewport: Viewport,
  domNodeLimit: number
): CanvasNode[] {
  if (visibleNodes.length <= domNodeLimit) {
    return [...visibleNodes].sort(compareVisibleNodeOrder)
  }

  const selectedNodes = visibleNodes
    .filter((node) => selectedNodeIds.has(node.id))
    .sort(compareVisibleNodeOrder)
  const remainingSlots = Math.max(domNodeLimit - selectedNodes.length, 0)

  if (remainingSlots === 0) {
    return selectedNodes
  }

  const selectedIds = new Set(selectedNodes.map((node) => node.id))
  const candidates = visibleNodes
    .filter((node) => !selectedIds.has(node.id))
    .sort((left, right) => {
      const scoreDelta = getDomPriorityScore(right, viewport) - getDomPriorityScore(left, viewport)
      if (scoreDelta !== 0) {
        return scoreDelta
      }

      return compareVisibleNodeOrder(left, right)
    })
    .slice(0, remainingSlots)

  return [...selectedNodes, ...candidates].sort(compareVisibleNodeOrder)
}

export function createCanvasDisplayList({
  viewport,
  nodes,
  edges,
  store,
  selectedNodeIds,
  visibleBufferPx = DEFAULT_VISIBLE_BUFFER_PX,
  domNodeLimit = DEFAULT_DOM_NODE_LIMIT
}: CanvasDisplayListOptions): CanvasDisplayList {
  const visibleRect = viewport.getVisibleRect()
  const expandedRect = expandRect(visibleRect, visibleBufferPx / Math.max(viewport.zoom, 0.01))
  const visibleNodes = store.getVisibleNodes(expandedRect).sort(compareVisibleNodeOrder)
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))
  const visibleEdges = edges.filter((edge) => {
    const sourceId = getCanvasEdgeSourceObjectId(edge)
    const targetId = getCanvasEdgeTargetObjectId(edge)
    return (
      (sourceId !== null && visibleNodeIds.has(sourceId)) ||
      (targetId !== null && visibleNodeIds.has(targetId))
    )
  })
  const domNodes = pickDomNodes(visibleNodes, selectedNodeIds, viewport, domNodeLimit)
  const domNodeIds = new Set(domNodes.map((node) => node.id))
  const overviewNodes = visibleNodes.filter((node) => !domNodeIds.has(node.id))

  return {
    visibleRect,
    expandedRect,
    visibleNodes,
    visibleEdges,
    domNodes,
    overviewNodes,
    nodeMap,
    visibleNodeIds,
    domNodeIds
  }
}
