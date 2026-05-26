import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CanvasPdfPageViewer } from '../pdf/PdfPageViewer'

const THUMBNAILS = [
  {
    pageNumber: 1,
    width: 120,
    height: 160,
    dataUrl: 'data:image/png;base64,page-1',
    mimeType: 'image/png' as const
  },
  {
    pageNumber: 2,
    width: 120,
    height: 160,
    dataUrl: 'data:image/png;base64,page-2',
    mimeType: 'image/png' as const
  },
  {
    pageNumber: 3,
    width: 120,
    height: 160,
    dataUrl: 'data:image/png;base64,page-3',
    mimeType: 'image/png' as const
  }
]

describe('CanvasPdfPageViewer', () => {
  it('renders the selected PDF page and page strip', () => {
    const onSelectPage = vi.fn()

    render(
      <CanvasPdfPageViewer
        title="Roadmap PDF"
        thumbnails={THUMBNAILS}
        selectedPageNumber={2}
        onSelectPage={onSelectPage}
      />
    )

    expect(screen.getByRole('img', { name: 'Roadmap PDF page 2' }).getAttribute('src')).toBe(
      'data:image/png;base64,page-2'
    )
    expect(screen.getByText('Page 2 of 3')).toBeTruthy()

    fireEvent.click(screen.getByRole('option', { name: 'Page 3' }))

    expect(onSelectPage).toHaveBeenCalledWith(3)
  })

  it('supports keyboard page strip navigation', () => {
    const onSelectPage = vi.fn()

    render(
      <CanvasPdfPageViewer
        title="Research PDF"
        thumbnails={THUMBNAILS}
        selectedPageNumber={2}
        onSelectPage={onSelectPage}
      />
    )

    fireEvent.keyDown(screen.getByRole('option', { name: 'Page 2' }), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('option', { name: 'Page 2' }), { key: 'ArrowLeft' })

    expect(onSelectPage).toHaveBeenNthCalledWith(1, 3)
    expect(onSelectPage).toHaveBeenNthCalledWith(2, 1)
  })

  it('renders an empty state when no page thumbnails are available', () => {
    render(<CanvasPdfPageViewer title="Empty PDF" thumbnails={[]} />)

    expect(screen.getByRole('status', { name: 'PDF preview unavailable' }).textContent).toBe(
      'PDF preview unavailable'
    )
  })
})
