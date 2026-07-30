/**
 * AttachmentLightbox — full-screen viewer for file cell attachments.
 *
 * Generalised from the image-only overlay that used to live inside GridPeek
 * (exploration 0385 W1). Opens from any file chip — grid cell, peek panel,
 * gallery card — and pages through every attachment in that cell.
 *
 * Slide kinds are chosen from the ref's MIME type: images render inline,
 * video/audio get native controls, and anything else falls back to a file
 * card with a download action. Nothing here decodes file contents itself —
 * the surface resolves a CID to a URL through `onResolveFileUrl`.
 */

import type { FileRef } from '@xnetjs/data'
import { ChevronLeft, ChevronRight, Download, FileText, X } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatFileSize, isImageRef, useFileUrl } from '../properties/file.js'

/** What the lightbox was asked to show: a cell's refs plus the clicked one. */
export interface AttachmentLightboxRequest {
  refs: FileRef[]
  initialIndex?: number
}

export interface AttachmentLightboxProps extends AttachmentLightboxRequest {
  /** Carries `onResolveFileUrl`, same shape the property handlers receive. */
  config?: Record<string, unknown>
  onClose: () => void
}

/**
 * Note on documents: we deliberately do NOT frame the blob URL of an upload.
 * A blob: iframe inherits this origin, and an attachment named `.pdf` can
 * contain anything — framing it would turn any upload into stored XSS. The
 * app CSP blocks `frame-src blob:` for exactly that reason, so documents get
 * the download card instead. `<img>`/`<video>`/`<audio>` are safe because
 * they decode as media rather than executing as a document.
 */
function slideKind(ref: FileRef): 'image' | 'video' | 'audio' | 'file' {
  if (isImageRef(ref)) return 'image'
  if (ref.mimeType?.startsWith('video/')) return 'video'
  if (ref.mimeType?.startsWith('audio/')) return 'audio'
  return 'file'
}

/** One attachment, rendered by kind. */
function Slide({
  fileRef,
  config
}: {
  fileRef: FileRef
  config?: Record<string, unknown>
}): React.JSX.Element {
  const url = useFileUrl(fileRef, config)
  const kind = slideKind(fileRef)

  if (!url) {
    return (
      <div data-testid="lightbox-loading" className="text-sm text-white/70">
        Loading “{fileRef.name}”…
      </div>
    )
  }

  if (kind === 'image') {
    return (
      <img
        src={url}
        alt={fileRef.name}
        data-testid="lightbox-image"
        className="max-h-[90vh] max-w-[90vw] object-contain"
      />
    )
  }

  if (kind === 'video') {
    return (
      // User-supplied upload: no caption track exists to attach.
      <video
        src={url}
        controls
        autoPlay
        data-testid="lightbox-video"
        className="max-h-[90vh] max-w-[90vw]"
      />
    )
  }

  if (kind === 'audio') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white/10 p-6">
        <span className="text-sm text-white">{fileRef.name}</span>
        {/* User-supplied upload: no caption track exists to attach. */}
        <audio src={url} controls autoPlay data-testid="lightbox-audio" />
      </div>
    )
  }

  return (
    <div
      data-testid="lightbox-file-card"
      className="flex flex-col items-center gap-3 rounded-lg bg-white/10 px-8 py-10 text-center"
    >
      <FileText className="h-12 w-12 text-white/70" />
      <div className="max-w-xs truncate text-sm text-white">{fileRef.name}</div>
      <div className="text-xs text-white/60">{formatFileSize(fileRef.size)}</div>
      <a
        href={url}
        download={fileRef.name}
        className="mt-1 inline-flex items-center gap-1.5 rounded bg-white/20 px-3 py-1.5 text-xs text-white hover:bg-white/30"
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </a>
    </div>
  )
}

export function AttachmentLightbox({
  refs,
  initialIndex = 0,
  config,
  onClose
}: AttachmentLightboxProps): React.JSX.Element | null {
  const clamped = refs.length ? Math.min(Math.max(initialIndex, 0), refs.length - 1) : 0
  const [index, setIndex] = useState(clamped)
  const rootRef = useRef<HTMLDivElement>(null)

  // Focus the overlay so Escape/arrows land here without a click first.
  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  const count = refs.length
  const go = useCallback(
    (delta: number) => {
      setIndex((i) => (count ? (i + delta + count) % count : 0))
    },
    [count]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'ArrowRight' && count > 1) {
        go(1)
      } else if (e.key === 'ArrowLeft' && count > 1) {
        go(-1)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [go, onClose, count])

  const current = useMemo(() => refs[index], [refs, index])
  if (!current) return null

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
      data-testid="lightbox"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 outline-none"
      onClick={onClose}
    >
      {/* Stop backdrop-close when interacting with the slide itself. */}
      <div
        className="flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <Slide fileRef={current} config={config} />
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous attachment"
            className="absolute left-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            onClick={(e) => {
              e.stopPropagation()
              go(-1)
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next attachment"
            className="absolute right-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div
            data-testid="lightbox-counter"
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white"
          >
            {index + 1} / {count}
          </div>
        </>
      )}

      <div className="absolute top-4 right-4 flex items-center gap-2">
        <DownloadLink fileRef={current} config={config} />
        <button
          type="button"
          aria-label="Close image"
          className="rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

/** Download affordance in the toolbar; needs the resolved URL, hence a hook. */
function DownloadLink({
  fileRef,
  config
}: {
  fileRef: FileRef
  config?: Record<string, unknown>
}): React.JSX.Element | null {
  const url = useFileUrl(fileRef, config)
  if (!url) return null
  return (
    <a
      href={url}
      download={fileRef.name}
      aria-label={`Download ${fileRef.name}`}
      className="rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
      onClick={(e) => e.stopPropagation()}
    >
      <Download className="h-5 w-5" />
    </a>
  )
}

export default AttachmentLightbox
