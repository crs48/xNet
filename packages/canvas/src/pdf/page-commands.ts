/**
 * PDF page workflow commands for canvas planning surfaces.
 */

import type { CanvasMediaNode, Rect } from '../types'
import type { CanvasPdfPageThumbnail } from './page-thumbnails'
import { createCanvasPdfPageAnchorId } from './page-anchors'

export type CanvasPdfExplodePageLayout = {
  startX?: number
  startY?: number
  columns?: number
  gap?: number
  pageWidth?: number
  pageHeight?: number
}

export type CreateCanvasPdfExplodePagesCommandInput = {
  sourceObjectId: string
  sourceNodeId?: string
  title?: string
  sourcePosition: Rect
  pages: readonly CanvasPdfPageThumbnail[]
  layout?: CanvasPdfExplodePageLayout
  idFactory?: (pageNumber: number) => string
}

export type CanvasPdfExplodePagesCommand = {
  kind: 'pdf-explode-pages'
  sourceObjectId: string
  nodes: readonly CanvasMediaNode[]
}

export type CanvasPdfSelectedPage = {
  objectId: string
  sourcePdfObjectId: string
  pageNumber: number
  title?: string
  text?: string
  thumbnailDataUrl?: string
}

export type CanvasPdfCollectedPageBlock = {
  kind: 'pdf-page-reference'
  sourcePdfObjectId: string
  pageObjectId: string
  pageNumber: number
  pageAnchorId: string
  title: string
  text?: string
  thumbnailDataUrl?: string
}

export type CanvasPdfCollectPagesCommand = {
  kind: 'pdf-collect-pages'
  title: string
  blocks: readonly CanvasPdfCollectedPageBlock[]
}

export type CreateCanvasPdfCollectPagesCommandInput = {
  title?: string
  pages: readonly CanvasPdfSelectedPage[]
}

const DEFAULT_GAP = 32
const DEFAULT_PAGE_WIDTH = 240
const DEFAULT_COLUMNS = 4

function getPositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function getPositiveInteger(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.floor(getPositiveNumber(value, fallback)))
}

function getPageHeight(input: {
  thumbnail: CanvasPdfPageThumbnail
  pageWidth: number
  fallbackHeight?: number
}): number {
  if (input.fallbackHeight) {
    return input.fallbackHeight
  }

  return input.thumbnail.width > 0
    ? input.pageWidth * (input.thumbnail.height / input.thumbnail.width)
    : input.pageWidth * 1.35
}

function createDefaultPageNodeId(sourceObjectId: string, pageNumber: number): string {
  return `${sourceObjectId}-page-${pageNumber}`
}

function createExplodedPageNode(input: {
  sourceObjectId: string
  sourceNodeId?: string
  title?: string
  page: CanvasPdfPageThumbnail
  position: Rect
  id: string
}): CanvasMediaNode {
  const pageTitle = `${input.title ?? 'PDF'} page ${input.page.pageNumber}`

  return {
    id: input.id,
    type: 'media',
    sourceNodeId: input.sourceNodeId,
    position: input.position,
    properties: {
      title: pageTitle,
      kind: 'pdf-page',
      mimeType: 'application/pdf',
      sourcePdfObjectId: input.sourceObjectId,
      pageNumber: input.page.pageNumber,
      pageAnchorId: createCanvasPdfPageAnchorId({
        objectId: input.sourceObjectId,
        pageNumber: input.page.pageNumber,
        placement: 'center'
      }),
      thumbnailDataUrl: input.page.dataUrl,
      thumbnailWidth: input.page.width,
      thumbnailHeight: input.page.height
    }
  }
}

export function createCanvasPdfExplodePagesCommand(
  input: CreateCanvasPdfExplodePagesCommandInput
): CanvasPdfExplodePagesCommand {
  const gap = getPositiveNumber(input.layout?.gap, DEFAULT_GAP)
  const pageWidth = getPositiveNumber(input.layout?.pageWidth, DEFAULT_PAGE_WIDTH)
  const columns = getPositiveInteger(input.layout?.columns, DEFAULT_COLUMNS)
  const startX = input.layout?.startX ?? input.sourcePosition.x + input.sourcePosition.width + gap
  const startY = input.layout?.startY ?? input.sourcePosition.y
  const fixedPageHeight = input.layout?.pageHeight
  const pageHeights = input.pages.map((page) =>
    getPageHeight({ thumbnail: page, pageWidth, fallbackHeight: fixedPageHeight })
  )
  const rowHeight = Math.max(...pageHeights, pageWidth * 1.35)
  const idFactory =
    input.idFactory ??
    ((pageNumber: number) => createDefaultPageNodeId(input.sourceObjectId, pageNumber))

  return {
    kind: 'pdf-explode-pages',
    sourceObjectId: input.sourceObjectId,
    nodes: input.pages.map((page, index) => {
      const column = index % columns
      const row = Math.floor(index / columns)

      return createExplodedPageNode({
        sourceObjectId: input.sourceObjectId,
        sourceNodeId: input.sourceNodeId,
        title: input.title,
        page,
        id: idFactory(page.pageNumber),
        position: {
          x: startX + column * (pageWidth + gap),
          y: startY + row * (rowHeight + gap),
          width: pageWidth,
          height: fixedPageHeight ?? pageHeights[index] ?? rowHeight
        }
      })
    })
  }
}

export function createCanvasPdfCollectPagesCommand(
  input: CreateCanvasPdfCollectPagesCommandInput
): CanvasPdfCollectPagesCommand {
  const title = input.title ?? 'Collected PDF pages'

  return {
    kind: 'pdf-collect-pages',
    title,
    blocks: input.pages.map((page) => ({
      kind: 'pdf-page-reference',
      sourcePdfObjectId: page.sourcePdfObjectId,
      pageObjectId: page.objectId,
      pageNumber: page.pageNumber,
      pageAnchorId: createCanvasPdfPageAnchorId({
        objectId: page.sourcePdfObjectId,
        pageNumber: page.pageNumber,
        placement: 'center'
      }),
      title: page.title ?? `Page ${page.pageNumber}`,
      text: page.text,
      thumbnailDataUrl: page.thumbnailDataUrl
    }))
  }
}
