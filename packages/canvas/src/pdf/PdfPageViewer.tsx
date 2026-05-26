/**
 * Focused PDF page viewer with a thumbnail strip.
 */

import type { CanvasPdfPageThumbnail } from './page-thumbnails'
import type { KeyboardEvent } from 'react'
import { memo, useMemo } from 'react'

export type CanvasPdfPageViewerThemeMode = 'light' | 'dark'

export type CanvasPdfPageViewerProps = {
  title?: string
  thumbnails: readonly CanvasPdfPageThumbnail[]
  selectedPageNumber?: number
  onSelectPage?: (pageNumber: number) => void
  themeMode?: CanvasPdfPageViewerThemeMode
}

type ViewerColors = {
  background: string
  border: string
  text: string
  mutedText: string
  previewBackground: string
  stripBackground: string
  selectedBorder: string
  buttonBorder: string
}

const VIEWER_COLORS: Record<CanvasPdfPageViewerThemeMode, ViewerColors> = {
  light: {
    background: '#ffffff',
    border: 'rgba(148, 163, 184, 0.42)',
    text: '#0f172a',
    mutedText: '#64748b',
    previewBackground: '#f8fafc',
    stripBackground: '#f1f5f9',
    selectedBorder: '#2563eb',
    buttonBorder: 'rgba(148, 163, 184, 0.48)'
  },
  dark: {
    background: '#0f172a',
    border: 'rgba(148, 163, 184, 0.28)',
    text: '#f8fafc',
    mutedText: '#94a3b8',
    previewBackground: '#020617',
    stripBackground: '#111827',
    selectedBorder: '#60a5fa',
    buttonBorder: 'rgba(148, 163, 184, 0.32)'
  }
}

function getSelectedThumbnail(
  thumbnails: readonly CanvasPdfPageThumbnail[],
  selectedPageNumber: number | undefined
): CanvasPdfPageThumbnail | null {
  return (
    thumbnails.find((thumbnail) => thumbnail.pageNumber === selectedPageNumber) ??
    thumbnails[0] ??
    null
  )
}

function getPageImageAlt(title: string, pageNumber: number): string {
  return `${title} page ${pageNumber}`
}

export const CanvasPdfPageViewer = memo(function CanvasPdfPageViewer({
  title = 'PDF',
  thumbnails,
  selectedPageNumber,
  onSelectPage,
  themeMode = 'light'
}: CanvasPdfPageViewerProps) {
  const selectedThumbnail = getSelectedThumbnail(thumbnails, selectedPageNumber)
  const selectedIndex = selectedThumbnail
    ? thumbnails.findIndex((thumbnail) => thumbnail.pageNumber === selectedThumbnail.pageNumber)
    : -1
  const colors = VIEWER_COLORS[themeMode]
  const pageLabel = selectedThumbnail
    ? `Page ${selectedThumbnail.pageNumber} of ${thumbnails.length}`
    : 'No pages'
  const orderedPageNumbers = useMemo(
    () => thumbnails.map((thumbnail) => thumbnail.pageNumber),
    [thumbnails]
  )

  function handlePageKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    thumbnail: CanvasPdfPageThumbnail
  ): void {
    const currentIndex = orderedPageNumbers.indexOf(thumbnail.pageNumber)
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0

    if (direction === 0 || currentIndex < 0) {
      return
    }

    const nextPageNumber = orderedPageNumbers[currentIndex + direction]

    if (nextPageNumber === undefined) {
      return
    }

    event.preventDefault()
    onSelectPage?.(nextPageNumber)
  }

  if (!selectedThumbnail) {
    return (
      <div
        aria-label="PDF preview unavailable"
        data-canvas-interactive="true"
        data-canvas-pdf-page-viewer="empty"
        role="status"
        style={{
          alignItems: 'center',
          background: colors.background,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          boxSizing: 'border-box',
          color: colors.mutedText,
          display: 'flex',
          fontSize: 13,
          height: '100%',
          justifyContent: 'center',
          minHeight: 160,
          padding: 16,
          width: '100%'
        }}
      >
        PDF preview unavailable
      </div>
    )
  }

  return (
    <section
      aria-label={`${title} PDF viewer`}
      data-canvas-interactive="true"
      data-canvas-pdf-page-viewer="true"
      style={{
        background: colors.background,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        boxSizing: 'border-box',
        color: colors.text,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        height: '100%',
        minHeight: 220,
        minWidth: 0,
        overflow: 'hidden',
        padding: 10,
        width: '100%'
      }}
    >
      <header
        style={{
          alignItems: 'center',
          display: 'flex',
          gap: 8,
          justifyContent: 'space-between',
          minWidth: 0
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 650,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {title}
        </div>
        <div
          aria-live="polite"
          style={{
            color: colors.mutedText,
            flexShrink: 0,
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {pageLabel}
        </div>
      </header>

      <div
        style={{
          alignItems: 'center',
          background: colors.previewBackground,
          borderRadius: 6,
          display: 'flex',
          flex: '1 1 auto',
          justifyContent: 'center',
          minHeight: 0,
          overflow: 'hidden',
          padding: 8
        }}
      >
        <img
          alt={getPageImageAlt(title, selectedThumbnail.pageNumber)}
          src={selectedThumbnail.dataUrl}
          style={{
            borderRadius: 4,
            boxShadow:
              themeMode === 'dark'
                ? '0 12px 30px rgba(0, 0, 0, 0.38)'
                : '0 12px 30px rgba(15, 23, 42, 0.16)',
            display: 'block',
            maxHeight: '100%',
            maxWidth: '100%',
            objectFit: 'contain'
          }}
        />
      </div>

      <div
        aria-label="PDF page strip"
        role="listbox"
        style={{
          alignItems: 'center',
          background: colors.stripBackground,
          borderRadius: 6,
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          padding: 8
        }}
      >
        {thumbnails.map((thumbnail, index) => {
          const selected = index === selectedIndex

          return (
            <button
              aria-label={`Page ${thumbnail.pageNumber}`}
              aria-selected={selected}
              key={thumbnail.pageNumber}
              onClick={() => onSelectPage?.(thumbnail.pageNumber)}
              onKeyDown={(event) => handlePageKeyDown(event, thumbnail)}
              role="option"
              style={{
                alignItems: 'center',
                background: colors.background,
                border: `2px solid ${selected ? colors.selectedBorder : colors.buttonBorder}`,
                borderRadius: 6,
                color: colors.text,
                cursor: 'pointer',
                display: 'flex',
                flex: '0 0 52px',
                flexDirection: 'column',
                gap: 4,
                height: 72,
                justifyContent: 'center',
                padding: 4
              }}
              type="button"
            >
              <img
                alt=""
                src={thumbnail.dataUrl}
                style={{
                  borderRadius: 3,
                  display: 'block',
                  height: 46,
                  maxWidth: 40,
                  objectFit: 'contain'
                }}
              />
              <span style={{ color: colors.mutedText, fontSize: 10, lineHeight: 1 }}>
                {thumbnail.pageNumber}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
})
