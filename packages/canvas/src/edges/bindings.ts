/**
 * Connector binding helpers.
 *
 * Normalizes durable edge endpoints and resolves anchor positions shared by
 * connectors, comments, and future deep-link anchors.
 */

import type {
  CanvasEdge,
  CanvasEdgeEndpoint,
  CanvasNode,
  CanvasObjectAnchorPlacement,
  EdgeAnchor,
  Point,
  Rect
} from '../types'

type RectLike = Pick<Rect, 'x' | 'y' | 'width' | 'height'>

const EDGE_ANCHOR_PLACEMENTS = new Set<CanvasObjectAnchorPlacement>([
  'top',
  'right',
  'bottom',
  'left',
  'center',
  'auto',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
])

function clampRatio(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function formatRatio(value: number): string {
  return clampRatio(value)
    .toFixed(3)
    .replace(/\.?0+$/, '')
}

function toRectLike(nodeOrRect: CanvasNode | RectLike): RectLike {
  return 'position' in nodeOrRect ? nodeOrRect.position : nodeOrRect
}

function getRectCenter(rect: RectLike): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  }
}

function isFiniteRatio(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function getCanvasEdgeSourceObjectId(edge: CanvasEdge): string | null {
  return edge.source?.objectId ?? edge.sourceId ?? null
}

export function getCanvasEdgeTargetObjectId(edge: CanvasEdge): string | null {
  return edge.target?.objectId ?? edge.targetId ?? null
}

export function getCanvasEdgeNodeIds(edge: CanvasEdge): [string | null, string | null] {
  return [getCanvasEdgeSourceObjectId(edge), getCanvasEdgeTargetObjectId(edge)]
}

export function createCanvasObjectAnchorId(
  endpoint: Pick<
    CanvasEdgeEndpoint,
    'objectId' | 'anchorId' | 'placement' | 'xRatio' | 'yRatio' | 'blockAnchorId'
  >
): string {
  if (endpoint.anchorId) {
    return endpoint.anchorId
  }

  const placementSegment =
    isFiniteRatio(endpoint.xRatio) && isFiniteRatio(endpoint.yRatio)
      ? `ratio:${formatRatio(endpoint.xRatio)},${formatRatio(endpoint.yRatio)}`
      : `placement:${endpoint.placement ?? 'auto'}`

  return endpoint.blockAnchorId
    ? `${endpoint.objectId}#${placementSegment}#block:${endpoint.blockAnchorId}`
    : `${endpoint.objectId}#${placementSegment}`
}

export function createCanvasEdgeEndpoint(
  objectId: string,
  endpoint: Omit<CanvasEdgeEndpoint, 'objectId'> = {}
): CanvasEdgeEndpoint {
  const nextEndpoint: CanvasEdgeEndpoint = {
    objectId,
    ...endpoint
  }

  return {
    ...nextEndpoint,
    anchorId: createCanvasObjectAnchorId(nextEndpoint)
  }
}

export function toLegacyEdgeAnchor(
  placement: CanvasObjectAnchorPlacement | undefined,
  xRatio?: number,
  yRatio?: number
): EdgeAnchor {
  if (isFiniteRatio(xRatio) && isFiniteRatio(yRatio)) {
    const distanceToLeft = xRatio
    const distanceToRight = 1 - xRatio
    const distanceToTop = yRatio
    const distanceToBottom = 1 - yRatio
    const minDistance = Math.min(distanceToLeft, distanceToRight, distanceToTop, distanceToBottom)

    if (minDistance === distanceToTop) return 'top'
    if (minDistance === distanceToBottom) return 'bottom'
    if (minDistance === distanceToLeft) return 'left'
    return 'right'
  }

  switch (placement) {
    case 'top-left':
    case 'top-right':
      return 'top'
    case 'bottom-left':
    case 'bottom-right':
      return 'bottom'
    case 'top':
    case 'right':
    case 'bottom':
    case 'left':
    case 'center':
    case 'auto':
      return placement
    default:
      return 'auto'
  }
}

export function resolveAutoCanvasAnchorPlacement(rect: RectLike, otherPoint: Point): EdgeAnchor {
  const center = getRectCenter(rect)
  const dx = otherPoint.x - center.x
  const dy = otherPoint.y - center.y

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left'
  }

  return dy > 0 ? 'bottom' : 'top'
}

