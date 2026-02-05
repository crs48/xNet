/**
 * ImageNodeView - React NodeView for the image extension.
 *
 * Features:
 * - Upload progress indicator
 * - Resize handles (left/right)
 * - Alignment toolbar (left/center/right/full)
 * - Accessible alt text
 * - CID-based blob URL resolution
 */
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import * as React from 'react'
import { useBlobService } from '../../context/BlobContext'
import { cn } from '../../utils'

const ALIGNMENTS: Record<string, string> = {
  left: 'mr-auto',
  center: 'mx-auto',
  right: 'ml-auto'
}

export function ImageNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, title, width, height, alignment, uploadProgress, cid } = node.attrs
  const blobService = useBlobService()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const imgRef = React.useRef<HTMLImageElement>(null)
  const [resizeWidth, setResizeWidth] = React.useState<number | null>(null)
  const resizeWidthRef = React.useRef<number | null>(null) // Track latest value for mouseup handler
  const [resolvedSrc, setResolvedSrc] = React.useState<string | null>(null)
  const [loadError, setLoadError] = React.useState(false)
  const [naturalWidth, setNaturalWidth] = React.useState<number | null>(null)
  const isResizing = resizeWidth !== null

  // Keep ref in sync with state
  React.useEffect(() => {
    resizeWidthRef.current = resizeWidth
  }, [resizeWidth])

  // Resolve CID to blob URL when cid changes
  // Retries with exponential backoff if blob not found (may be syncing)
  React.useEffect(() => {
    // If we have a CID, we must resolve it - don't use stale blob URLs
    if (cid) {
      if (!blobService) {
        // Waiting for blob service - don't set a stale src
        setResolvedSrc(null)
        return
      }

      let cancelled = false
      let retryCount = 0
      const maxRetries = 5
      const baseDelay = 1000 // 1 second

      const resolveBlob = async () => {
        try {
          const url = await blobService!.getUrl({
            cid,
            name: alt || 'image',
            mimeType: 'image/*',
            size: 0
          })
          if (!cancelled) {
            setResolvedSrc(url)
            setLoadError(false)
          }
        } catch {
          if (!cancelled && retryCount < maxRetries) {
            // Retry with exponential backoff
            retryCount++
            const delay = baseDelay * Math.pow(2, retryCount - 1)
            setTimeout(() => {
              if (!cancelled) {
                resolveBlob()
              }
            }, delay)
          } else if (!cancelled) {
            setResolvedSrc(null)
            setLoadError(true)
          }
        }
      }

      resolveBlob()

      return () => {
        cancelled = true
      }
    }

    // No CID - use src directly (external images)
    // But ignore blob: URLs without a CID - they're stale
    if (src && !src.startsWith('blob:')) {
      setResolvedSrc(src)
    } else {
      setResolvedSrc(null)
    }
  }, [cid, blobService, src, alt])

  // The actual src to use for the image
  const imageSrc = resolvedSrc

  // Handle resize via mouse drag
  const handleResizeStart = React.useCallback(
    (e: React.MouseEvent, direction: 'left' | 'right') => {
      e.preventDefault()
      e.stopPropagation()

      const startX = e.clientX
      const startWidth = containerRef.current?.offsetWidth || width || 400
      // Use natural width as max, fall back to stored width from upload, then 1200
      const maxWidth = naturalWidth || (height ? width : null) || 1200

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta =
          direction === 'right' ? moveEvent.clientX - startX : startX - moveEvent.clientX

        const newWidth = Math.max(100, Math.min(startWidth + delta * 2, maxWidth))
        setResizeWidth(newWidth)
        resizeWidthRef.current = newWidth // Update ref immediately for mouseup
      }

      const handleMouseUp = () => {
        // Use ref to get the latest value (state may be stale in closure)
        const finalWidth = resizeWidthRef.current
        if (finalWidth !== null) {
          updateAttributes({ width: finalWidth })
        }
        setResizeWidth(null)
        resizeWidthRef.current = null
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [width, height, naturalWidth, updateAttributes]
  )

  // Upload progress state
  if (uploadProgress !== null && uploadProgress !== undefined) {
    return (
      <NodeViewWrapper>
        <div
          className={cn(
            'relative bg-gray-100 dark:bg-gray-800 rounded-lg',
            'flex items-center justify-center',
            ALIGNMENTS[alignment || 'center']
          )}
          style={{ width: width || 300, height: height || 200 }}
        >
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 text-gray-400">
              <svg className="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
            <p className="text-sm text-gray-500">Uploading{alt ? ` ${alt}` : ''}...</p>
          </div>
        </div>
      </NodeViewWrapper>
    )
  }

  // No src and no CID - broken image
  // Also show loading state while resolving CID
  if (!imageSrc && !cid) {
    return (
      <NodeViewWrapper>
        <div
          className={cn(
            'relative bg-gray-100 dark:bg-gray-800 rounded-lg',
            'flex items-center justify-center text-gray-400',
            ALIGNMENTS[alignment || 'center']
          )}
          style={{ width: width || 300, height: height || 200 }}
        >
          <span className="text-sm">Image not available</span>
        </div>
      </NodeViewWrapper>
    )
  }

  // Loading state while resolving CID
  if (cid && !imageSrc && !loadError) {
    return (
      <NodeViewWrapper>
        <div
          className={cn(
            'relative bg-gray-100 dark:bg-gray-800 rounded-lg',
            'flex items-center justify-center',
            ALIGNMENTS[alignment || 'center']
          )}
          style={{ width: width || 300, height: height || 200 }}
        >
          <div className="text-center">
            <div className="w-8 h-8 mx-auto text-gray-400 animate-pulse">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
              </svg>
            </div>
            <p className="text-xs text-gray-400 mt-1">Loading...</p>
          </div>
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div
        ref={containerRef}
        className={cn(
          'relative group',
          ALIGNMENTS[alignment || 'center'],
          selected && 'ring-2 ring-blue-500 ring-offset-2 rounded-lg'
        )}
        style={{ width: isResizing ? resizeWidth : width || 'auto' }}
        data-drag-handle
      >
        {/* Image */}
        <img
          ref={imgRef}
          src={imageSrc || ''}
          alt={alt || ''}
          title={title || undefined}
          className="max-w-full h-auto rounded-lg"
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget
            if (img.naturalWidth > 0) {
              setNaturalWidth(img.naturalWidth)
            }
          }}
        />

        {/* Resize handles (visible on selection) */}
        {selected && (
          <>
            {/* Left handle */}
            <div
              className={cn(
                'absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
                'w-3 h-12 bg-blue-500 rounded-full cursor-ew-resize',
                'opacity-0 group-hover:opacity-100 transition-opacity'
              )}
              onMouseDown={(e) => {
                e.stopPropagation()
                handleResizeStart(e, 'left')
              }}
              draggable={false}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize image left"
            />
            {/* Right handle */}
            <div
              className={cn(
                'absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
                'w-3 h-12 bg-blue-500 rounded-full cursor-ew-resize',
                'opacity-0 group-hover:opacity-100 transition-opacity'
              )}
              onMouseDown={(e) => {
                e.stopPropagation()
                handleResizeStart(e, 'right')
              }}
              draggable={false}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize image right"
            />
          </>
        )}

        {/* Alignment toolbar (visible on selection) */}
        {selected && (
          <div
            className={cn(
              'absolute -top-10 left-1/2 -translate-x-1/2',
              'flex items-center gap-1 p-1',
              'bg-white dark:bg-gray-800 rounded-lg shadow-lg',
              'border border-gray-200 dark:border-gray-700'
            )}
          >
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => updateAttributes({ alignment: align })}
                className={cn(
                  'p-1.5 rounded',
                  alignment === align
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
                    : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                )}
                aria-label={`Align ${align}`}
                aria-pressed={alignment === align}
              >
                <AlignIcon type={align} />
              </button>
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

function AlignIcon({ type }: { type: 'left' | 'center' | 'right' }) {
  const paths: Record<string, string> = {
    left: 'M3 6h18M3 12h12M3 18h18',
    center: 'M3 6h18M6 12h12M3 18h18',
    right: 'M3 6h18M9 12h12M3 18h18'
  }

  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeWidth={2} d={paths[type]} />
    </svg>
  )
}
