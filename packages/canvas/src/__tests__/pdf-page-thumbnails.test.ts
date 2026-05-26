import type {
  CanvasPdfJsAdapter,
  CanvasPdfJsDocument,
  CanvasPdfJsPage,
  CanvasPdfThumbnailCanvas,
  CanvasPdfThumbnailCanvasFactory
} from '../pdf/page-thumbnails'
import { describe, expect, it } from 'vitest'
import { createCanvasPdfPageThumbnails } from '../pdf/page-thumbnails'

type FakePdfOptions = {
  pageCount: number
  pageWidth?: number
  pageHeight?: number
}

function createFakeCanvasFactory(): {
  canvases: CanvasPdfThumbnailCanvas[]
  factory: CanvasPdfThumbnailCanvasFactory
} {
  const canvases: CanvasPdfThumbnailCanvas[] = []
  const factory: CanvasPdfThumbnailCanvasFactory = (width, height) => {
    const canvas: CanvasPdfThumbnailCanvas = {
      width,
      height,
      getContext: () => ({}) as CanvasRenderingContext2D,
      toDataURL: (type = 'image/png') => `data:${type};base64,${width}x${height}`
    }

    canvases.push(canvas)
    return canvas
  }

  return { canvases, factory }
}

function createFakePdfJsAdapter(options: FakePdfOptions): {
  adapter: CanvasPdfJsAdapter
  renderedPages: number[]
  destroyed: () => boolean
} {
  const renderedPages: number[] = []
  let destroyed = false

  const createPage = (pageNumber: number): CanvasPdfJsPage => ({
    getViewport: ({ scale }) => ({
      width: (options.pageWidth ?? 600) * scale,
      height: (options.pageHeight ?? 800) * scale
    }),
    render: () => {
      renderedPages.push(pageNumber)
      return { promise: Promise.resolve() }
    }
  })
  const document: CanvasPdfJsDocument = {
    numPages: options.pageCount,
    getPage: (pageNumber) => Promise.resolve(createPage(pageNumber)),
    destroy: () => {
      destroyed = true
    }
  }

  return {
    adapter: {
      getDocument: () => ({ promise: Promise.resolve(document) })
    },
    renderedPages,
    destroyed: () => destroyed
  }
}

describe('canvas PDF page thumbnails', () => {
  it('renders default first-page thumbnails through a PDF.js-compatible adapter', async () => {
    const pdf = createFakePdfJsAdapter({ pageCount: 4, pageWidth: 600, pageHeight: 800 })
    const canvas = createFakeCanvasFactory()
    const thumbnails = await createCanvasPdfPageThumbnails({
      pdfjs: pdf.adapter,
      data: new Uint8Array([1, 2, 3]),
      maxWidth: 150,
      maxHeight: 150,
      canvasFactory: canvas.factory
    })

    expect(thumbnails.map((thumbnail) => thumbnail.pageNumber)).toEqual([1, 2, 3, 4])
    expect(thumbnails[0]).toMatchObject({
      width: 113,
      height: 150,
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,113x150'
    })
    expect(pdf.renderedPages).toEqual([1, 2, 3, 4])
    expect(pdf.destroyed()).toBe(true)
  })

  it('deduplicates requested pages and ignores out-of-range pages', async () => {
    const pdf = createFakePdfJsAdapter({ pageCount: 5, pageWidth: 400, pageHeight: 200 })
    const canvas = createFakeCanvasFactory()
    const thumbnails = await createCanvasPdfPageThumbnails({
      pdfjs: pdf.adapter,
      data: new ArrayBuffer(8),
      pageNumbers: [3, 1, 3, 99, 0],
      maxWidth: 200,
      maxHeight: 200,
      mimeType: 'image/jpeg',
      quality: 0.8,
      canvasFactory: canvas.factory
    })

    expect(thumbnails.map((thumbnail) => thumbnail.pageNumber)).toEqual([3, 1])
    expect(thumbnails.map((thumbnail) => thumbnail.dataUrl)).toEqual([
      'data:image/jpeg;base64,200x100',
      'data:image/jpeg;base64,200x100'
    ])
    expect(pdf.renderedPages).toEqual([3, 1])
    expect(canvas.canvases).toHaveLength(2)
  })
})
