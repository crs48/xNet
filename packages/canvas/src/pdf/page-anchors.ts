/**
 * PDF page anchors for comments and connector endpoints.
 */

import type { CanvasEdgeEndpoint, CanvasObjectAnchorPlacement, Point, Rect } from '../types'
import type { CanvasObjectAnchor } from '@xnetjs/data'
import {
  createCanvasEdgeEndpoint,
  createCanvasObjectAnchorId,
  resolveCanvasAnchorPoint
} from '../edges/bindings'

export type CanvasPdfPageAnchorLayout = {
  padding?: number
  headerHeight?: number
  stripHeight?: number
  pageAspectRatio?: number
}

export type CreateCanvasPdfPageAnchorInput = {
  objectId: string
  pageNumber: number
  pageId?: string
  anchorId?: string
  placement?: CanvasObjectAnchorPlacement
  xRatio?: number
  yRatio?: number
  offsetX?: number
  offsetY?: number
  blockAnchorId?: string
}

export type CanvasPdfPageCommentAnchor = CanvasObjectAnchor & {
  pageNumber: number
  pageId?: string
}

function getNonNegativeNumber(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function getPositiveAspectRatio(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function getCanvasPdfAvailablePageRect(rect: Rect, layout: CanvasPdfPageAnchorLayout): Rect {
  const padding = getNonNegativeNumber(layout.padding)
  const headerHeight = getNonNegativeNumber(layout.headerHeight)
  const stripHeight = getNonNegativeNumber(layout.stripHeight)

  return {
    x: rect.x + padding,
    y: rect.y + padding + headerHeight,
    width: Math.max(0, rect.width - padding * 2),
    height: Math.max(0, rect.height - padding * 2 - headerHeight - stripHeight)
  }
}

function fitRectToAspectRatio(rect: Rect, aspectRatio: number | null): Rect {
  if (!aspectRatio || rect.width === 0 || rect.height === 0) {
    return rect
  }

  const availableAspectRatio = rect.width / rect.height

  if (availableAspectRatio > aspectRatio) {
    const width = rect.height * aspectRatio

    return {
      x: rect.x + (rect.width - width) / 2,
      y: rect.y,
      width,
      height: rect.height
    }
  }

  const height = rect.width / aspectRatio

  return {
    x: rect.x,
    y: rect.y + (rect.height - height) / 2,
    width: rect.width,
    height
  }
}

export function createCanvasPdfPageAnchorId(input: CreateCanvasPdfPageAnchorInput): string {
  return createCanvasObjectAnchorId(input)
}

export function createCanvasPdfPageEdgeEndpoint(
  input: CreateCanvasPdfPageAnchorInput
): CanvasEdgeEndpoint {
  return createCanvasEdgeEndpoint(input.objectId, {
    anchorId: input.anchorId ?? createCanvasPdfPageAnchorId(input),
    pageNumber: input.pageNumber,
    pageId: input.pageId,
    placement: input.placement,
    xRatio: input.xRatio,
    yRatio: input.yRatio,
    offsetX: input.offsetX,
    offsetY: input.offsetY,
    blockAnchorId: input.blockAnchorId
  })
}

export function createCanvasPdfPageCommentAnchor(
  input: CreateCanvasPdfPageAnchorInput
): CanvasPdfPageCommentAnchor {
  return {
    objectId: input.objectId,
    anchorId: input.anchorId ?? createCanvasPdfPageAnchorId(input),
    pageNumber: input.pageNumber,
    pageId: input.pageId,
    placement: input.placement,
    xRatio: input.xRatio,
    yRatio: input.yRatio,
    offsetX: input.offsetX,
    offsetY: input.offsetY,
    blockAnchorId: input.blockAnchorId
  }
}

export function getCanvasPdfPageAnchorRect(
  rect: Rect,
  layout: CanvasPdfPageAnchorLayout = {}
): Rect {
  const availableRect = getCanvasPdfAvailablePageRect(rect, layout)

  return fitRectToAspectRatio(availableRect, getPositiveAspectRatio(layout.pageAspectRatio))
}

export function resolveCanvasPdfPageAnchorPoint(
  rect: Rect,
  endpoint: Partial<CanvasEdgeEndpoint>,
  layout: CanvasPdfPageAnchorLayout = {}
): Point {
  return resolveCanvasAnchorPoint(getCanvasPdfPageAnchorRect(rect, layout), endpoint)
}
