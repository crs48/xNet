import type { CanvasPdfPageThumbnail } from '../pdf/page-thumbnails'
import { describe, expect, it } from 'vitest'
import {
  createCanvasPdfCollectPagesCommand,
  createCanvasPdfExplodePagesCommand
} from '../pdf/page-commands'

const pages: CanvasPdfPageThumbnail[] = [
  {
    pageNumber: 1,
    width: 100,
    height: 140,
    dataUrl: 'data:image/png;base64,page-1',
    mimeType: 'image/png'
  },
  {
    pageNumber: 2,
    width: 100,
    height: 200,
    dataUrl: 'data:image/png;base64,page-2',
    mimeType: 'image/png'
  },
  {
    pageNumber: 3,
    width: 100,
    height: 120,
    dataUrl: 'data:image/png;base64,page-3',
    mimeType: 'image/png'
  }
]

describe('PDF page workflow commands', () => {
  it('explodes PDF pages into positioned media nodes', () => {
    const command = createCanvasPdfExplodePagesCommand({
      sourceObjectId: 'pdf-1',
      sourceNodeId: 'source-node-1',
      title: 'Planning PDF',
      sourcePosition: { x: 10, y: 20, width: 300, height: 400 },
      pages,
      layout: { columns: 2, gap: 10, pageWidth: 50 }
    })

    expect(command.kind).toBe('pdf-explode-pages')
    expect(command.nodes.map((node) => node.id)).toEqual([
      'pdf-1-page-1',
      'pdf-1-page-2',
      'pdf-1-page-3'
    ])
    expect(command.nodes.map((node) => node.position)).toEqual([
      { x: 320, y: 20, width: 50, height: 70 },
      { x: 380, y: 20, width: 50, height: 100 },
      { x: 320, y: 130, width: 50, height: 60 }
    ])
    expect(command.nodes[0]?.properties).toMatchObject({
      title: 'Planning PDF page 1',
      kind: 'pdf-page',
      mimeType: 'application/pdf',
      sourcePdfObjectId: 'pdf-1',
      pageNumber: 1,
      pageAnchorId: 'pdf-1#page:1#placement:center',
      thumbnailDataUrl: 'data:image/png;base64,page-1'
    })
  })

  it('supports custom page IDs when exploding pages', () => {
    const command = createCanvasPdfExplodePagesCommand({
      sourceObjectId: 'pdf-1',
      sourcePosition: { x: 0, y: 0, width: 100, height: 100 },
      pages: [pages[0]],
      idFactory: (pageNumber) => `custom-page-${pageNumber}`
    })

    expect(command.nodes[0]?.id).toBe('custom-page-1')
  })

  it('collects selected page cards into document page-reference blocks', () => {
    const command = createCanvasPdfCollectPagesCommand({
      title: 'Launch excerpts',
      pages: [
        {
          objectId: 'pdf-1-page-2',
          sourcePdfObjectId: 'pdf-1',
          pageNumber: 2,
          title: 'Risks',
          text: 'Risk matrix',
          thumbnailDataUrl: 'data:image/png;base64,page-2'
        },
        {
          objectId: 'pdf-1-page-1',
          sourcePdfObjectId: 'pdf-1',
          pageNumber: 1
        }
      ]
    })

    expect(command).toEqual({
      kind: 'pdf-collect-pages',
      title: 'Launch excerpts',
      blocks: [
        {
          kind: 'pdf-page-reference',
          sourcePdfObjectId: 'pdf-1',
          pageObjectId: 'pdf-1-page-2',
          pageNumber: 2,
          pageAnchorId: 'pdf-1#page:2#placement:center',
          title: 'Risks',
          text: 'Risk matrix',
          thumbnailDataUrl: 'data:image/png;base64,page-2'
        },
        {
          kind: 'pdf-page-reference',
          sourcePdfObjectId: 'pdf-1',
          pageObjectId: 'pdf-1-page-1',
          pageNumber: 1,
          pageAnchorId: 'pdf-1#page:1#placement:center',
          title: 'Page 1',
          text: undefined,
          thumbnailDataUrl: undefined
        }
      ]
    })
  })
})
