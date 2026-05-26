/**
 * Permissioned PDF text extraction helpers.
 */

export type CanvasPdfTextItem = {
  str: string
  dir?: string
  transform?: readonly number[]
  width?: number
  height?: number
  fontName?: string
  hasEOL?: boolean
}

export type CanvasPdfTextContent = {
  items: readonly CanvasPdfTextItem[]
}

export type CanvasPdfTextPage = {
  getTextContent?: () => Promise<CanvasPdfTextContent>
}

export type CanvasPdfTextDocument = {
  numPages: number
  getPage(pageNumber: number): Promise<CanvasPdfTextPage>
  destroy?(): Promise<void> | void
}

export type CanvasPdfTextLoadingTask = {
  promise: Promise<CanvasPdfTextDocument>
}

export type CanvasPdfTextAdapter = {
  getDocument(input: { data: Uint8Array }): CanvasPdfTextLoadingTask
}

export type CanvasPdfTextRun = {
  text: string
  x?: number
  y?: number
  width?: number
  height?: number
  dir?: string
  fontName?: string
  hasEOL?: boolean
}

export type CanvasPdfPageText = {
  pageNumber: number
  text: string
  runs: readonly CanvasPdfTextRun[]
}

export type CanvasPdfTextExtractionStatus =
  | 'extracted'
  | 'permission-denied'
  | 'unsupported'
  | 'empty'

export type CanvasPdfTextExtractionResult = {
  status: CanvasPdfTextExtractionStatus
  pages: readonly CanvasPdfPageText[]
  warnings: readonly string[]
}

export type ExtractCanvasPdfTextInput = {
  pdfjs: CanvasPdfTextAdapter
  data: ArrayBuffer | Uint8Array
  allowTextExtraction: boolean
  pageNumbers?: readonly number[]
  maxPages?: number
}

const DEFAULT_MAX_PAGES = 12

function normalizePdfBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

function sanitizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback
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

function getNumberAt(transform: readonly number[] | undefined, index: number): number | undefined {
  const value = transform?.[index]

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toTextRun(item: CanvasPdfTextItem): CanvasPdfTextRun | null {
  if (!item.str) {
    return null
  }

  return {
    text: item.str,
    x: getNumberAt(item.transform, 4),
    y: getNumberAt(item.transform, 5),
    width: item.width,
    height: item.height,
    dir: item.dir,
    fontName: item.fontName,
    hasEOL: item.hasEOL
  }
}

function composePageText(runs: readonly CanvasPdfTextRun[]): string {
  return runs
    .flatMap((run) => [run.text, run.hasEOL ? '\n' : ' '])
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getResultStatus(input: {
  pages: readonly CanvasPdfPageText[]
  warnings: readonly string[]
}): CanvasPdfTextExtractionStatus {
  if (input.pages.length === 0) {
    return input.warnings.length > 0 ? 'unsupported' : 'empty'
  }

  return input.pages.some((page) => page.text.length > 0) ? 'extracted' : 'empty'
}

async function extractPageText(
  document: CanvasPdfTextDocument,
  pageNumber: number
): Promise<{ page?: CanvasPdfPageText; warning?: string }> {
  const page = await document.getPage(pageNumber)

  if (typeof page.getTextContent !== 'function') {
    return { warning: `PDF page ${pageNumber} does not expose text content.` }
  }

  const content = await page.getTextContent()
  const runs = content.items.map(toTextRun).filter((run): run is CanvasPdfTextRun => run !== null)

  return {
    page: {
      pageNumber,
      runs,
      text: composePageText(runs)
    }
  }
}

export async function extractCanvasPdfText(
  input: ExtractCanvasPdfTextInput
): Promise<CanvasPdfTextExtractionResult> {
  if (!input.allowTextExtraction) {
    return {
      status: 'permission-denied',
      pages: [],
      warnings: ['PDF text extraction requires explicit permission.']
    }
  }

  const maxPages = sanitizePositiveInteger(input.maxPages, DEFAULT_MAX_PAGES)
  const loadingTask = input.pdfjs.getDocument({ data: normalizePdfBytes(input.data) })
  const pdf = await loadingTask.promise

  try {
    const pageNumbers = getRequestedPageNumbers({
      pageNumbers: input.pageNumbers,
      maxPages,
      pageCount: pdf.numPages
    })
    const rows = await Promise.all(
      pageNumbers.map((pageNumber) => extractPageText(pdf, pageNumber))
    )
    const pages = rows.flatMap((row) => (row.page ? [row.page] : []))
    const warnings = rows.flatMap((row) => (row.warning ? [row.warning] : []))

    return {
      status: getResultStatus({ pages, warnings }),
      pages,
      warnings
    }
  } finally {
    await pdf.destroy?.()
  }
}