export function resolveCanvasAnchorPoint(
  rectLike: RectLike,
  endpoint: Partial<CanvasEdgeEndpoint> | undefined,
  targetPoint?: Point
): Point {
  const rect = toRectLike(rectLike)
  const xRatio = isFiniteRatio(endpoint?.xRatio) ? clampRatio(endpoint.xRatio) : null
  const yRatio = isFiniteRatio(endpoint?.yRatio) ? clampRatio(endpoint.yRatio) : null

  if (xRatio !== null && yRatio !== null) {
    return {
      x: rect.x + rect.width * xRatio + (endpoint?.offsetX ?? 0),
      y: rect.y + rect.height * yRatio + (endpoint?.offsetY ?? 0)
    }
  }

  const requestedPlacement =
    endpoint?.placement && EDGE_ANCHOR_PLACEMENTS.has(endpoint.placement)
      ? endpoint.placement
      : undefined
  const placement =
    requestedPlacement && requestedPlacement !== 'auto'
      ? requestedPlacement
      : targetPoint
        ? resolveAutoCanvasAnchorPlacement(rect, targetPoint)
        : (requestedPlacement ?? 'center')
  const center = getRectCenter(rect)
  const offsetX = endpoint?.offsetX ?? 0
  const offsetY = endpoint?.offsetY ?? 0

  switch (placement) {
    case 'top':
      return { x: center.x + offsetX, y: rect.y + offsetY }
    case 'right':
      return { x: rect.x + rect.width + offsetX, y: center.y + offsetY }
    case 'bottom':
      return { x: center.x + offsetX, y: rect.y + rect.height + offsetY }
    case 'left':
      return { x: rect.x + offsetX, y: center.y + offsetY }
    case 'top-left':
      return { x: rect.x + offsetX, y: rect.y + offsetY }
    case 'top-right':
      return { x: rect.x + rect.width + offsetX, y: rect.y + offsetY }
    case 'bottom-left':
      return { x: rect.x + offsetX, y: rect.y + rect.height + offsetY }
    case 'bottom-right':
      return { x: rect.x + rect.width + offsetX, y: rect.y + rect.height + offsetY }
    case 'center':
    case 'auto':
    default:
      return { x: center.x + offsetX, y: center.y + offsetY }
  }
}

export function normalizeCanvasEdgeBindings(
  edge: CanvasEdge,
  options: {
    sourceNode?: CanvasNode | RectLike | null
    targetNode?: CanvasNode | RectLike | null
  } = {}
): CanvasEdge {
  const sourceId = getCanvasEdgeSourceObjectId(edge)
  const targetId = getCanvasEdgeTargetObjectId(edge)

  if (!sourceId || !targetId) {
    return edge
  }

  const sourceRect = options.sourceNode ? toRectLike(options.sourceNode) : null
  const targetRect = options.targetNode ? toRectLike(options.targetNode) : null
  const sourcePlacement =
    edge.source?.placement === 'auto' || edge.source?.placement === undefined
      ? sourceRect && targetRect
        ? resolveAutoCanvasAnchorPlacement(sourceRect, getRectCenter(targetRect))
        : (edge.source?.placement ?? edge.sourceAnchor ?? 'auto')
      : edge.source.placement
  const targetPlacement =
    edge.target?.placement === 'auto' || edge.target?.placement === undefined
      ? sourceRect && targetRect
        ? resolveAutoCanvasAnchorPlacement(targetRect, getRectCenter(sourceRect))
        : (edge.target?.placement ?? edge.targetAnchor ?? 'auto')
      : edge.target.placement

  const source = createCanvasEdgeEndpoint(sourceId, {
    ...edge.source,
    placement: sourcePlacement
  })
  const target = createCanvasEdgeEndpoint(targetId, {
    ...edge.target,
    placement: targetPlacement
  })

  return {
    ...edge,
    sourceId,
    targetId,
    sourceAnchor: toLegacyEdgeAnchor(source.placement, source.xRatio, source.yRatio),
    targetAnchor: toLegacyEdgeAnchor(target.placement, target.xRatio, target.yRatio),
    source,
    target
  }
}
