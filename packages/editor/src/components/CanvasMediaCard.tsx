/**
 * CanvasMediaCard - Shared media/PDF canvas card (exploration 0277, W3+M1).
 *
 * Extracted from the web CanvasView so both the web and desktop canvases
 * render dropped files identically: image previews resolved through the
 * BlobService, storage-policy badges, and the PDF page viewer.
 *
 * Moderation (M1): the card routes every visual preview through the
 * optional `mediaGate` slot. The web app passes its `ModeratedMedia` gate;
 * a platform without a moderation stack omits the prop and renders
 * ungated. Wiring the gate here means a future surface cannot ship an
 * unfiltered media preview by accident.
 */

import type { CanvasNode, CanvasPdfPageThumbnail } from '@xnetjs/canvas'
import type { BlobService, FileRef } from '@xnetjs/data'
import type { CSSProperties, JSX, ReactElement, ReactNode } from 'react'
import { CanvasPdfPageViewer, createCanvasPdfPageAnchorId } from '@xnetjs/canvas'
import { FileImage, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { CanvasFailedCardActions, CanvasLifecycleStatusBadge } from './CanvasExternalReferenceCard'

export type CanvasMediaGate = (input: { node: CanvasNode; children: ReactNode }) => ReactElement

export type UpdateCanvasNodeProperties = (
  nodeId: string,
  properties: Record<string, unknown>
) => void

export interface CanvasMediaCardProps {
  node: CanvasNode
  title: string
  status: string | null
  themeMode: 'light' | 'dark'
  blobService: BlobService | null
  onUpdateNodeProperties: UpdateCanvasNodeProperties
  /** Moderation gate wrapped around every media preview (M1). */
  mediaGate?: CanvasMediaGate
}

function getStringProperty(node: CanvasNode, key: string): string | null {
  const value = node.properties[key]

  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getNumberProperty(node: CanvasNode, key: string): number | null {
  const value = node.properties[key]

  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isFileRef(value: unknown): value is FileRef {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.cid === 'string' &&
    typeof record.name === 'string' &&
    typeof record.mimeType === 'string' &&
    typeof record.size === 'number'
  )
}

function getMediaFileRef(node: CanvasNode): FileRef | null {
  const file = node.properties.file

  return isFileRef(file) ? file : null
}

function getMediaObjectFit(node: CanvasNode): CSSProperties['objectFit'] {
  const objectFit = node.properties.objectFit

  return objectFit === 'cover' || objectFit === 'fill' ? objectFit : 'contain'
}

export function isPdfMediaNode(node: CanvasNode): boolean {
  return getStringProperty(node, 'mimeType') === 'application/pdf'
}

function formatFileSize(size: number | null): string | null {
  if (size === null || size <= 0) {
    return null
  }

  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`
  }

  return `${Math.round(size / 1024 / 102.4) / 10} MB`
}

function getStoragePolicyLabel(node: CanvasNode): string {
  const storagePolicy = getStringProperty(node, 'storagePolicy')
  const syncsBytes = node.properties.syncsBytes === true

  if (storagePolicy === 'synced-blob' || syncsBytes) {
    return 'Synced'
  }

  if (storagePolicy === 'blocked') {
    return 'Blocked'
  }

  if (storagePolicy === 'copied-blob') {
    return 'Local copy'
  }

  if (storagePolicy === 'reference-only') {
    return 'Local-only'
  }

  return 'Not synced'
}

function getPdfPageCount(node: CanvasNode): number {
  const pageCount = getNumberProperty(node, 'pageCount')

  return Math.max(1, Math.min(12, Math.round(pageCount ?? 1)))
}

function getPdfPageNumber(node: CanvasNode): number {
  const pageNumber = getNumberProperty(node, 'pageNumber')

  return Math.max(1, Math.min(getPdfPageCount(node), Math.round(pageNumber ?? 1)))
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function createPdfPlaceholderThumbnail(input: {
  title: string
  pageNumber: number
  themeMode: 'light' | 'dark'
}): CanvasPdfPageThumbnail {
  const background = input.themeMode === 'dark' ? '#111827' : '#f8fafc'
  const foreground = input.themeMode === 'dark' ? '#f8fafc' : '#0f172a'
  const muted = input.themeMode === 'dark' ? '#64748b' : '#94a3b8'
  const title = escapeSvgText(input.title)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="320" viewBox="0 0 240 320">
<rect width="240" height="320" rx="14" fill="${background}"/>
<rect x="28" y="36" width="184" height="22" rx="4" fill="${muted}"/>
<rect x="28" y="78" width="132" height="12" rx="3" fill="${muted}" opacity="0.72"/>
<rect x="28" y="104" width="168" height="12" rx="3" fill="${muted}" opacity="0.5"/>
<rect x="28" y="130" width="148" height="12" rx="3" fill="${muted}" opacity="0.5"/>
<text x="120" y="252" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="${foreground}">${input.pageNumber}</text>
<text x="120" y="284" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="${muted}">${title}</text>
</svg>`

  return {
    pageNumber: input.pageNumber,
    width: 240,
    height: 320,
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    mimeType: 'image/png'
  }
}

function getPdfThumbnails(
  node: CanvasNode,
  title: string,
  themeMode: 'light' | 'dark'
): CanvasPdfPageThumbnail[] {
  const thumbnailDataUrl = getStringProperty(node, 'thumbnailDataUrl')
  const thumbnailWidth = getNumberProperty(node, 'thumbnailWidth') ?? 240
  const thumbnailHeight = getNumberProperty(node, 'thumbnailHeight') ?? 320

  if (thumbnailDataUrl) {
    return [
      {
        pageNumber: getPdfPageNumber(node),
        width: thumbnailWidth,
        height: thumbnailHeight,
        dataUrl: thumbnailDataUrl,
        mimeType: 'image/png'
      }
    ]
  }

  return Array.from({ length: getPdfPageCount(node) }, (_, index) =>
    createPdfPlaceholderThumbnail({
      title,
      pageNumber: index + 1,
      themeMode
    })
  )
}

function gateMedia(
  mediaGate: CanvasMediaGate | undefined,
  node: CanvasNode,
  children: ReactElement
): ReactElement {
  return mediaGate ? mediaGate({ node, children }) : children
}

export function CanvasMediaCard({
  node,
  title,
  status,
  themeMode,
  blobService,
  onUpdateNodeProperties,
  mediaGate
}: CanvasMediaCardProps): JSX.Element {
  const fileRef = getMediaFileRef(node)
  const mimeType = getStringProperty(node, 'mimeType')
  const mediaKind = getStringProperty(node, 'kind') ?? 'file'
  const fileSize = formatFileSize(getNumberProperty(node, 'size'))
  const storageLabel = getStoragePolicyLabel(node)
  const errorMessage = getStringProperty(node, 'error')
  const localPreviewUrl = getStringProperty(node, 'localPreviewUrl')
  const thumbnailDataUrl = getStringProperty(node, 'thumbnailDataUrl')
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    setFileUrl(null)
    if (!blobService || !fileRef || mediaKind !== 'image') {
      return () => {
        cancelled = true
      }
    }

    void blobService
      .getUrl(fileRef)
      .then((url) => {
        if (!cancelled) {
          setFileUrl(url)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFileUrl(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [blobService, fileRef, mediaKind])

  if (isPdfMediaNode(node)) {
    return (
      <div
        className="flex h-full flex-col gap-3 overflow-hidden rounded-[22px] border border-border/70 bg-background p-3 shadow-lg shadow-black/5"
        data-canvas-node-card="true"
        data-canvas-card-kind="media"
        data-canvas-media-kind="pdf"
        data-canvas-storage-policy={getStringProperty(node, 'storagePolicy') ?? 'unknown'}
        data-canvas-theme={themeMode}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <FileText size={12} />
            PDF
          </span>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {storageLabel}
            </span>
            <CanvasLifecycleStatusBadge status={status} />
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {gateMedia(
            mediaGate,
            node,
            <CanvasPdfPageViewer
              title={title}
              thumbnails={getPdfThumbnails(node, title, themeMode)}
              selectedPageNumber={getPdfPageNumber(node)}
              themeMode={themeMode}
              onSelectPage={(pageNumber) =>
                onUpdateNodeProperties(node.id, {
                  pageNumber,
                  pageAnchorId: createCanvasPdfPageAnchorId({
                    objectId: node.id,
                    pageNumber,
                    placement: 'center'
                  })
                })
              }
            />
          )}
        </div>
        {status === 'error' && errorMessage ? (
          <p className="text-xs leading-relaxed text-destructive">{errorMessage}</p>
        ) : null}
      </div>
    )
  }

  const alt = getStringProperty(node, 'alt') ?? title
  const caption = getStringProperty(node, 'caption')
  const imagePreviewUrl = fileUrl ?? localPreviewUrl ?? thumbnailDataUrl

  return (
    <div
      className="flex h-full flex-col justify-between gap-3 overflow-hidden rounded-[22px] border border-border/70 bg-background p-4 shadow-lg shadow-black/5"
      data-canvas-node-card="true"
      data-canvas-card-kind="media"
      data-canvas-media-kind={mediaKind}
      data-canvas-storage-policy={getStringProperty(node, 'storagePolicy') ?? 'unknown'}
      data-canvas-theme={themeMode}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <FileImage size={12} />
          {mediaKind === 'image' ? 'Image' : 'File'}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {storageLabel}
          </span>
          <CanvasLifecycleStatusBadge status={status} />
        </div>
      </div>

      {mediaKind === 'image' && imagePreviewUrl ? (
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl bg-muted/40">
          {gateMedia(
            mediaGate,
            node,
            <img
              src={imagePreviewUrl}
              alt={alt}
              className="h-full w-full"
              style={{ objectFit: getMediaObjectFit(node) }}
              data-canvas-media-thumbnail="true"
            />
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="text-lg font-semibold leading-tight text-foreground">{title}</div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {[mediaKind, mimeType, fileSize].filter(Boolean).join(' · ') || 'Dropped media or file'}
        </p>
        {caption ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{caption}</p>
        ) : null}
        {status === 'error' && errorMessage ? (
          <p className="text-xs leading-relaxed text-destructive">{errorMessage}</p>
        ) : null}
        {status === 'error' ? (
          <CanvasFailedCardActions
            url={typeof node.properties.url === 'string' ? node.properties.url : null}
            themeMode={themeMode}
          />
        ) : null}
      </div>
    </div>
  )
}
