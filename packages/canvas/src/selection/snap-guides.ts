/**
 * Smart snapping and guide calculations for canvas direct manipulation.
 */

import type { CanvasSnapGuide } from '../interaction/controller'
import type { CanvasNode, Point, Rect } from '../types'
import { isFrameLikeCanvasNode } from '../scene/node-kind'

export type CanvasSnapGuideSegment = CanvasSnapGuide & {
  start: number
  end: number
  relatedNodeIds: string[]
}

export type CanvasSmartSnapResult = {
  canvasDelta: Point
  guides: CanvasSnapGuideSegment[]
}

export type CreateCanvasSmartSnapOptions = {
  movingBounds: Rect
  stationaryNodes: readonly CanvasNode[]
  canvasDelta: Point
  threshold?: number
  searchRadius?: number
  maxCandidateNodes?: number
  maxGuides?: number
}

type SnapAxis = 'x' | 'y'
type SnapAnchorKind = 'start' | 'center' | 'end'

type SnapAnchor = {
  kind: SnapAnchorKind
  value: number
}

type SnapCandidate = {
  axis: SnapAxis
  adjustment: number
  distance: number
  priority: number
  guide: CanvasSnapGuideSegment
}

const DEFAULT_SMART_SNAP_THRESHOLD = 8
const DEFAULT_SMART_SNAP_SEARCH_RADIUS = 1600
const DEFAULT_SMART_SNAP_MAX_CANDIDATE_NODES = 96
const DEFAULT_SMART_SNAP_MAX_GUIDES = 4

function getRectCenter(rect: Rect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  }
}

function getRectDistance(left: Rect, right: Rect): number {
  const leftCenter = getRectCenter(left)
  const rightCenter = getRectCenter(right)

  return Math.hypot(leftCenter.x - rightCenter.x, leftCenter.y - rightCenter.y)
}

function getNodeRect(node: CanvasNode): Rect {
  return {
    x: node.position.x,
    y: node.position.y,
    width: node.position.width,
    height: node.position.height
  }
}

function shiftRect(rect: Rect, delta: Point): Rect {
  return {
    ...rect,
    x: rect.x + delta.x,
    y: rect.y + delta.y
  }
}

function getVerticalAnchors(rect: Rect): SnapAnchor[] {
  return [
    { kind: 'start', value: rect.x },
    { kind: 'center', value: rect.x + rect.width / 2 },
    { kind: 'end', value: rect.x + rect.width }
  ]
}

function getHorizontalAnchors(rect: Rect): SnapAnchor[] {
  return [
    { kind: 'start', value: rect.y },
    { kind: 'center', value: rect.y + rect.height / 2 },
    { kind: 'end', value: rect.y + rect.height }
  ]
}

function getGuideSpan(left: Rect, right: Rect, axis: SnapAxis): { start: number; end: number } {
  const values =
    axis === 'x'
      ? [left.y, left.y + left.height, right.y, right.y + right.height]
      : [left.x, left.x + left.width, right.x, right.x + right.width]

  return {
    start: Math.min(...values),
    end: Math.max(...values)
  }
}

function getAnchorLabel(kind: SnapAnchorKind): string {
  switch (kind) {
    case 'start':
      return 'edge'
    case 'center':
      return 'center'
    case 'end':
      return 'edge'
  }
}

function getAlignmentPriority(
  source: CanvasSnapGuide['source'],
  targetAnchor: SnapAnchorKind
): number {
  if (source === 'frame' && targetAnchor !== 'center') {
    return 0
  }

  if (source === 'frame') {
    return 1
  }

  return targetAnchor === 'center' ? 3 : 2
}

