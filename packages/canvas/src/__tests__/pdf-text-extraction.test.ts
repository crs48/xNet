import { describe, expect, it, vi } from 'vitest'
import {
  extractCanvasPdfText,
  type CanvasPdfTextAdapter,
  type CanvasPdfTextDocument
} from '../pdf/text-extraction'

function createPdfTextAdapter(document: CanvasPdfTextDocument): CanvasPdfTextAdapter {
  return {
    getDocument: () => ({
      promise: Promise.resolve(document)
    })
  }
}

describe('PDF text extraction', () => {
  it('does not open PDF bytes without explicit permission', async () => {
    const pdfjs: CanvasPdfTextAdapter = {
      getDocument: vi.fn(() => {
        throw new Error('should not read PDF data')
      })
    }

    await expect(
      extractCanvasPdfText({
        pdfjs,
        data: new Uint8Array([1, 2, 3]),
        allowTextExtraction: false
      })
    ).resolves.toEqual({
      status: 'permission-denied',
      pages: [],
      warnings: ['PDF text extraction requires explicit permission.']
    })
    expect(pdfjs.getDocument).not.toHaveBeenCalled()
  })

  it('extracts selected pages and normalized text runs', async () => {
    const destroy = vi.fn()
    const pdfjs = createPdfTextAdapter({
      numPages: 3,
      destroy,
      getPage: async (pageNumber) => ({
        getTextContent: async () => ({
          items:
            pageNumber === 2
              ? [
                  {
                    str: 'Hello',
                    transform: [1, 0, 0, 1, 10, 20],
                    width: 24,
                    height: 12
                  },
                  { str: 'world', transform: [1, 0, 0, 1, 36, 20], hasEOL: true },
                  { str: 'Next line', transform: [1, 0, 0, 1, 10, 8] }
                ]
              : [{ str: `Page ${pageNumber}`, transform: [1, 0, 0, 1, 0, 0] }]
        })
      })
    })

    const result = await extractCanvasPdfText({
      pdfjs,
      data: new ArrayBuffer(4),
      allowTextExtraction: true,
      pageNumbers: [2, 2, 4, 1]
    })

    expect(result.status).toBe('extracted')
    expect(result.pages.map((page) => page.pageNumber)).toEqual([2, 1])
    expect(result.pages[0]?.text).toBe('Hello world\nNext line')
    expect(result.pages[0]?.runs[0]).toEqual({
      text: 'Hello',
      x: 10,
      y: 20,
      width: 24,
      height: 12,
      dir: undefined,
      fontName: undefined,
      hasEOL: undefined
    })
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('reports unsupported pages when PDF.js text content is unavailable', async () => {
    const pdfjs = createPdfTextAdapter({
      numPages: 1,
      getPage: async () => ({})
    })

    await expect(
      extractCanvasPdfText({
        pdfjs,
        data: new Uint8Array([1]),
        allowTextExtraction: true
      })
    ).resolves.toEqual({
      status: 'unsupported',
      pages: [],
      warnings: ['PDF page 1 does not expose text content.']
    })
  })
})
