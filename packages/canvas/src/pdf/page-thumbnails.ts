/**
 * PDF.js-compatible page thumbnail generation for canvas previews.
 */

export type CanvasPdfThumbnailMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export type CanvasPdfViewport = {
  width: number
  height: number
}

export type CanvasPdfRenderTask = {
  promise: Promise<unknown>
}

export type CanvasPdfJsPage = {
  getViewport(input: { scale: number }): CanvasPdfViewport
  render(input: {
    canvasContext: CanvasRenderingContext2D
    viewport: CanvasPdfViewport
    background?: string
  }): CanvasPdfRenderTask
}

export type CanvasPdfJsDocument = {
  numPages: number
  getPage(pageNumber: number): Promise<CanvasPdfJsPage>
  destroy?(): Promise<void> | void
}

export type CanvasPdfJsLoadingTask = {
  promise: Promise<CanvasPdfJsDocument>
}

export type CanvasPdfJsAdapter = {
  getDocument(input: { data: Uint8Array }): CanvasPdfJsLoadingTask
}

export type CanvasPdfThumbnailCanvas = {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
  toDataURL(type?: CanvasPdfThumbnailMimeType, quality?: number): string
}

export type CanvasPdfThumbnailCanvasFactory = (
  width: number,
  height: number
) => CanvasPdfThumbnailCanvas

export type CreateCanvasPdfPageThumbnailsInput = {
  pdfjs: CanvasPdfJsAdapter
  data: ArrayBuffer | Uint8Array
  pageNumbers?: readonly number[]
  maxPages?: number
  scale?: number
  maxWidth?: number
  maxHeight?: number
  background?: string
  mimeType?: CanvasPdfThumbnailMimeType
  quality?: number
  canvasFactory?: CanvasPdfThumbnailCanvasFactory
}

export type CanvasPdfPageThumbnail = {
  pageNumber: number
  width: number
  height: number
  dataUrl: string
  mimeType: CanvasPdfThumbnailMimeType
}

const DEFAULT_MAX_PAGES = 6
const DEFAULT_SCALE = 1
const DEFAULT_MAX_WIDTH = 320
const DEFAULT_MAX_HEIGHT = 420
const DEFAULT_MIME_TYPE: CanvasPdfThumbnailMimeType = 'image/png'

function normalizePdfBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

function sanitizePositiveNumber(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function getRequestedPageNumbers(input: {
  pageNumbers?: readonly number[]
  maxPages: number
  pageCount: number
}): number[] {
  const requested =
    input.pageNumbers && input.pageNumbers.length > 0
      ? input.pageNumbers
      : Array.from({ length: Math.min(input.maxPages, input.pageCount) }, (_, index) => index + 1)
  const seen = new Set<number>()

  return requested.reduce<number[]>((pages, pageNumber) => {
    const normalized = Math.floor(pageNumber)
    const valid = normalized >= 1 && normalized <= input.pageCount && !seen.has(normalized)

    if (valid) {
      seen.add(normalized)
      pages.push(normalized)
    }

    return pages
  }, [])
}

function createDefaultCanvas(width: number, height: number): CanvasPdfThumbnailCanvas {
  if (typeof document === 'undefined') {
    throw new Error('PDF thumbnail generation requires a canvasFactory outside the browser.')
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  return canvas
}

function getCanvasFactory(
  canvasFactory: CanvasPdfThumbnailCanvasFactory | undefined
): CanvasPdfThumbnailCanvasFactory {
  return canvasFactory ?? createDefaultCanvas
}

function getConstrainedScale(input: {
  viewport: CanvasPdfViewport
  scale: number
  maxWidth: number
  maxHeight: number
}): number {
  const widthScale = input.maxWidth / input.viewport.width
  const heightScale = input.maxHeight / input.viewport.height
  const fitScale = Math.min(widthScale, heightScale, 1)

  return input.scale * fitScale
}

async function createCanvasPdfPageThumbnail(input: {
  document: CanvasPdfJsDocument
  pageNumber: number
  scale: number
  maxWidth: number
  maxHeight: number
  background?: string
  mimeType: CanvasPdfThumbnailMimeType
  quality?: number
  canvasFactory: CanvasPdfThumbnailCanvasFactory
}): Promise<CanvasPdfPageThumbnail> {
  const page = await input.document.getPage(input.pageNumber)
  const baseViewport = page.getViewport({ scale: input.scale })
  const constrainedScale = getConstrainedScale({
    viewport: baseViewport,
    scale: input.scale,
    maxWidth: input.maxWidth,
    maxHeight: input.maxHeight
  })
  const viewport = page.getViewport({ scale: constrainedScale })
  const canvas = input.canvasFactory(
    Math.max(1, Math.round(viewport.width)),
    Math.max(1, Math.round(viewport.height))
  )
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error(`Could not create 2D canvas context for PDF page ${input.pageNumber}.`)
  }

  await page.render({
    canvasContext: context,
    viewport,
    background: input.background
  }).promise

  return {
    pageNumber: input.pageNumber,
    width: canvas.width,
    height: canvas.height,
    mimeType: input.mimeType,
    dataUrl: canvas.toDataURL(input.mimeType, input.quality)
  }
}

export async function createCanvasPdfPageThumbnails(
  input: CreateCanvasPdfPageThumbnailsInput
): Promise<readonly CanvasPdfPageThumbnail[]> {
  const maxPages = Math.max(
    1,
    Math.floor(sanitizePositiveNumber(input.maxPages, DEFAULT_MAX_PAGES))
  )
  const scale = sanitizePositiveNumber(input.scale, DEFAULT_SCALE)
  const maxWidth = sanitizePositiveNumber(input.maxWidth, DEFAULT_MAX_WIDTH)
  const maxHeight = sanitizePositiveNumber(input.maxHeight, DEFAULT_MAX_HEIGHT)
  const mimeType = input.mimeType ?? DEFAULT_MIME_TYPE
  const loadingTask = input.pdfjs.getDocument({ data: normalizePdfBytes(input.data) })
  const pdf = await loadingTask.promise

  try {
    const pageNumbers = getRequestedPageNumbers({
      pageNumbers: input.pageNumbers,
      maxPages,
      pageCount: pdf.numPages
    })
    const canvasFactory = getCanvasFactory(input.canvasFactory)

    return Promise.all(
      pageNumbers.map((pageNumber) =>
        createCanvasPdfPageThumbnail({
          document: pdf,
          pageNumber,
          scale,
          maxWidth,
          maxHeight,
          background: input.background,
          mimeType,
          quality: input.quality,
          canvasFactory
        })
      )
    )
  } finally {
    await pdf.destroy?.()
  }
}