function createAlignmentCandidates(input: {
  movingRect: Rect
  targetNode: CanvasNode
  threshold: number
}): SnapCandidate[] {
  const targetRect = getNodeRect(input.targetNode)
  const source = isFrameLikeCanvasNode(input.targetNode) ? 'frame' : 'object'
  const verticalSpan = getGuideSpan(input.movingRect, targetRect, 'x')
  const horizontalSpan = getGuideSpan(input.movingRect, targetRect, 'y')
  const candidates: SnapCandidate[] = []

  for (const movingAnchor of getVerticalAnchors(input.movingRect)) {
    for (const targetAnchor of getVerticalAnchors(targetRect)) {
      const adjustment = targetAnchor.value - movingAnchor.value
      const distance = Math.abs(adjustment)

      if (distance <= input.threshold) {
        candidates.push({
          axis: 'x',
          adjustment,
          distance,
          priority: getAlignmentPriority(source, targetAnchor.kind),
          guide: {
            id: `snap:${source}:vertical:${input.targetNode.id}:${targetAnchor.kind}`,
            source,
            orientation: 'vertical',
            position: targetAnchor.value,
            start: verticalSpan.start,
            end: verticalSpan.end,
            relatedNodeIds: [input.targetNode.id],
            label: `${source} ${getAnchorLabel(targetAnchor.kind)}`
          }
        })
      }
    }
  }

  for (const movingAnchor of getHorizontalAnchors(input.movingRect)) {
    for (const targetAnchor of getHorizontalAnchors(targetRect)) {
      const adjustment = targetAnchor.value - movingAnchor.value
      const distance = Math.abs(adjustment)

      if (distance <= input.threshold) {
        candidates.push({
          axis: 'y',
          adjustment,
          distance,
          priority: getAlignmentPriority(source, targetAnchor.kind),
          guide: {
            id: `snap:${source}:horizontal:${input.targetNode.id}:${targetAnchor.kind}`,
            source,
            orientation: 'horizontal',
            position: targetAnchor.value,
            start: horizontalSpan.start,
            end: horizontalSpan.end,
            relatedNodeIds: [input.targetNode.id],
            label: `${source} ${getAnchorLabel(targetAnchor.kind)}`
          }
        })
      }
    }
  }

  return candidates
}

function createHorizontalSpacingCandidate(input: {
  movingRect: Rect
  leftNode: CanvasNode
  rightNode: CanvasNode
  threshold: number
}): SnapCandidate | null {
  const leftRect = getNodeRect(input.leftNode)
  const rightRect = getNodeRect(input.rightNode)
  const leftEdge = leftRect.x + leftRect.width
  const rightEdge = rightRect.x

  if (leftEdge > input.movingRect.x || input.movingRect.x + input.movingRect.width > rightEdge) {
    return null
  }

  const targetX = leftEdge + (rightEdge - leftEdge - input.movingRect.width) / 2
  const adjustment = targetX - input.movingRect.x
  const distance = Math.abs(adjustment)

  if (distance > input.threshold) {
    return null
  }

  const gap = Math.round(targetX - leftEdge)
  const span = getGuideSpan(leftRect, rightRect, 'x')

  return {
    axis: 'x',
    adjustment,
    distance,
    priority: 4,
    guide: {
      id: `snap:spacing:vertical:${input.leftNode.id}:${input.rightNode.id}`,
      source: 'spacing',
      orientation: 'vertical',
      position: targetX + input.movingRect.width / 2,
      start: span.start,
      end: span.end,
      relatedNodeIds: [input.leftNode.id, input.rightNode.id],
      label: `Equal ${gap}px`
    }
  }
}

function createVerticalSpacingCandidate(input: {
  movingRect: Rect
  topNode: CanvasNode
  bottomNode: CanvasNode
  threshold: number
}): SnapCandidate | null {
  const topRect = getNodeRect(input.topNode)
  const bottomRect = getNodeRect(input.bottomNode)
  const topEdge = topRect.y + topRect.height
  const bottomEdge = bottomRect.y

  if (topEdge > input.movingRect.y || input.movingRect.y + input.movingRect.height > bottomEdge) {
    return null
  }

  const targetY = topEdge + (bottomEdge - topEdge - input.movingRect.height) / 2
  const adjustment = targetY - input.movingRect.y
  const distance = Math.abs(adjustment)

  if (distance > input.threshold) {
    return null
  }

  const gap = Math.round(targetY - topEdge)
  const span = getGuideSpan(topRect, bottomRect, 'y')

  return {
    axis: 'y',
    adjustment,
    distance,
    priority: 4,
    guide: {
      id: `snap:spacing:horizontal:${input.topNode.id}:${input.bottomNode.id}`,
      source: 'spacing',
      orientation: 'horizontal',
      position: targetY + input.movingRect.height / 2,
      start: span.start,
      end: span.end,
      relatedNodeIds: [input.topNode.id, input.bottomNode.id],
      label: `Equal ${gap}px`
    }
  }
}

