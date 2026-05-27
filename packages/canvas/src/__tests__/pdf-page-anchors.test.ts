import { describe, expect, it } from 'vitest'
import {
  createCanvasPdfPageAnchorId,
  createCanvasPdfPageCommentAnchor,
  createCanvasPdfPageEdgeEndpoint,
  getCanvasPdfPageAnchorRect,
  resolveCanvasPdfPageAnchorPoint
} from '../pdf/page-anchors'

describe('PDF page anchors', () => {
  it('creates deterministic page anchor ids for edge endpoints', () => {
    const endpoint = createCanvasPdfPageEdgeEndpoint({
      objectId: 'pdf-1',
      pageNumber: 3,
      xRatio: 0.25,
      yRatio: 0.75
    })

    expect(endpoint.objectId).toBe('pdf-1')
    expect(endpoint.pageNumber).toBe(3)
    expect(endpoint.anchorId).toBe('pdf-1#page:3#ratio:0.25,0.75')
  })

  it('keeps page metadata on comment anchors', () => {
    const anchor = createCanvasPdfPageCommentAnchor({
      objectId: 'pdf-1',
      pageNumber: 8,
      pageId: 'source-page-8',
      placement: 'bottom',
      blockAnchorId: 'highlight-4'
    })

    expect(anchor).toEqual({
      objectId: 'pdf-1',
      anchorId: 'pdf-1#page:8#placement:bottom#block:highlight-4',
      pageNumber: 8,
      pageId: 'source-page-8',
      placement: 'bottom',
      xRatio: undefined,
      yRatio: undefined,
      offsetX: undefined,
      offsetY: undefined,
      blockAnchorId: 'highlight-4'
    })
  })

  it('falls back to source page ids when page numbers are unavailable', () => {
    expect(
      createCanvasPdfPageAnchorId({
        objectId: 'pdf-1',
        pageNumber: 0,
        pageId: 'annex/a',
        placement: 'right'
      })
    ).toBe('pdf-1#page:annex%2Fa#placement:right')
  })

  it('resolves page points inside the visible fitted page rect', () => {
    const container = { x: 0, y: 0, width: 400, height: 500 }
    const layout = {
      padding: 20,
      headerHeight: 40,
      stripHeight: 60,
      pageAspectRatio: 0.5
    }

    expect(getCanvasPdfPageAnchorRect(container, layout)).toEqual({
      x: 110,
      y: 60,
      width: 180,
      height: 360
    })

    expect(
      resolveCanvasPdfPageAnchorPoint(
        container,
        {
          pageNumber: 3,
          xRatio: 0.5,
          yRatio: 0.5
        },
        layout
      )
    ).toEqual({ x: 200, y: 240 })
  })
})