function createSpacingCandidates(
  movingRect: Rect,
  stationaryNodes: readonly CanvasNode[],
  threshold: number
): SnapCandidate[] {
  const candidates: SnapCandidate[] = []
  const horizontalNodes = [...stationaryNodes].sort(
    (left, right) => left.position.x - right.position.x
  )
  const verticalNodes = [...stationaryNodes].sort(
    (left, right) => left.position.y - right.position.y
  )

  for (let index = 0; index < horizontalNodes.length - 1; index += 1) {
    const leftNode = horizontalNodes[index]
    const rightNode = horizontalNodes[index + 1]

    if (!leftNode || !rightNode) {
      continue
    }

    const candidate = createHorizontalSpacingCandidate({
      movingRect,
      leftNode,
      rightNode,
      threshold
    })

    if (candidate) {
      candidates.push(candidate)
    }
  }

  for (let index = 0; index < verticalNodes.length - 1; index += 1) {
    const topNode = verticalNodes[index]
    const bottomNode = verticalNodes[index + 1]

    if (!topNode || !bottomNode) {
      continue
    }

    const candidate = createVerticalSpacingCandidate({
      movingRect,
      topNode,
      bottomNode,
      threshold
    })

    if (candidate) {
      candidates.push(candidate)
    }
  }

  return candidates
}

function getNearbyStationaryNodes(input: {
  movingBounds: Rect
  stationaryNodes: readonly CanvasNode[]
  searchRadius: number
  maxCandidateNodes: number
}): CanvasNode[] {
  return input.stationaryNodes
    .map((node) => ({
      node,
      distance: getRectDistance(input.movingBounds, getNodeRect(node))
    }))
    .filter((entry) => entry.distance <= input.searchRadius)
    .sort(
      (left, right) => left.distance - right.distance || left.node.id.localeCompare(right.node.id)
    )
    .slice(0, input.maxCandidateNodes)
    .map((entry) => entry.node)
}

function getBestCandidate(
  candidates: readonly SnapCandidate[],
  axis: SnapAxis
): SnapCandidate | null {
  return (
    candidates
      .filter((candidate) => candidate.axis === axis)
      .sort(
        (left, right) =>
          left.distance - right.distance ||
          left.priority - right.priority ||
          left.guide.id.localeCompare(right.guide.id)
      )[0] ?? null
  )
}

export function createCanvasSmartSnap(
  options: CreateCanvasSmartSnapOptions
): CanvasSmartSnapResult {
  const threshold = options.threshold ?? DEFAULT_SMART_SNAP_THRESHOLD
  const movingRect = shiftRect(options.movingBounds, options.canvasDelta)
  const nearbyNodes = getNearbyStationaryNodes({
    movingBounds: movingRect,
    stationaryNodes: options.stationaryNodes,
    searchRadius: options.searchRadius ?? DEFAULT_SMART_SNAP_SEARCH_RADIUS,
    maxCandidateNodes: options.maxCandidateNodes ?? DEFAULT_SMART_SNAP_MAX_CANDIDATE_NODES
  })
  const candidates = [
    ...nearbyNodes.flatMap((targetNode) =>
      createAlignmentCandidates({
        movingRect,
        targetNode,
        threshold
      })
    ),
    ...createSpacingCandidates(movingRect, nearbyNodes, threshold)
  ]
  const bestX = getBestCandidate(candidates, 'x')
  const bestY = getBestCandidate(candidates, 'y')
  const selectedGuides = [bestX, bestY]
    .filter((candidate): candidate is SnapCandidate => candidate !== null)
    .map((candidate) => candidate.guide)
    .slice(0, options.maxGuides ?? DEFAULT_SMART_SNAP_MAX_GUIDES)

  return {
    canvasDelta: {
      x: options.canvasDelta.x + (bestX?.adjustment ?? 0),
      y: options.canvasDelta.y + (bestY?.adjustment ?? 0)
    },
    guides: selectedGuides
  }
}
